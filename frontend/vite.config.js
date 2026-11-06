import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Chuyển tiếp API khi phát triển; backend có thể đổi qua API_PROXY_TARGET.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(['/api', '/sitemap.xml', '/robots.txt'].map(prefix => [prefix, { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:5000', changeOrigin: true }])),
  },
});
