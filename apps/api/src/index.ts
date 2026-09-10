import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { HealthStatus } from '@alpine-security/shared-types';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import tourRoutes from './routes/tours.js';

const server = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>();

await server.register(authPlugin);
await server.register(authRoutes);
await server.register(tourRoutes);

server.get('/health', async (): Promise<HealthStatus> => {
  return {
    status: 'ok',
    service: 'alpine-security-api',
    timestamp: new Date().toISOString(),
  };
});

const port = Number(process.env.PORT ?? 3000);

server.listen({ port, host: '0.0.0.0' }).catch((err) => {
  server.log.error(err);
  process.exit(1);
});
