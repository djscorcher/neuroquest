import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies:    'injectManifest',
      srcDir:        'src',
      filename:      'sw.js',
      registerType:  'autoUpdate',
      injectRegister: 'auto',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
      devOptions: { enabled: false },
      manifest: {
        name:             'NeuroQuest',
        short_name:       'NeuroQuest',
        description:      'Gamified task manager for the ADHD brain',
        display:          'standalone',
        start_url:        '/',
        theme_color:      '#020d1f',
        background_color: '#020d1f',
        icons: [
          { src: '/pwa-192x192.png',    sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png',    sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
    }),
  ],
});
