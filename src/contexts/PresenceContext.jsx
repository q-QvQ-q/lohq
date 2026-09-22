import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabase } from '../supabase/client.js'

const PresenceContext = createContext({ onlineSince: {} })

export function PresenceProvider({ children }) {
  const { profile, partnerProfile } = useAuth()
  const [onlineSince, setOnlineSince] = useState({})

  useEffect(() => {
    if (!profile?.id) {
      setOnlineSince({})
      return undefined
    }

    const roomId = [profile.id, partnerProfile?.id].filter(Boolean).sort().join(':')
    const channel = supabase.channel(`couple-presence:${roomId}`, {
      config: { presence: { key: profile.id } }
    })
    let subscribed = false

    const syncPresence = () => {
      const next = {}
      Object.values(channel.presenceState()).flat().forEach(entry => {
        const personId = entry.profile_id || entry.user_id
        if (!personId || !entry.online_at) return
        if (!next[personId] || entry.online_at < next[personId]) next[personId] = entry.online_at
      })
      setOnlineSince(next)
    }

    const trackActive = () => {
      if (!subscribed || document.visibilityState !== 'visible' || navigator.onLine === false) return
      channel.track({ profile_id: profile.id, online_at: new Date().toISOString() })
    }

    const syncVisibility = () => {
      if (document.visibilityState === 'visible') trackActive()
      else if (subscribed) channel.untrack()
    }

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          subscribed = true
          trackActive()
        }
      })

    const heartbeatId = window.setInterval(trackActive, 20000)
    document.addEventListener('visibilitychange', syncVisibility)
    window.addEventListener('focus', trackActive)
    window.addEventListener('online', trackActive)

    return () => {
      window.clearInterval(heartbeatId)
      document.removeEventListener('visibilitychange', syncVisibility)
      window.removeEventListener('focus', trackActive)
      window.removeEventListener('online', trackActive)
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [profile?.id, partnerProfile?.id])

  return <PresenceContext.Provider value={{ onlineSince }}>{children}</PresenceContext.Provider>
}

export function usePresence() {
  return useContext(PresenceContext)
}
