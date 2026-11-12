import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: cài được lên màn hình chính. Chỉ cache vỏ app (js/css/icon); KHÔNG cache dữ liệu nghiệp vụ (app chạy online).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32x32.png', 'apple-icon-180x180.png'],
      manifest: {
        name: 'QLCP Nguyễn Hữu',
        short_name: 'QLCP',
        description: 'Quản lý chi phí, chấm công, doanh thu và công nợ công trình',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2F3F5',
        theme_color: '#1D5DB5',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Mọi gọi tới Supabase / API đi thẳng ra mạng, không qua cache
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/storage\//],
        // Chỉ cache phông chữ + icon của Google Fonts (không phải dữ liệu nghiệp vụ)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Tách thư viện ra file riêng để trình duyệt giữ lại khi app đổi
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          vendor: ['@tanstack/react-query', '@tanstack/react-table', 'zod', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
});
