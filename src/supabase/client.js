import { createClient } from '@supabase/supabase-js'

// Support proxy URL for China access
// VITE_SUPABASE_PROXY_URL: '/api' for Cloudflare Pages Functions, or full Worker URL
// VITE_SUPABASE_URL: Direct Supabase URL (fallback for local dev with VPN)
const configuredProxyUrl = import.meta.env.VITE_SUPABASE_PROXY_URL
const supabaseUrl = configuredProxyUrl
  ? new URL(configuredProxyUrl, window.location.origin).toString().replace(/\/$/, '')
  : import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
