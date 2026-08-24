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

  const invalidateByPrefix = useCallback((prefix) => {
    setCache(prev => {
      const next = {}
      Object.keys(prev).forEach(key => {
        if (!key.startsWith(prefix)) {
          next[key] = prev[key]
        }
      })
      return next
    })
  }, [])

  const invalidateCache = useCallback((key) => {
    if (!key) return
    setCache(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
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
            .select('*, user:profiles(nickname, gender)')
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
            .select('*, author_profile:profiles(nickname, gender)')
            .gte('created_at', startDate)
            .lte('created_at', endDate + 'T23:59:59')
            .order('created_at', { ascending: true })
          return data || []
        })

        fetchWithCache(`todos_${y}_${m}`, async () => {
          const { data } = await supabase
            .from('todos')
            .select('*, created_by_profile:profiles(nickname)')
            .gte('due_date', startDate)
            .lte('due_date', endDate)
            .order('due_date', { ascending: true })
          return data || []
        })

        fetchWithCache('memos', async () => {
          const { data } = await supabase
            .from('memos')
            .select('*, author_profile:profiles(nickname, avatar_url)')
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
            .select('*, payer_profile:profiles(nickname)')
            .order('expense_date', { ascending: false })
            .limit(50)
          return data || []
        }, { ttl: 30000 })

        fetchWithCache('transactions_recent', async () => {
          const { data } = await supabase
            .from('wallet_transactions')
            .select('*, from_user_profile:profiles(nickname), to_user_profile:profiles(nickname)')
            .order('transaction_date', { ascending: false })
            .limit(50)
          return data || []
        }, { ttl: 30000 })

        fetchWithCache(`weekly_${y}_${getWeekNumber(now)}`, async () => {
          const weekNum = getWeekNumber(now)
          const { data } = await supabase
            .from('weekly_summaries')
            .select('*, author_profile:profiles(nickname, avatar_url)')
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
    invalidateByPrefix
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