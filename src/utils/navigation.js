const APP_ROUTE_ROOTS = [
  '/calendar',
  '/knowledge',
  '/wishes',
  '/albums',
  '/shop',
  '/check-ins',
  '/future-letters',
  '/memos',
  '/notifications',
  '/weekly',
  '/reflections',
  '/settings'
]

export function safeAppPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback

  const candidate = value.trim()
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback
  }

  try {
    const decoded = decodeURIComponent(candidate)
    if (decoded.startsWith('//') || decoded.includes('\\') || /[\u0000-\u001f\u007f]/.test(decoded)) {
      return fallback
    }

    const url = new URL(candidate, 'https://lohq.local')
    const allowed = url.pathname === '/' || APP_ROUTE_ROOTS.some((root) => (
      url.pathname === root || url.pathname.startsWith(`${root}/`)
    ))

    return allowed ? `${url.pathname}${url.search}${url.hash}` : fallback
  } catch {
    return fallback
  }
}
