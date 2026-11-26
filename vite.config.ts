import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // maplibre starts its worker from its own file URL, which pre-bundling breaks.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
