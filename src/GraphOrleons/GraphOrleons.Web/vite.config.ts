import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: parseInt(process.env.PORT || '4300'),
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5201',
        changeOrigin: true,
      },
    },
  },
});
