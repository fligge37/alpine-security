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

// Drei Ansichtsmodi angelehnt an Komoot: "flat" (2D von oben, Standard, leicht zu
// verschieben/zu navigieren) und "terrain" (gekippte 3D-Geländeansicht) teilen sich den
// Vektor-Stil und unterscheiden sich nur in Kamera/Terrain-Exaggeration; "satellite" wechselt
// den kompletten Basis-Stil auf Satellitenbilder.
type ViewMode = 'flat' | 'terrain' | 'satellite';
type BaseStyle = 'vector' | 'satellite';

const VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Satellitenbilder brauchen einen Anbieter mit kommerziell nutzbarer Lizenz und aktuellen
// Daten (siehe CLAUDE.md "Offene Punkte": der kostenlose, keylose EOX-Anbieter ist nur für die
// veralteten 2016/17er-Bilder kommerziell lizenziert) - dafür ist ein MapTiler-API-Key nötig,
// den es pro Deployment über VITE_MAPTILER_KEY geben muss (siehe .env.example). Ohne Key bleibt
// der Satellit-Button deaktiviert statt gegen eine ungültige URL zu laden.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const SATELLITE_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`
  : null;

function baseStyleForMode(mode: ViewMode): BaseStyle {
  return mode === 'satellite' ? 'satellite' : 'vector';
}

function styleUrlForBaseStyle(baseStyle: BaseStyle): string {
  return baseStyle === 'satellite' && SATELLITE_STYLE_URL ? SATELLITE_STYLE_URL : VECTOR_STYLE_URL;
}

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

// Komoot-artiger Ansichts-Umschalter: 2D-Karte (Standard), gekippte 3D-Geländeansicht, Satellit.
// Als eigenes Control statt als React-UI über der Karte, damit es sich wie die übrigen
// MapLibre-Controls (Zoom, Recenter) verhält und nicht bei jedem React-Render neu aufgebaut wird.
class ViewModeControl implements maplibregl.IControl {
  private container: HTMLDivElement | null = null;
  private buttons = new Map<ViewMode, HTMLButtonElement>();
  private onChange: (mode: ViewMode) => void;

  constructor(onChange: (mode: ViewMode) => void) {
    this.onChange = onChange;
  }

  onAdd(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const modes: { mode: ViewMode; icon: string; title: string }[] = [
      { mode: 'flat', icon: '🗺️', title: 'Karte (2D)' },
      { mode: 'terrain', icon: '⛰️', title: 'Gelände (3D)' },
      {
        mode: 'satellite',
        icon: '🛰️',
        title: SATELLITE_STYLE_URL ? 'Satellit' : 'Satellit (VITE_MAPTILER_KEY fehlt)',
      },
    ];

    for (const { mode, icon, title } of modes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.textContent = icon;
      button.style.fontSize = '15px';
      if (mode === 'satellite' && !SATELLITE_STYLE_URL) {
        button.disabled = true;
        button.style.opacity = '0.4';
        button.style.cursor = 'not-allowed';
      } else {
        button.onclick = () => this.onChange(mode);
      }
      this.buttons.set(mode, button);
      this.container.appendChild(button);
    }

    return this.container;
  }

  onRemove(): void {
    this.container?.remove();
    this.buttons.clear();
  }

  setActive(mode: ViewMode): void {
    for (const [buttonMode, button] of this.buttons) {
      button.style.background = buttonMode === mode ? '#dbeafe' : '';
    }
  }
}

