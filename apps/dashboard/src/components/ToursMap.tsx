import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { RescueTour } from '../api/client';
import { formatRelativeTime } from '../relativeTime';

// MVP-Region Oberallgäu (siehe ADR 0003) als Standardausschnitt, solange keine Touren mit
// Standort vorliegen.
const DEFAULT_CENTER: [number, number] = [10.2247, 47.5556];
const DEFAULT_ZOOM = 10;

interface ToursMapProps {
  tours: RescueTour[];
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
// Linie und werden ausgelassen (der Marker zeigt sie trotzdem).
function tracksGeoJson(tours: RescueTour[]) {
  return {
    type: 'FeatureCollection' as const,
    features: tours
      .filter((t) => t.track.length > 1)
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

function ToursMap({ tours }: ToursMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hasFitBoundsRef = useRef(false);
  const toursRef = useRef<RescueTour[]>(tours);
  toursRef.current = tours;

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

      map.addSource('tracks', { type: 'geojson', data: tracksGeoJson(toursRef.current) });
      map.addLayer({
        id: 'tracks-line',
        type: 'line',
        source: 'tracks',
        paint: {
          'line-color': ['match', ['get', 'status'], 'aktiv', '#1b2a41', '#94a3b8'],
          'line-width': 3,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const tracksSource = map.getSource<maplibregl.GeoJSONSource>('tracks');
    tracksSource?.setData(tracksGeoJson(tours));

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const toursWithLocation = tours.filter((t) => t.lastPing !== null);

    for (const t of toursWithLocation) {
      const lastPing = t.lastPing;
      if (!lastPing) continue;

      const popupHtml = `
        <strong>${t.displayName ?? 'Ohne Namen hinterlegt'}</strong><br/>
        ${t.phoneNumber}<br/>
        Zuletzt gesehen: ${formatRelativeTime(lastPing.recordedAt)}
      `;

      const marker = new maplibregl.Marker({ color: t.status === 'aktiv' ? '#1b2a41' : '#94a3b8' })
        .setLngLat([lastPing.longitude, lastPing.latitude])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setHTML(popupHtml))
        .addTo(map);

      markersRef.current.push(marker);
    }

    // Nur beim ersten Laden automatisch auf die Marker zoomen – sonst würde jede
    // Aktualisierung (Tab-Wechsel, "Aktualisieren"-Button) die Kamera zurücksetzen und dabei
    // auch eine von der Bergwacht gedrehte Blickrichtung wieder auf Norden zwingen
    // (fitBounds setzt bearing standardmäßig auf 0, siehe MapLibre-Doku). Danach kann man
    // manuell über den "Auf Touren zentrieren"-Button (RecenterControl) zurückfinden.
    if (!hasFitBoundsRef.current) {
      const bounds = boundsForTours(tours);
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
  }, [tours]);

  return (
    <div
      ref={containerRef}
      className="h-96 w-full overflow-hidden rounded-lg border border-slate-300"
    />
  );
}

export default ToursMap;
