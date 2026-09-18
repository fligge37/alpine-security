import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import bcrypt from 'bcryptjs';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appUser, rescueOrgMember, tour } from '../db/schema.js';
import { requireRescue } from '../plugins/auth.js';

const LoginBody = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
});

const ToursQuery = Type.Object({
  status: Type.Optional(Type.Union([Type.Literal('aktiv'), Type.Literal('beendet')])),
});

const TourIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

interface LatestPingRow extends Record<string, unknown> {
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: string | null;
}

async function getLatestPing(tourId: string) {
  const result = await db.execute<LatestPingRow>(sql`
    SELECT recorded_at, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude, accuracy_meters
    FROM location_ping
    WHERE tour_id = ${tourId}
    ORDER BY recorded_at DESC
    LIMIT 1
  `);

  const row = result.rows[0];
  if (!row) return null;

  return {
    recordedAt: row.recorded_at,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters ? Number(row.accuracy_meters) : null,
  };
}

const rescueRoutes: FastifyPluginAsyncTypebox = async (server) => {
  server.post('/rescue/login', { schema: { body: LoginBody } }, async (request, reply) => {
    const { email, password } = request.body;

    const [member] = await db
      .select()
      .from(rescueOrgMember)
      .where(eq(rescueOrgMember.email, email))
      .limit(1);

    if (!member || !(await bcrypt.compare(password, member.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    if (!member.verifiedAt) {
      return reply.code(403).send({ error: 'not_verified' });
    }

    const token = await reply.jwtSign({
      role: 'rescue',
      rescueMemberId: member.id,
      regionId: member.regionId,
    });

    return reply.send({ token });
  });

  server.get(
    '/rescue/tours',
    { schema: { querystring: ToursQuery }, preHandler: server.authenticate },
    async (request, reply) => {
      requireRescue(request);
      const status = request.query.status ?? 'aktiv';

      const tours = await db
        .select({
          id: tour.id,
          status: tour.status,
          startedAt: tour.startedAt,
          endedAt: tour.endedAt,
          retentionHoldAt: tour.retentionHoldAt,
          phoneNumber: appUser.phoneNumber,
          displayName: appUser.displayName,
        })
        .from(tour)
        .innerJoin(appUser, eq(tour.userId, appUser.id))
        .where(eq(tour.status, status))
        .orderBy(desc(tour.startedAt));

      const withLastPing = await Promise.all(
        tours.map(async (t) => ({ ...t, lastPing: await getLatestPing(t.id) })),
      );

      return reply.send(withLastPing);
    },
  );

  // Nimmt eine konkrete Tour von der automatischen Löschung ihres Standort-
  // verlaufs aus (ADR 0008, "Ernstfall"-Fall) - kein Ablaufdatum, bis der Hold
  // aktiv wieder aufgehoben wird. Erneutes Aufrufen aktualisiert nur, wer
  // zuletzt gehalten hat.
  server.post(
    '/rescue/tours/:id/hold',
    { schema: { params: TourIdParams }, preHandler: server.authenticate },
    async (request, reply) => {
      const { rescueMemberId } = requireRescue(request);

      const [updated] = await db
        .update(tour)
        .set({ retentionHoldAt: new Date(), retentionHoldBy: rescueMemberId })
        .where(eq(tour.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'tour_not_found' });
      }

      return reply.send(updated);
    },
  );

  server.delete(
    '/rescue/tours/:id/hold',
    { schema: { params: TourIdParams }, preHandler: server.authenticate },
    async (request, reply) => {
      requireRescue(request);

      const [updated] = await db
        .update(tour)
        .set({ retentionHoldAt: null, retentionHoldBy: null })
        .where(eq(tour.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'tour_not_found' });
      }

      return reply.send(updated);
    },
  );
};

export default rescueRoutes;
