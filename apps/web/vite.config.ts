import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
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
  server: {
    port: 5180,
    strictPort: true,
  },
});
