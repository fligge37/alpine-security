import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Alpine Security',
        short_name: 'AlpineSecurity',
        description: 'Tourenanmeldung und Check-in für alpine Touren',
        theme_color: '#1b2a41',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
  // Vites Dependency-Pre-Bundling legt maplibre-gl-worker.mjs nicht neben die
  // gebündelte maplibre-gl.js – der Worker-Pfad zeigt dann ins Leere (404) und
  // die Karte rendert nur den Hintergrund, ohne Vektordaten oder Terrain.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    port: 5180,
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
