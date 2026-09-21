import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase/client.js'
import { removePushOnSignOut } from '../utils/pushSubscription.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [partnerProfile, setPartnerProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const recordLogin = useCallback(async (userId) => {
    if (!userId) return
    const lastLoginAt = new Date().toISOString()
    const { error } = await supabase
      .from('profiles')
      .update({ last_login_at: lastLoginAt })
      .eq('id', userId)
    if (!error) {
      setProfile(current => current?.id === userId ? { ...current, last_login_at: lastLoginAt } : current)
    }
  }, [])

  const loadProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) throw error
      setProfile(data)
      
      // 如果有 partner_id，加载伴侣的 profile
      if (data?.partner_id) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.partner_id)
          .single()
        if (!partnerError && partnerData) {
          setPartnerProfile(partnerData)
        } else {
          setPartnerProfile(null)
        }
      } else {
        setPartnerProfile(null)
      }
    } catch {
      setProfile(null)
      setPartnerProfile(null)
    }
  }, [])

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data: { user: currentUser } }) => {
        if (currentUser) {
          setUser(currentUser)
          loadProfile(currentUser.id)
          recordLogin(currentUser.id)
        }
      })
      .catch(() => {
        // 网络不可达时静默失败，不设置 user
      })
      .finally(() => {
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user.id)
        if (event === 'SIGNED_IN') recordLogin(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription?.unsubscribe()
  }, [loadProfile, recordLogin])

  const signUp = async ({ email, password, nickname, gender }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nickname, gender }
      }
    })
    if (error) {
      // 网络错误 → 友好提示
      if (
        error.name === 'AuthRetryableFetchError' ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ERR_NAME_NOT_RESOLVED') ||
        error.message?.includes('Network')
      ) {
        throw new Error('网络连接失败，请检查网络后重试')
      }
      throw error
    }
    
    // 注册成功后，等待触发器创建profile，然后同步email
    if (data?.user) {
      try {
        // 等待一小段时间让触发器执行
        await new Promise(resolve => setTimeout(resolve, 500))
        await supabase
          .from('profiles')
          .update({ email })
          .eq('id', data.user.id)
      } catch (e) {
        // email sync may fail if trigger already handled it
      }
    }
    return data
  }

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // 网络错误 → 友好提示
      if (
        error.name === 'AuthRetryableFetchError' ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ERR_NAME_NOT_RESOLVED') ||
        error.message?.includes('Network')
      ) {
        throw new Error('网络连接失败，请检查网络后重试')
      }
      throw error
    }
    
    // 登录时同步email到profiles表（确保现有用户也有email记录）
    if (data?.user) {
      try {
        await supabase
          .from('profiles')
          .update({ email: data.user.email })
          .eq('id', data.user.id)
      } catch (e) {
        // email sync may fail silently
      }
    }
    return data
  }

  const signOut = async () => {
    try { await removePushOnSignOut() } catch (error) { console.warn('清理设备推送失败:', error) }
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setPartnerProfile(null)
  }

  const value = {
    user,
    profile,
    partnerProfile,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile: () => user && loadProfile(user.id)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
