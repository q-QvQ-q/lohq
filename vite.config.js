import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  // Dev proxy: /api/* → Supabase (or Worker if VITE_SUPABASE_WORKER_URL is set)
  // Set VITE_SUPABASE_PROXY_URL=/api in .env to use this proxy in dev mode
  const workerUrl = env.VITE_SUPABASE_WORKER_URL
  const supabaseUrl = env.VITE_SUPABASE_URL
  const proxyTarget = workerUrl || supabaseUrl
  
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        // Proxy /api/* → Supabase (or Worker) for dev mode
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  }
})
