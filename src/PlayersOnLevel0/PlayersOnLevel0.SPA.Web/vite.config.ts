import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  server: {
    port: parseInt(process.env.PORT || '5173'),
    proxy: {
      '/api/players': {
        target: process.env.services__api__http__0 || 'http://localhost:5036',
        changeOrigin: true,
        // SSE requires unbuffered streaming and no timeout
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            if (req.headers.accept === 'text/event-stream') {
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              res.setHeader('X-Accel-Buffering', 'no');
              res.flushHeaders();
            }
          });
        },
      },
    },
  },
})
