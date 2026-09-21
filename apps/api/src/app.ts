import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { HealthStatus } from '@alpine-security/shared-types';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import tourRoutes from './routes/tours.js';
import pingRoutes from './routes/pings.js';
import rescueRoutes from './routes/rescue.js';
import shareRoutes from './routes/share.js';

export async function buildApp(options?: { logger?: boolean }) {
  const server = Fastify({
    logger: options?.logger ?? true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Im Browser läuft der Vite-Dev-Proxy (same-origin, kein CORS nötig). Die
  // native iOS-App (Capacitor) ruft die API dagegen direkt von ihrer eigenen
  // WKWebView-Origin aus auf, das braucht eine explizite CORS-Freigabe.
  await server.register(cors, { origin: ['capacitor://localhost'] });

  await server.register(authPlugin);
  await server.register(authRoutes);
  await server.register(tourRoutes);
  await server.register(pingRoutes);
  await server.register(rescueRoutes);
  await server.register(shareRoutes);

  server.get('/health', async (): Promise<HealthStatus> => {
    return {
      status: 'ok',
      service: 'alpine-security-api',
      timestamp: new Date().toISOString(),
    };
  });

  return server;
}
