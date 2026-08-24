import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { CowCat, PixelHeart } from '../components/Layout.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'

export default function Login() {
  const { theme, themes } = useTheme()
  const currentTheme = themes[theme]
  const heartColor = currentTheme?.colors?.primaryDark || '#D4A5A5'
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn({ email, password })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || '登录失败，请检查邮箱和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{ backgroundColor: 'var(--color-primary-light)' }}>
      <PixelBackground color={heartColor} />

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-block mb-4 p-4 rounded-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.7)' }}>
            <CowCat size={72} />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>LOHQ</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>我们的恋爱小窝</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-input text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="label-text">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="宝宝的邮箱"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label-text">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="密码"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? '登录中...' : '🐾 登录'}
          </button>

          <div className="text-center pt-2">
            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              还没有账号？{' '}
              <Link to="/register" className="font-bold hover:underline" style={{ color: 'var(--color-primary-dark)' }}>
                注册新账号
              </Link>
            </p>
          </div>
        </form>

        <div className="text-center mt-6">
          <p className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.7 }}>
            💗 仅我们两个人可见的私密空间 💗
          </p>
        </div>
      </div>
    </div>
  )
}

function PixelBackground({ color }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute top-10 left-10 opacity-20">
        <PixelHeart size={40} color={color} />
      </div>
      <div className="absolute top-32 right-8 opacity-15">
        <PixelHeart size={30} color={color} />
      </div>
      <div className="absolute bottom-20 left-16 opacity-20">
        <PixelHeart size={50} color={color} />
      </div>
      <div className="absolute bottom-40 right-12 opacity-15">
        <PixelHeart size={35} color={color} />
      </div>
    </div>
  )
}
