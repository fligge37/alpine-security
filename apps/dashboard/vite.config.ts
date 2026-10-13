import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Default ist die lokale Dev-API; über apps/dashboard/.env lässt sich das
  // Ziel zum Testen auf den deployten Server umbiegen (siehe .env.example).
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

  return {
    plugins: [react(), tailwindcss()],
    // Vites Dependency-Pre-Bundling legt maplibre-gl-worker.mjs nicht neben die
    // gebündelte maplibre-gl.js – der Worker-Pfad zeigt dann ins Leere (404) und
    // die Karte rendert nur den Hintergrund, ohne Vektordaten oder Terrain.
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
    server: {
      port: 5181,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
