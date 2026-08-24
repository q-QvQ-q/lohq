// Cloudflare Pages Functions: Supabase API Reverse Proxy
// Handles all /api/* requests and proxies them to Supabase
// This bypasses GFW blocking of supabase.co from mainland China

const SUPABASE_ORIGIN = 'https://wselpiozikahgfsgwcdk.supabase.co'

export async function onRequest(context) {
  const { request } = context
  
  // Construct upstream URL
  const url = new URL(request.url)
  const upstream = SUPABASE_ORIGIN + url.pathname.replace(/^\/api/, '') + url.search
  
  // Forward headers
  const headers = new Headers(request.headers)
  headers.set('host', 'wselpiozikahgfsgwcdk.supabase.co')
  
  // Forward request to Supabase
  const response = await fetch(upstream, {
    method: request.method,
    headers,
    body: request.body,
    cf: { cacheTtl: 0 }
  })
  
  // Build response
  const responseHeaders = new Headers(response.headers)
  
  // Rewrite redirect Location headers
  if (response.status >= 300 && response.status < 400) {
    const location = responseHeaders.get('location')
    if (location && location.includes(SUPABASE_ORIGIN)) {
      responseHeaders.set('location', location.replace(SUPABASE_ORIGIN, url.origin + '/api'))
    }
  }
  
  // Fix Set-Cookie for cross-domain proxy
  const setCookie = responseHeaders.get('set-cookie')
  if (setCookie) {
    responseHeaders.delete('set-cookie')
    const cookies = setCookie.split(/,(?=\s*\w+=)/)
    for (const cookie of cookies) {
      const cleaned = cookie
        .replace(/;\s*Domain=[^;]*/gi, '')
        .replace(/;\s*Secure/gi, '')
      responseHeaders.append('set-cookie', cleaned.trim())
    }
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  })
}
