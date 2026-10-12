import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Built assets are served by Django/WhiteNoise from /static/app/ in production.
// In dev, Vite serves the app at / and proxies /api to the local Django server.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/app/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    manifest: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
}))
