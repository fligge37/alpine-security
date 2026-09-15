import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { HealthStatus } from '@alpine-security/shared-types';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import tourRoutes from './routes/tours.js';
import pingRoutes from './routes/pings.js';
import rescueRoutes from './routes/rescue.js';

export async function buildApp(options?: { logger?: boolean }) {
  const server = Fastify({
    logger: options?.logger ?? true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await server.register(authPlugin);
  await server.register(authRoutes);
  await server.register(tourRoutes);
  await server.register(pingRoutes);
  await server.register(rescueRoutes);

  server.get('/health', async (): Promise<HealthStatus> => {
    return {
      status: 'ok',
      service: 'alpine-security-api',
      timestamp: new Date().toISOString(),
    };
  });

  return server;
}
