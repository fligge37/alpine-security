import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export type UserAuthPayload = { role: 'user'; userId: string };
export type RescueAuthPayload = { role: 'rescue'; rescueMemberId: string; regionId: string };

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: UserAuthPayload | RescueAuthPayload;
    user: UserAuthPayload | RescueAuthPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Verifiziert nur das Token, ohne auf eine Rolle zu prüfen – die Rollenprüfung
// übernehmen requireUser/requireRescue, damit sie zugleich die Payload typisiert
// zurückgeben (statt request.user überall unions casten zu müssen).
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

export function requireUser(request: FastifyRequest): UserAuthPayload {
  if (request.user.role !== 'user') {
    throw new HttpError(403, 'forbidden_role');
  }
  return request.user;
}

export function requireRescue(request: FastifyRequest): RescueAuthPayload {
  if (request.user.role !== 'rescue') {
    throw new HttpError(403, 'forbidden_role');
  }
  return request.user;
}
