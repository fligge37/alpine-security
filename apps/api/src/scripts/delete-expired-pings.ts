// Operator-Tool (ADR 0008): löscht location_ping-Daten von Touren, die vor
// mehr als RETENTION_DAYS beendet wurden und nicht per Hold zurückgehalten
// werden (siehe POST/DELETE /rescue/tours/:id/hold). Läuft nicht automatisch -
// muss per externem Cron regelmäßig aufgerufen werden, sobald es einen gibt
// (siehe CLAUDE.md "Offene Punkte": noch keine CI-/Infra-Automatisierung).
//
// Nutzung:
//   pnpm --filter @alpine-security/api exec tsx --env-file=.env \
//     src/scripts/delete-expired-pings.ts

import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { locationPing, tour } from '../db/schema.js';

export const RETENTION_DAYS = 7;

export async function deleteExpiredPings(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const expiredTours = await db
    .select({ id: tour.id })
    .from(tour)
    .where(
      and(eq(tour.status, 'beendet'), lt(tour.endedAt, cutoff), isNull(tour.retentionHoldAt)),
    );

  if (expiredTours.length === 0) return 0;

  const deleted = await db
    .delete(locationPing)
    .where(
      inArray(
        locationPing.tourId,
        expiredTours.map((t) => t.id),
      ),
    )
    .returning({ id: locationPing.id });

  return deleted.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const deleted = await deleteExpiredPings();
  console.log(
    `Deleted ${deleted} location_ping row(s) past the ${RETENTION_DAYS}-day retention window.`,
  );
  process.exit(0);
}
