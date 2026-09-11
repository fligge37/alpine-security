import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { locationPing, tour } from '../db/schema.js';
import { requireUser } from '../plugins/auth.js';

const TourIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

const CreatePingBody = Type.Object({
  recordedAt: Type.String({ format: 'date-time' }),
  latitude: Type.Number({ minimum: -90, maximum: 90 }),
  longitude: Type.Number({ minimum: -180, maximum: 180 }),
  accuracyMeters: Type.Optional(Type.Number({ minimum: 0 })),
});

const pingRoutes: FastifyPluginAsyncTypebox = async (server) => {
  server.post(
    '/tours/:id/pings',
    { schema: { params: TourIdParams, body: CreatePingBody }, preHandler: server.authenticate },
    async (request, reply) => {
      const { userId } = requireUser(request);
      const { latitude, longitude, recordedAt, accuracyMeters } = request.body;

      const [activeTour] = await db
        .select({ id: tour.id })
        .from(tour)
        .where(
          and(eq(tour.id, request.params.id), eq(tour.userId, userId), eq(tour.status, 'aktiv')),
        )
        .limit(1);

      if (!activeTour) {
        return reply.code(404).send({ error: 'tour_not_found_or_not_active' });
      }

      const [created] = await db
        .insert(locationPing)
        .values({
          tourId: activeTour.id,
          recordedAt: new Date(recordedAt),
          location: `POINT(${longitude} ${latitude})`,
          accuracyMeters: accuracyMeters?.toString(),
        })
        .returning();

      return reply.code(201).send(created);
    },
  );
};

export default pingRoutes;
