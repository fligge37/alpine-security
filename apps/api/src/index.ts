import Fastify from 'fastify';
import type { HealthStatus } from '@alpine-security/shared-types';

const server = Fastify({ logger: true });

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
