import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    strictPort: true,
    proxy: Object.fromEntries(['/api', '/uploads', '/website-assets'].map(path => [path, process.env.API_PROXY_TARGET || 'http://127.0.0.1:5001'])),
  },
})
