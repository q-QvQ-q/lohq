import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { supabase } from '../supabase/client.js'
import BottomNav from './BottomNav.jsx'
import Icon from './Icon.jsx'

export default function Layout() {
  const { user, profile, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    if (!user?.id) {
      setNotifications([])
      return
    }

    let isMounted = true
    const loadNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, read_at')
        .eq('recipient_id', user.id)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!error && isMounted) setNotifications(data || [])
    }

    loadNotifications()
    const interval = window.setInterval(loadNotifications, 20000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadNotifications()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('notifications-changed', loadNotifications)
    return () => {
      isMounted = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('notifications-changed', loadNotifications)
    }
  }, [user?.id])

  useEffect(() => {
    if (navigator.connection?.saveData || /2g/.test(navigator.connection?.effectiveType || '')) return undefined
    const prefetchRoutes = () => {
      import('../pages/Calendar.jsx')
      import('../pages/Memos.jsx')
      import('../pages/Settings.jsx')
    }
    const timeoutId = window.setTimeout(prefetchRoutes, 450)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  const unreadCount = notifications.length
  const isHome = location.pathname === '/' || location.pathname === '/__preview/home'

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={`layout-shell min-h-screen flex flex-col pb-24 md:pb-28 ${isHome ? 'is-home' : 'is-feature'}`}>
      {/* Header */}
      <header
        className={`app-header sticky top-0 z-40 px-4 border-b backdrop-blur-2xl ${isHome ? 'py-3' : 'app-header--feature'}`}
        style={{ background: 'var(--surface)', borderColor: 'var(--stroke)' }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {isHome && (
            <NavLink to="/" className="flex items-center gap-2">
              <CowCat size={36} />
              <span
                className="text-lg font-semibold tracking-tight"
                style={{ color: 'var(--color-text)' }}
              >
                LOHQ
              </span>
            </NavLink>
          )}
          <div className={`flex items-center gap-1.5 sm:gap-3 relative ${isHome ? '' : 'ml-auto'}`}>
            <button
              type="button"
              aria-label={`提醒，${unreadCount} 条未读`}
              onClick={() => navigate('/notifications')}
              className="relative icon-button"
            >
              <Icon name="bell" size={19} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 text-white" style={{ backgroundColor: '#E74C3C' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {isHome && <>
              <button type="button" className="icon-button" aria-label={theme === 'light' ? '切换黑夜模式' : '切换白天模式'} title={theme === 'light' ? '黑夜模式' : '白天模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
                <Icon name={theme === 'light' ? 'moon' : 'sun'} size={19} />
              </button>
              <span className="hidden sm:inline text-sm" style={{ color: 'var(--color-text-light)' }}>
                你好，{profile?.nickname || '宝宝'}
              </span>
              <button
                onClick={handleLogout}
                className="hidden sm:inline text-xs hover:opacity-70 transition-opacity"
                style={{ color: 'var(--color-text-light)' }}
              >
                退出
              </button>
            </>}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  )
}

// 使用用户提供的 PNG 图片
export function CowCat({ size = 32 }) {
  return (
    <img
      src="/images/logo.PNG"
      alt="Logo"
      className="site-logo"
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
    />
  )
}

// 可爱圆润猫爪印
function PawPrint({ size = 20, color = '#FFFFFF' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="20" cy="26" rx="8" ry="6" fill={color} />
      <ellipse cx="10" cy="14" rx="3.5" ry="4" fill={color} />
      <ellipse cx="17" cy="10" rx="3.5" ry="4" fill={color} />
      <ellipse cx="23" cy="10" rx="3.5" ry="4" fill={color} />
      <ellipse cx="30" cy="14" rx="3.5" ry="4" fill={color} />
    </svg>
  )
}

// 首页装饰用猫咪 - 可镜像
export function CuteCat({ size = 32, color, flip = false }) {
  return (
    <img
      src="/images/decor-cat.png"
      alt="装饰猫"
      width={size}
      height={size}
      style={{
        objectFit: 'contain',
        transform: flip ? 'scaleX(-1)' : 'none'
      }}
    />
  )
}

// 可爱爱心 - 卡通风格，支持主题色
export function PixelHeart({ size = 32, color }) {
  const { theme, themes } = useTheme()
  const colors = themes[theme]?.colors || themes.light.colors
  const primaryColor = color || colors.primaryDark
  const lightColor = color ? color + '88' : colors.accent
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`heartGrad-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={lightColor} />
          <stop offset="100%" stopColor={primaryColor} />
        </linearGradient>
      </defs>
      <path
        d="M32 56 C12 42 4 28 12 18 C20 8 28 12 32 22 C36 12 44 8 52 18 C60 28 52 42 32 56 Z"
        fill={`url(#heartGrad-${size})`}
        stroke={primaryColor}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <ellipse cx="24" cy="26" rx="6" ry="4" fill="#FFFFFF" opacity="0.4" />
    </svg>
  )
}
