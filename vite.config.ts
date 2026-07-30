import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon_darkmode.svg', 'icon_lightmode.svg'],
      manifest: {
        name: 'Šmírka Mobile',
        short_name: 'Šmírka',
        description: 'Airfield glider flight logging',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0d0d0d',
        theme_color: '#0d0d0d',
        categories: ['utilities', 'productivity'],
        icons: [
          { src: 'icon_darkmode.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon_darkmode.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'smirka-pages' }
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'smirka-assets' }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] }
  }
});
