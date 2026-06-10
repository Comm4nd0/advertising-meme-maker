import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        // Don't buffer SSE responses (needed for progress streaming)
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              // Disable buffering for SSE
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
      '/output': 'http://localhost:8081',
      '/brand': 'http://localhost:8081',
    },
  },
});
