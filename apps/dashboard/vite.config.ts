import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
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
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
