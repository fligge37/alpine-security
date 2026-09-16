import { randomBytes } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, eq, gt, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appUser, tour } from '../db/schema.js';
import { requireUser } from '../plugins/auth.js';

// Gültigkeitsfenster aus ADR 0006: Link funktioniert während der aktiven Tour,
// danach noch für eine Karenzzeit, damit Angehörige den "sicher beendet"-Status
// sehen können, bevor der Link automatisch abläuft.
const SHARE_LINK_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

const TourIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

const ShareTokenParams = Type.Object({
  token: Type.String({ minLength: 1 }),
});

// 24 zufällige Bytes (~192 Bit Entropie), Base64url-kodiert – gegen Erraten/
// Bruteforcing der Link-ID (ADR 0006), kein sequentielles Format.
function generateShareToken(): string {
  return randomBytes(24).toString('base64url');
}

interface PingRow extends Record<string, unknown> {
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: string | null;
}

async function getPingTrack(tourId: string) {
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

const shareRoutes: FastifyPluginAsyncTypebox = async (server) => {
  // Erzeugt einen neuen Link oder rotiert einen bestehenden (ein Link pro Tour,
  // ADR 0006) – der vorherige Token wird dadurch sofort ungültig.
  server.post(
    '/tours/:id/share',
    { schema: { params: TourIdParams }, preHandler: server.authenticate },
    async (request, reply) => {
      const { userId } = requireUser(request);

      const [updated] = await db
        .update(tour)
        .set({ shareToken: generateShareToken() })
        .where(and(eq(tour.id, request.params.id), eq(tour.userId, userId)))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'tour_not_found' });
      }

      return reply.send(updated);
    },
  );

  server.delete(
    '/tours/:id/share',
    { schema: { params: TourIdParams }, preHandler: server.authenticate },
    async (request, reply) => {
      const { userId } = requireUser(request);

      const [updated] = await db
        .update(tour)
        .set({ shareToken: null })
        .where(and(eq(tour.id, request.params.id), eq(tour.userId, userId)))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'tour_not_found' });
      }

      return reply.send(updated);
    },
  );

  // Öffentlich, kein Login: Linkbesitz ist der Autorisierungsnachweis (ADR 0006).
  server.get('/share/:token', { schema: { params: ShareTokenParams } }, async (request, reply) => {
    const { token } = request.params;
    const validAfter = new Date(Date.now() - SHARE_LINK_GRACE_PERIOD_MS);

    const [shared] = await db
      .select({
        id: tour.id,
        status: tour.status,
        startedAt: tour.startedAt,
        endedAt: tour.endedAt,
        displayName: appUser.displayName,
      })
      .from(tour)
      .innerJoin(appUser, eq(tour.userId, appUser.id))
      .where(
        and(eq(tour.shareToken, token), or(eq(tour.status, 'aktiv'), gt(tour.endedAt, validAfter))),
      )
      .limit(1);

    if (!shared) {
      return reply.code(404).send({ error: 'share_link_invalid_or_expired' });
    }

    const track = await getPingTrack(shared.id);

    return reply.send({ ...shared, track });
  });
};

export default shareRoutes;
