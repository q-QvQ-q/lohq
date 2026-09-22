import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase/client.js'
import { useAuth } from './AuthContext.jsx'

const DataCacheContext = createContext(null)

const CACHE_TTL = 90000
const SESSION_CACHE_PREFIX = 'lohq_data_cache:'

function readSessionEntry(userId, key, ttl) {
  if (!userId) return null
  try {
    const stored = JSON.parse(sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${userId}`) || '{}')
    const entry = stored[key]
    return entry && Date.now() - entry.timestamp < ttl ? entry : null
  } catch {
    return null
  }
}

function writeSessionEntry(userId, key, entry) {
  if (!userId) return
  try {
    const storageKey = `${SESSION_CACHE_PREFIX}${userId}`
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
    sessionStorage.setItem(storageKey, JSON.stringify({ ...stored, [key]: entry }))
  } catch {
    // A full or unavailable browser storage should never delay the page.
  }
}

export function DataCacheProvider({ children }) {
  const { profile } = useAuth()
  const [cache, setCache] = useState({})
  const cacheRef = useRef({})
  const cacheTimers = useRef({})
  const inFlightRef = useRef({})

  useEffect(() => {
    cacheRef.current = cache
  }, [cache])

  const [profileMap, setProfileMap] = useState({})

  // Cached queries are scoped to the signed-in person. Without this reset, a
  // second person logging in on the same device could briefly receive the
  // previous person's cached rows before their own request completes.
  useEffect(() => {
    Object.values(cacheTimers.current).forEach(clearTimeout)
    cacheTimers.current = {}
    inFlightRef.current = {}
    cacheRef.current = {}
    setCache({})
    setProfileMap({})
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return
    // 预加载所有相关 profiles（自己 + 伴侣），用于前端映射 nickname
    const loadProfiles = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url, gender')
        const map = {}
        if (data) data.forEach(p => { map[p.id] = p })
        setProfileMap(map)
      } catch (e) { /* non-critical */ }
    }
    loadProfiles()
  }, [profile?.id])

  const invalidateByPrefix = useCallback((prefix) => {
    // Build new cache from ref (not state) to ensure synchronous consistency
    const prev = cacheRef.current
    const next = {}
    Object.keys(prev).forEach(key => {
      if (!key.startsWith(prefix)) {
        next[key] = prev[key]
      }
    })
    // Update ref synchronously so fetchWithCache immediately sees the change
    cacheRef.current = next
    // Clear TTL timers for invalidated keys
    Object.keys(cacheTimers.current).forEach(key => {
      if (key.startsWith(prefix)) {
        clearTimeout(cacheTimers.current[key])
        delete cacheTimers.current[key]
      }
    })
    // Trigger re-render
    setCache(next)
  }, [])

  const invalidateCache = useCallback((key) => {
    if (!key) return
    // Update ref synchronously
    const prev = cacheRef.current
    const next = { ...prev }
    delete next[key]
    cacheRef.current = next
    // Clear TTL timer
    if (cacheTimers.current[key]) {
      clearTimeout(cacheTimers.current[key])
      delete cacheTimers.current[key]
    }
    setCache(next)
  }, [])

  const fetchWithCache = useCallback(async (key, fetcher, options = {}) => {
    const { force = false, ttl = CACHE_TTL } = options
    const currentCache = cacheRef.current

    // 命中缓存直接返回
    if (!force && currentCache[key] && Date.now() - currentCache[key].timestamp < ttl) {
      return currentCache[key].data
    }

    const sessionEntry = !force ? readSessionEntry(profile?.id, key, ttl) : null
    if (sessionEntry) {
      cacheRef.current = { ...currentCache, [key]: sessionEntry }
      setCache(current => ({ ...current, [key]: sessionEntry }))
      return sessionEntry.data
    }

    // 请求去重：同一key正在请求中，返回同一个Promise
    if (inFlightRef.current[key]) {
      return inFlightRef.current[key]
    }

    if (cacheTimers.current[key]) {
      clearTimeout(cacheTimers.current[key])
    }

    const requestPromise = fetcher()
    inFlightRef.current[key] = requestPromise

    try {
      const data = await requestPromise

      const entry = { data, timestamp: Date.now() }
      setCache(prev => ({ ...prev, [key]: entry }))
      writeSessionEntry(profile?.id, key, entry)

      cacheTimers.current[key] = setTimeout(() => {
        setCache(prev => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }, ttl)

      return data
    } finally {
      delete inFlightRef.current[key]
    }
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return

    // Let the first screen claim the connection first. The former eager preload
    // fired ten unrelated database queries after sign-in, slowing mobile pages.
    const warmSecondaryPages = () => {
      if (navigator.connection?.saveData || /2g/.test(navigator.connection?.effectiveType || '')) return
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth()
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`

      // Warm the most-used data only after the browser is idle. Other pages
      // continue to use the same on-demand cache, without competing at launch.
      Promise.allSettled([
        fetchWithCache(`diaries_${year}_${month}`, async () => {
          const { data } = await supabase.from('diaries').select('*').gte('created_at', startDate).lte('created_at', `${endDate}T23:59:59`).order('created_at', { ascending: true })
          return data || []
        }),
        fetchWithCache(`todos_${year}_${month}`, async () => {
          const { data } = await supabase.from('todos').select('*').gte('due_date', startDate).lte('due_date', endDate).order('due_date', { ascending: true })
          return data || []
        }),
        fetchWithCache('memos', async () => {
          const { data } = await supabase.from('memos').select('*').order('updated_at', { ascending: false })
          return data || []
        })
      ])
    }

    const timeoutId = window.setTimeout(warmSecondaryPages, 900)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [profile?.id, fetchWithCache])

  const value = {
    fetchWithCache,
    invalidateCache,
    invalidateByPrefix,
    profileMap
  }

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  )
}

export function useDataCache() {
  const context = useContext(DataCacheContext)
  if (!context) throw new Error('useDataCache must be used within a DataCacheProvider')
  return context
}
