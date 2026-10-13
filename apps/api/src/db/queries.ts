import { sql } from 'drizzle-orm';
import { db } from './client.js';

interface PingRow extends Record<string, unknown> {
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: string | null;
}

export interface PingPoint {
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
}

// Pings aufsteigend nach Zeit sortiert, für den Wegeverlauf als Linie (Angehörigen-Link und
// Bergwacht-Dashboard) - der letzte Eintrag ist damit zugleich der aktuelle Standort.
export async function getPingTrack(tourId: string): Promise<PingPoint[]> {
  const result = await db.execute<PingRow>(sql`
    SELECT recorded_at, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude, accuracy_meters
    FROM location_ping
    WHERE tour_id = ${tourId}
    ORDER BY recorded_at ASC
  `);

  return result.rows.map((row) => ({
    recordedAt: row.recorded_at,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters ? Number(row.accuracy_meters) : null,
  }));
}
