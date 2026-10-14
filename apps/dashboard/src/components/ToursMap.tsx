import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { RescueTour } from '../api/client';
import { formatRelativeTime } from '../relativeTime';
import { interpolatePosition, splitTrackAt, trackTimeRange } from './trackTime';

// MVP-Region Oberallgäu (siehe ADR 0003) als Standardausschnitt, solange keine Touren mit
// Standort vorliegen.
const DEFAULT_CENTER: [number, number] = [10.2247, 47.5556];
const DEFAULT_ZOOM = 10;

// Akzentfarbe für die ausgewählte Tour (Zeitstrahl) - bewusst anders als die Status-Farben
// (dunkelblau=aktiv/grau=beendet), damit klar ist: das ist die gerade betrachtete Tour.
const SELECTED_TRAVERSED_COLOR = '#2563eb';
const SELECTED_UPCOMING_COLOR = '#93c5fd';

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection' as const, features: [] };

interface ToursMapProps {
  tours: RescueTour[];
  selectedTourId: string | null;
  onSelectTour: (id: string) => void;
  hoverTimestampMs: number | null;
}

function boundsForTours(tours: RescueTour[]): maplibregl.LngLatBounds | null {
  const toursWithLocation = tours.filter((t) => t.lastPing !== null);
  if (toursWithLocation.length === 0) return null;

  const bounds = new maplibregl.LngLatBounds();
  for (const t of toursWithLocation) {
    for (const point of t.track) {
      bounds.extend([point.longitude, point.latitude]);
    }
  }
  return bounds;
}

// Eine Linie pro Tour statt einer durchgehenden - sonst würde MapLibre zwischen den Touren
// querfeldein verbindende Linien zeichnen. Touren mit nur einem Ping ergeben keine sinnvolle
// Linie und werden ausgelassen (der Marker zeigt sie trotzdem). Die für den Zeitstrahl
// ausgewählte Tour wird ausgeklammert - für sie zeichnet die eigene "selected-track"-Quelle
// unten die nach Zeitpunkt aufgeteilte (zurückgelegt/bevorstehend) Linie.
function tracksGeoJson(tours: RescueTour[], excludeTourId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: tours
      .filter((t) => t.track.length > 1 && t.id !== excludeTourId)
      .map((t) => ({
        type: 'Feature' as const,
        properties: { status: t.status },
        geometry: {
          type: 'LineString' as const,
          coordinates: t.track.map(
            (point) => [point.longitude, point.latitude] as [number, number],
          ),
        },
      })),
  };
}

// Für die ausgewählte Tour: Linie am Zeitstrahl-Zeitpunkt in "zurückgelegt" (dunkel/deckend)
// und "bevorstehend" (hell/gestrichelt) aufgeteilt - macht den Routenverlauf bis zu einer
// bestimmten Uhrzeit auf einen Blick sichtbar.
function selectedTrackGeoJson(track: RescueTour['track'], timestampMs: number) {
  const { traversed, upcoming } = splitTrackAt(track, timestampMs);
  return {
    type: 'FeatureCollection' as const,
    features: [
      traversed.length > 1
        ? {
            type: 'Feature' as const,
            properties: { segment: 'traversed' },
            geometry: { type: 'LineString' as const, coordinates: traversed },
          }
        : null,
      upcoming.length > 1
        ? {
            type: 'Feature' as const,
            properties: { segment: 'upcoming' },
            geometry: { type: 'LineString' as const, coordinates: upcoming },
          }
        : null,
    ].filter((f): f is NonNullable<typeof f> => f !== null),
  };
}

// Eigener Punkt-Marker (statt des Standard-Pins) für die Position der ausgewählten Tour beim
// Ziehen am Zeitstrahl - visuell bewusst anders als der Pin, damit klar bleibt: das ist der
// Zeitstrahl-Punkt, nicht der zuletzt bekannte Standort (der bleibt als eigener Pin stehen).
function createScrubDotElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '16px';
  el.style.height = '16px';
  el.style.borderRadius = '9999px';
  el.style.background = '#fff';
  el.style.border = `3px solid ${SELECTED_TRAVERSED_COLOR}`;
  el.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.4)';
  return el;
}

