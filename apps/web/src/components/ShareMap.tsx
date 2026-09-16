import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { TrackPoint } from '../api/client';

// MVP-Region Oberallgäu (siehe ADR 0003) als Standardausschnitt, solange keine Pings vorliegen.
const DEFAULT_CENTER: [number, number] = [10.2247, 47.5556];
const DEFAULT_ZOOM = 10;

interface ShareMapProps {
  track: TrackPoint[];
}

function boundsForTrack(track: TrackPoint[]): maplibregl.LngLatBounds | null {
  if (track.length === 0) return null;

  const bounds = new maplibregl.LngLatBounds();
  for (const point of track) {
    bounds.extend([point.longitude, point.latitude]);
  }
  return bounds;
}

function trackGeoJson(track: TrackPoint[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: track.map((point) => [point.longitude, point.latitude] as [number, number]),
    },
  };
}

function ShareMap({ track }: ShareMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const bounds = boundsForTrack(track);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 60,
      bearing: -20,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));

    map.on('load', () => {
      // Kostenlose, unauthentifizierte AWS-Open-Data-Höhendaten – kein API-Key nötig.
      map.addSource('terrain', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
      });
      map.setTerrain({ source: 'terrain', exaggeration: 1.3 });

      map.addSource('track', { type: 'geojson', data: trackGeoJson(track) });
      map.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track',
        paint: { 'line-color': '#1b2a41', 'line-width': 3 },
      });

      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Karte wird einmalig aufgebaut (mit dem Track-Stand beim Mount); Updates laufen
    // über den zweiten Effect unten, analog zu ToursMap im Dashboard.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRef.current?.remove();
    markerRef.current = null;

    const lastPoint = track[track.length - 1];
    if (lastPoint) {
      markerRef.current = new maplibregl.Marker({ color: '#1b2a41' })
        .setLngLat([lastPoint.longitude, lastPoint.latitude])
        .addTo(map);
    }

    const source = map.getSource<maplibregl.GeoJSONSource>('track');
    source?.setData(trackGeoJson(track));
  }, [track]);

  return (
    <div
      ref={containerRef}
      className="h-72 w-full overflow-hidden rounded-lg border border-slate-300"
    />
  );
}

export default ShareMap;
