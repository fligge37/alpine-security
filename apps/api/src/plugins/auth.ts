import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string };
    user: { userId: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest) => Promise<void>;
  }
}

export default fp(async (server: FastifyInstance) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }

  await server.register(fastifyJwt, { secret });

  server.decorate('authenticate', async (request) => {
    await request.jwtVerify();
  });
});
