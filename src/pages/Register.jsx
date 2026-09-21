import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import Icon from '../components/Icon.jsx'

export default function Register() {
  const { theme, setTheme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('宝宝')
  const [gender, setGender] = useState('male')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('请输入邮箱')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (password.length < 6) {
      setError('密码至少需要 6 位')
      return
    }

    setLoading(true)
    try {
      await signUp({ email: email.trim(), password, nickname: nickname.trim(), gender })
      alert('注册成功！请检查邮箱完成验证，然后登录。')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message || '注册失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <button type="button" className="icon-button glass-panel absolute top-5 right-5 z-20" aria-label={theme === 'light' ? '切换黑夜模式' : '切换白天模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} /></button>
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>创建 LOHQ 账号</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-light)' }}>加入你们的私密小窝</p>
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
              placeholder="你的邮箱"
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
              placeholder="至少 6 位"
              required
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="label-text">确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="再次输入密码"
              required
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="label-text">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="input-field"
              placeholder="宝宝"
              required
            />
          </div>

          <div>
            <label className="label-text">性别</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`flex-1 py-3 rounded-input font-bold transition-all ${
                  gender === 'male' ? 'shadow-soft' : ''
                }`}
                style={{
                  backgroundColor: gender === 'male' ? 'var(--color-primary)' : 'var(--color-primary-light)',
                  color: 'var(--color-text)',
                  border: gender === 'male' ? 'none' : '2px solid var(--color-primary)'
                }}
              >
                男生
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`flex-1 py-3 rounded-input font-bold transition-all ${
                  gender === 'female' ? 'shadow-soft' : ''
                }`}
                style={{
                  backgroundColor: gender === 'female' ? 'var(--color-primary)' : 'var(--color-primary-light)',
                  color: 'var(--color-text)',
                  border: gender === 'female' ? 'none' : '2px solid var(--color-primary)'
                }}
              >
                女生
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? '注册中...' : '创建账号'}
          </button>

          <div className="text-center pt-2">
            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              已有账号？{' '}
              <Link to="/login" className="font-bold hover:underline" style={{ color: 'var(--color-primary-dark)' }}>
                去登录
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
