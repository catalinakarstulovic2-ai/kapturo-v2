import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'https://backend-production-bc9f.up.railway.app',
    },
  },
  build: {
    outDir: 'dist',
  },
})
