const CACHE_NAME = 'lohq-cache-v3'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
]

// 缓存策略：网络优先，失败回退到缓存
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  
  // 只处理 GET 请求
  if (request.method !== 'GET') return

  // Same-origin /api is a live Supabase proxy. Never cache user-specific data
  // or the push configuration response in the static asset cache.
  if (new URL(request.url).pathname.startsWith('/api/')) {
    event.respondWith(fetch(request))
    return
  }
  
  // Supabase API 请求不缓存（需要实时数据）
  if (request.url.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
    return
  }
  
  // 导航请求：网络优先，失败回退缓存首页
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          return caches.match('/index.html')
        })
    )
    return
  }
  
  // 静态资源：缓存优先，失败回退网络
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // 在后台更新缓存
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response.clone())
            })
          }
        }).catch(() => {})
        return cached
      }
      
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response
          }
          
          // 只缓存同源资源和 Google Fonts
          const url = new URL(request.url)
          if (url.origin === self.location.origin || url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // 离线时返回缓存版本
          if (request.destination === 'image') {
            return caches.match('/favicon.svg')
          }
          return new Response('Offline', { status: 503 })
        })
    })
  )
})

// 监听消息，支持手动更新缓存
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function safeNotificationPath(value) {
  try {
    const candidate = typeof value === 'string' ? value.trim() : '/notifications'
    if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
      return '/notifications'
    }
    const decoded = decodeURIComponent(candidate)
    if (decoded.startsWith('//') || decoded.includes('\\') || /[\u0000-\u001f\u007f]/.test(decoded)) {
      return '/notifications'
    }
    const target = new URL(candidate, self.location.origin)
    return target.origin === self.location.origin
      ? target.pathname + target.search + target.hash
      : '/notifications'
  } catch {
    return '/notifications'
  }
}

// iPhone 主屏幕网页应用收到 Web Push 时必须展示可见通知。
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() || {}
  } catch {
    payload = { body: event.data?.text() || '' }
  }
  const title = typeof payload.title === 'string' ? payload.title : 'LOHQ 提醒'
  const body = typeof payload.body === 'string' ? payload.body : ''
  const url = safeNotificationPath(payload.url)
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    data: { url }
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = safeNotificationPath(event.notification.data?.url)
  const target = new URL(path, self.location.origin)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin)
    if (client) {
      await client.navigate(target.href)
      return client.focus()
    }
    return self.clients.openWindow(target.href)
  })())
})
