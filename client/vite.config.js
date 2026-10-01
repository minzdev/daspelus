import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            // Jangan spam console saat server restart (nodemon)
            if (err.code !== 'ECONNRESET' && err.code !== 'ECONNREFUSED') {
              console.error('[vite proxy]', err.message)
            }
          })
        },
      },
    },
  },
})