function ToursMap({ tours, selectedTourId, onSelectTour, hoverTimestampMs }: ToursMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hasFitBoundsRef = useRef(false);
  const viewModeRef = useRef<ViewMode>('flat');
  const baseStyleRef = useRef<BaseStyle>('vector');
  const viewModeControlRef = useRef<ViewModeControl | null>(null);

  // Gespiegelt in Refs statt nur als Props gelesen: der "sync"-Callback unten wird auch aus dem
  // 'style.load'-Handler der Karte heraus aufgerufen (im ersten, nur einmal laufenden Effect
  // registriert) - zum Zeitpunkt, an dem 'style.load' tatsächlich feuert, muss er aber die
  // jeweils aktuellen Props sehen, nicht die vom Erst-Render eingefangenen.
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
  // 'style.load'-Handler würden "tracks"/"selected-track" dann dauerhaft leer bleiben, bis die
  // Touren das nächste Mal neu geladen werden (Tab-Wechsel/"Aktualisieren") - und nach einem
  // Stil-Wechsel (2D/Satellit) wären sie komplett verschwunden, da setStyle alle zuvor
  // hinzugefügten Quellen/Layer verwirft.
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

  // Fügt die eigenen Quellen/Layer (Terrain-DEM, Touren-Tracks, Zeitstrahl-Track) hinzu - wird
  // nicht nur beim ersten Laden gebraucht, sondern nach JEDEM Stil-Wechsel erneut, weil
  // map.setStyle() (2D <-> Satellit) alle zuvor hinzugefügten Quellen/Layer verwirft.
  const addOverlayLayersRef = useRef<(map: maplibregl.Map) => void>(() => {});
  addOverlayLayersRef.current = (map: maplibregl.Map) => {
    if (!map.getSource('terrain')) {
      // Kostenlose, unauthentifizierte AWS-Open-Data-Höhendaten – kein API-Key nötig.
      map.addSource('terrain', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
      });
    }

    if (!map.getSource('tracks')) {
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
    }

    if (!map.getSource('selected-track')) {
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
    }
  };

  // Setzt Kamera-Neigung und Terrain-Überhöhung passend zum Ansichtsmodus - "flat" und
  // "satellite" sind beide senkrecht von oben (wie bei Komoot bleibt auch die Satellitenansicht
  // flach), nur "terrain" kippt die Kamera und übertreibt die Höhendaten.
  const applyCameraRef = useRef<(map: maplibregl.Map, mode: ViewMode) => void>(() => {});
  applyCameraRef.current = (map: maplibregl.Map, mode: ViewMode) => {
    if (mode === 'terrain') {
      map.setTerrain({ source: 'terrain', exaggeration: 1.3 });
      map.easeTo({ pitch: 60, duration: 500 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  };

  const handleModeChangeRef = useRef<(mode: ViewMode) => void>(() => {});
  handleModeChangeRef.current = (mode: ViewMode) => {
    const map = mapRef.current;
    if (!map || viewModeRef.current === mode) return;

    viewModeRef.current = mode;
    viewModeControlRef.current?.setActive(mode);

    const targetBaseStyle = baseStyleForMode(mode);
    if (baseStyleRef.current !== targetBaseStyle) {
      baseStyleRef.current = targetBaseStyle;
      // Overlays/Kamera werden im 'style.load'-Handler neu aufgebaut, sobald der neue Stil
      // geladen ist (siehe addOverlayLayersRef/applyCameraRef dort).
      map.setStyle(styleUrlForBaseStyle(targetBaseStyle));
    } else {
      applyCameraRef.current(map, mode);
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: VECTOR_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    map.addControl(new RecenterControl(() => toursRef.current), 'top-left');

    const viewModeControl = new ViewModeControl((mode) => handleModeChangeRef.current(mode));
    viewModeControlRef.current = viewModeControl;
    map.addControl(viewModeControl, 'top-left');

    // Feuert beim ersten Laden UND nach jedem map.setStyle()-Wechsel (2D <-> Satellit) - deshalb
    // hier statt in 'load' sowohl die eigenen Overlays neu aufbauen als auch Kamera/Terrain für
    // den aktuell gewählten Modus anwenden.
    map.on('style.load', () => {
      addOverlayLayersRef.current(map);
      applyCameraRef.current(map, viewModeRef.current);
      syncMapDataRef.current();
    });

    mapRef.current = map;
    viewModeControl.setActive('flat');

    return () => {
      map.remove();
      mapRef.current = null;
      viewModeControlRef.current = null;
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