// Eigenes Control statt eines Fix-Aufrufs bei jedem Daten-Update: Nutzer sollen die Karte frei
// drehen/verschieben können, ohne dass ein Hintergrund-Refresh die Ansicht zurücksetzt (siehe
// Kommentar unten bei fitBounds). Dafür braucht es einen expliziten, manuellen Weg zurück.
class RecenterControl implements maplibregl.IControl {
  private map: maplibregl.Map | null = null;
  private container: HTMLDivElement | null = null;
  private getTours: () => RescueTour[];

  constructor(getTours: () => RescueTour[]) {
    this.getTours = getTours;
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Auf Touren zentrieren';
    button.textContent = '⤢';
    button.style.fontSize = '16px';
    button.onclick = () => {
      const bounds = boundsForTours(this.getTours());
      if (bounds && this.map) {
        this.map.fitBounds(bounds, { padding: 60, maxZoom: 14, pitch: this.map.getPitch() });
      }
    };

    this.container.appendChild(button);
    return this.container;
  }

  onRemove(): void {
    this.container?.remove();
    this.map = null;
  }
}

function ToursMap({ tours, selectedTourId, onSelectTour, hoverTimestampMs }: ToursMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hasFitBoundsRef = useRef(false);

  // Gespiegelt in Refs statt nur als Props gelesen: der "sync"-Callback unten wird auch aus dem
  // 'load'-Handler der Karte heraus aufgerufen (im ersten, nur einmal laufenden Effect
  // registriert) - zum Zeitpunkt, an dem 'load' tatsächlich feuert, muss er aber die jeweils
  // aktuellen Props sehen, nicht die vom Erst-Render eingefangenen.
  const toursRef = useRef<RescueTour[]>(tours);
  const selectedTourIdRef = useRef(selectedTourId);
  const hoverTimestampMsRef = useRef(hoverTimestampMs);
  const onSelectTourRef = useRef(onSelectTour);
  toursRef.current = tours;
  selectedTourIdRef.current = selectedTourId;
  hoverTimestampMsRef.current = hoverTimestampMs;
  onSelectTourRef.current = onSelectTour;

  // In einem Ref statt direkt im Effect: der Style lädt asynchron (Netzwerk) und kann dabei
  // erst NACH dem ersten Daten-Sync-Effect fertig werden - ohne diesen erneuten Aufruf aus dem
  // 'load'-Handler würden "tracks"/"selected-track" dann dauerhaft leer bleiben, bis die Touren
  // das nächste Mal neu geladen werden (Tab-Wechsel/"Aktualisieren").
  const syncMapDataRef = useRef<() => void>(() => {});
  syncMapDataRef.current = () => {
    const map = mapRef.current;
    if (!map) return;

    const currentTours = toursRef.current;
    const currentSelectedId = selectedTourIdRef.current;
    const currentHoverMs = hoverTimestampMsRef.current;

    const tracksSource = map.getSource<maplibregl.GeoJSONSource>('tracks');
    tracksSource?.setData(tracksGeoJson(currentTours, currentSelectedId));

    const selectedTour = currentTours.find((t) => t.id === currentSelectedId) ?? null;
    const selectedRange = selectedTour ? trackTimeRange(selectedTour.track) : null;
    const selectedTrackSource = map.getSource<maplibregl.GeoJSONSource>('selected-track');
    if (selectedTour && selectedRange) {
      const timestampMs = currentHoverMs ?? selectedRange[1];
      selectedTrackSource?.setData(selectedTrackGeoJson(selectedTour.track, timestampMs));
    } else {
      selectedTrackSource?.setData(EMPTY_FEATURE_COLLECTION);
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const toursWithLocation = currentTours.filter((t) => t.lastPing !== null);

    for (const t of toursWithLocation) {
      const lastPing = t.lastPing;
      if (!lastPing) continue;

      const isSelected = t.id === currentSelectedId;

      // Der zuletzt bekannte Standort bleibt immer an seiner Position stehen (das ist der
      // eigentliche Check-in) - beim Ziehen am Zeitstrahl kommt für die ausgewählte Tour unten
      // ein zweiter, mitfahrender Punkt dazu, statt diesen Pin zu verschieben.
      const marker = new maplibregl.Marker({
        color: isSelected ? SELECTED_TRAVERSED_COLOR : t.status === 'aktiv' ? '#1b2a41' : '#94a3b8',
      })
        .setLngLat([lastPing.longitude, lastPing.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 24 }).setHTML(`
            <strong>${t.displayName ?? 'Ohne Namen hinterlegt'}</strong><br/>
            ${t.phoneNumber}<br/>
            Zuletzt gesehen: ${formatRelativeTime(lastPing.recordedAt)}
          `),
        )
        .addTo(map);

      marker.getElement().style.cursor = 'pointer';
      marker.getElement().addEventListener('click', () => onSelectTourRef.current(t.id));

      markersRef.current.push(marker);

      if (isSelected && currentHoverMs !== null && trackTimeRange(t.track) !== null) {
        const scrubTimeLabel = new Date(currentHoverMs).toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const scrubMarker = new maplibregl.Marker({ element: createScrubDotElement() })
          .setLngLat(interpolatePosition(t.track, currentHoverMs))
          .setPopup(
            new maplibregl.Popup({ offset: 14 }).setHTML(`Standort um ${scrubTimeLabel} Uhr`),
          )
          .addTo(map);

        markersRef.current.push(scrubMarker);
      }
    }

    // Nur beim ersten Laden automatisch auf die Marker zoomen – sonst würde jede
    // Aktualisierung (Tab-Wechsel, "Aktualisieren"-Button) die Kamera zurücksetzen und dabei
    // auch eine von der Bergwacht gedrehte Blickrichtung wieder auf Norden zwingen
    // (fitBounds setzt bearing standardmäßig auf 0, siehe MapLibre-Doku). Danach kann man
    // manuell über den "Auf Touren zentrieren"-Button (RecenterControl) zurückfinden.
    if (!hasFitBoundsRef.current) {
      const bounds = boundsForTours(currentTours);
      if (bounds) {
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 14,
          duration: 0,
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        });
        hasFitBoundsRef.current = true;
      }
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 60,
      bearing: -20,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    map.addControl(new RecenterControl(() => toursRef.current), 'top-left');

    map.on('load', () => {
      // Kostenlose, unauthentifizierte AWS-Open-Data-Höhendaten – kein API-Key nötig.
      map.addSource('terrain', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
      });
      map.setTerrain({ source: 'terrain', exaggeration: 1.3 });

      map.addSource('tracks', { type: 'geojson', data: tracksGeoJson(toursRef.current, null) });
      map.addLayer({
        id: 'tracks-line',
        type: 'line',
        source: 'tracks',
        paint: {
          'line-color': ['match', ['get', 'status'], 'aktiv', '#1b2a41', '#94a3b8'],
          'line-width': 3,
        },
      });

      map.addSource('selected-track', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
      map.addLayer({
        id: 'selected-track-upcoming',
        type: 'line',
        source: 'selected-track',
        filter: ['==', ['get', 'segment'], 'upcoming'],
        paint: {
          'line-color': SELECTED_UPCOMING_COLOR,
          'line-width': 4,
          'line-opacity': 0.7,
          'line-dasharray': [1, 2],
        },
      });
      map.addLayer({
        id: 'selected-track-traversed',
        type: 'line',
        source: 'selected-track',
        filter: ['==', ['get', 'segment'], 'traversed'],
        paint: {
          'line-color': SELECTED_TRAVERSED_COLOR,
          'line-width': 5,
          'line-opacity': 1,
        },
      });

      syncMapDataRef.current();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    syncMapDataRef.current();
  }, [tours, selectedTourId, onSelectTour, hoverTimestampMs]);

  return (
    <div
      ref={containerRef}
      className="h-128 w-full overflow-hidden rounded-lg border border-slate-300"
    />
  );
}

export default ToursMap;
