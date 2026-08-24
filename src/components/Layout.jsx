import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import BottomNav from './BottomNav.jsx'

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col pb-20">
      {/* Header */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b px-4 py-3"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-primary-light) 90%, transparent)',
          borderColor: 'var(--color-primary)'
        }}
      >
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2">
            <CowCat size={36} />
            <span
              className="text-lg font-bold"
              style={{ color: 'var(--color-text)' }}
            >
              LOHQ
            </span>
          </NavLink>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              你好，{profile?.nickname || '宝宝'}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs hover:opacity-70 transition-opacity"
              style={{ color: 'var(--color-text-light)' }}
            >
              退出
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-4">
        <div className="max-w-lg mx-auto">
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
      src="/images/装饰猫.PNG"
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
  const colors = themes[theme]?.colors || themes.pink.colors
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
