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
      // Tự đăng ký ở src/app/pwa-update.ts (kiểm tra bản mới + tự tải lại), không chèn script mặc định
      injectRegister: false,
      includeAssets: ['favicon-32x32.png', 'favicon-16x16.png', 'apple-icon-180x180.png'],
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
          // Android tự cắt hình (tròn / giọt nước): bản nền tràn, biểu tượng nằm trong vùng an toàn
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // KHÔNG cất index.html sẵn: trước 16/11/2026 service worker trả index.html cũ trong máy nên F5 / vuốt xuống
        // vẫn ra giao diện cũ, phải kill app. Nay trang (index.html) luôn hỏi Vercel trước (NetworkFirst bên dưới).
        globPatterns: ['**/*.{js,css,png,svg,woff2}'],
        navigateFallback: null,
        runtimeCaching: [
          // Mở trang / F5 / vuốt xuống: lấy index.html mới từ mạng; mạng chậm quá 4 giây hoặc mất mạng mới dùng bản cất trong máy
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'trang-html',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 5 },
            },
          },
          // Chỉ cache phông chữ + icon của Google Fonts (không phải dữ liệu nghiệp vụ)
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
