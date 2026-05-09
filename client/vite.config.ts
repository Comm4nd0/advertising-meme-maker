import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8081',
      '/output': 'http://localhost:8081',
      '/brand': 'http://localhost:8081',
    },
  },
});
