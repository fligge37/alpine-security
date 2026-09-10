import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tour } from '../db/schema.js';

const TourIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

const tourRoutes: FastifyPluginAsyncTypebox = async (server) => {
  server.post('/tours', { preHandler: server.authenticate }, async (request, reply) => {
    const [created] = await db.insert(tour).values({ userId: request.user.userId }).returning();

    return reply.code(201).send(created);
  });

  server.post(
    '/tours/:id/end',
    { schema: { params: TourIdParams }, preHandler: server.authenticate },
    async (request, reply) => {
      const [updated] = await db
        .update(tour)
        .set({ status: 'beendet', endedAt: new Date() })
        .where(
          and(
            eq(tour.id, request.params.id),
            eq(tour.userId, request.user.userId),
            eq(tour.status, 'aktiv'),
          ),
        )
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'tour_not_found_or_not_active' });
      }

      return reply.send(updated);
    },
  );
};

export default tourRoutes;
