import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase/client.js'
import { useAuth } from './AuthContext.jsx'
import { getWeekNumber } from '../utils/dateUtils.js'

const DataCacheContext = createContext(null)

const CACHE_TTL = 30000

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

      setCache(prev => ({
        ...prev,
        [key]: { data, timestamp: Date.now() }
      }))

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
  }, [])

  useEffect(() => {
    if (!profile?.id) return

    const preloadData = async () => {
      try {
        fetchWithCache('anniversaries', async () => {
          const { data } = await supabase
            .from('anniversaries')
            .select('*')
            .order('date', { ascending: true })
          return data || []
        })

        fetchWithCache('wishes', async () => {
          const { data } = await supabase
            .from('wishes')
            .select('*')
            .order('is_completed', { ascending: true })
            .order('created_at', { ascending: false })
          return data || []
        })

        fetchWithCache('wallets', async () => {
          const { data } = await supabase
            .from('wallets')
            .select('*')
            .order('balance', { ascending: false })
          return data || []
        })

        fetchWithCache('knowledge_base', async () => {
          const { data } = await supabase
            .from('knowledge_base')
            .select('*')
            .order('updated_at', { ascending: false })
          return data || []
        })

        const now = new Date()
        const y = now.getFullYear()
        const m = now.getMonth()
        const startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`
        const lastDay = new Date(y, m + 1, 0).getDate()
        const endDate = `${y}-${String(m + 1).padStart(2, '0')}-${lastDay}`

        fetchWithCache(`diaries_${y}_${m}`, async () => {
          const { data } = await supabase
            .from('diaries')
            .select('*')
            .gte('created_at', startDate)
            .lte('created_at', endDate + 'T23:59:59')
            .order('created_at', { ascending: true })
          return data || []
        })

        fetchWithCache(`todos_${y}_${m}`, async () => {
          const { data } = await supabase
            .from('todos')
            .select('*')
            .gte('due_date', startDate)
            .lte('due_date', endDate)
            .order('due_date', { ascending: true })
          return data || []
        })

        fetchWithCache('memos', async () => {
          const { data } = await supabase
            .from('memos')
            .select('*')
            .order('updated_at', { ascending: false })
          return data || []
        })

        fetchWithCache('albums', async () => {
          const { data } = await supabase
            .from('albums')
            .select('*')
            .order('created_at', { ascending: false })
          return data || []
        })

        fetchWithCache('expenses_recent', async () => {
          const { data } = await supabase
            .from('expenses')
            .select('*')
            .order('expense_date', { ascending: false })
            .limit(50)
          return data || []
        }, { ttl: 30000 })

        fetchWithCache('transactions_recent', async () => {
          const { data } = await supabase
            .from('wallet_transactions')
            .select('*')
            .order('transaction_date', { ascending: false })
            .limit(50)
          return data || []
        }, { ttl: 30000 })

        fetchWithCache(`weekly_${y}_${getWeekNumber(now)}`, async () => {
          const weekNum = getWeekNumber(now)
          const { data } = await supabase
            .from('weekly_summaries')
            .select('*')
            .eq('year', y)
            .eq('week_number', weekNum)
          return data || []
        })
      } catch (e) {
        // preload failures are non-critical
      }
    }

    preloadData()
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