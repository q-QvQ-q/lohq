const CACHE_NAME = 'lohq-cache-v2'
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