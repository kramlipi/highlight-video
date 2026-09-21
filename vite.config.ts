import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { growthApi } from './growth-api.ts'

export default defineConfig({
  plugins: [react(), growthApi()],
  server: {
    host: true,
    port: 5173,
  },
})
