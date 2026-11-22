import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5180,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY || 'http://localhost:5055',
        changeOrigin: true,
      },
    },
  },
});
