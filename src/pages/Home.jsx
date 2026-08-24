import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { daysBetween, daysUntil, formatDate, formatDateShort, getAnniversaryTypeLabel } from '../utils/dateUtils.js'
import { CuteCat, PixelHeart } from '../components/Layout.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'

const SWEET_MESSAGES = [
  '遇见你，是我最浪漫的事 💕',
  '每一天都想和你一起度过 🐾',
  '有你在，每一天都是情人节 💘',
  '你是我所有温柔的理由 🌸',
  '和你在一起的时间，都是甜的 🍬',
  '余生很长，请多指教 🌟',
  '你笑起来真好看，像春天的花一样 🌷',
  '世界那么大，遇见你真好 🌍',
  '愿我们的故事，永远不打烊 🏪',
  '你是我的小太阳，照亮每一天 ☀️'
]

export default function Home() {
  const { theme, themes } = useTheme()
  const { profile } = useAuth()
  const { fetchWithCache } = useDataCache()
  const currentTheme = themes[theme]
  const heartColor = currentTheme?.colors?.primaryDark || '#D4A5A5'
  
  const [startDate, setStartDate] = useState('2025-01-29')
  const [anniversaries, setAnniversaries] = useState([])
  const [sweetMessage, setSweetMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    setSweetMessage(SWEET_MESSAGES[Math.floor(Math.random() * SWEET_MESSAGES.length)])
  }, [profile?.id])

  async function loadData() {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    
    try {
      // 使用缓存加载纪念日（预加载已缓存）
      const annivData = await fetchWithCache('anniversaries', async () => {
        const { data } = await supabase
          .from('anniversaries')
          .select('*')
          .order('date', { ascending: true })
        return data || []
      })
      setAnniversaries(annivData)
      
      // 恋爱日期从 profile 获取
      if (profile?.love_start_date) {
        setStartDate(profile.love_start_date)
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalDays = daysBetween(startDate)

  const upcomingAnniversaries = anniversaries
    .filter((a) => a.date)
    .map((a) => ({
      ...a,
      days_left: daysUntil(a.date, a.is_repeat_yearly)
    }))
    .filter((a) => a.days_left <= 60 && a.days_left >= 0)
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 3)

  return (
    <div className="space-y-6 animate-fade-in">
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs flex items-center gap-2"
             style={{ backgroundColor: 'var(--color-primary)', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <span className="animate-spin">🏠</span> 加载中...
        </div>
      )}
      {/* Love Days Counter Card */}
      <div className="card-pink text-center relative overflow-hidden">
        <div className="absolute top-2 left-2 opacity-40">
          <PixelHeart size={24} color={heartColor} />
        </div>
        <div className="absolute top-4 right-4 opacity-40">
          <PixelHeart size={24} color={heartColor} />
        </div>

        <div className="relative z-10 py-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CuteCat size={28} flip={false} />
            <p className="font-bold text-sm" style={{ color: 'var(--color-text-light)' }}>我们在一起已经...</p>
            <CuteCat size={28} flip={true} />
          </div>

          <div className="my-3">
            <span className="text-6xl font-bold animate-heartbeat inline-block" style={{ color: 'var(--color-text)' }}>
              {totalDays}
            </span>
            <p className="font-bold text-lg mt-1" style={{ color: 'var(--color-text-light)' }}>天</p>
          </div>

          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
            从 {formatDate(startDate)} 开始 💗
          </p>

          <div className="mt-4 p-3 rounded-input" style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}>
            <p className="text-sm italic" style={{ color: 'var(--color-text)' }}>{sweetMessage}</p>
          </div>
        </div>
      </div>

      {/* Upcoming Anniversaries Preview */}
      {upcomingAnniversaries.length > 0 && (
        <div>
          <h2 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <span>📅</span> 即将到来
          </h2>
          <div className="space-y-2">
            {upcomingAnniversaries.map((anniv) => (
              <Link
                key={anniv.id}
                to="/calendar"
                className="card flex items-center justify-between hover:shadow-soft transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="tag">{getAnniversaryTypeLabel(anniv.type)}</div>
                  <div>
                    <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{anniv.title}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>{formatDateShort(anniv.date)}</p>
                  </div>
                </div>
                <div className="text-right">
                  {anniv.days_left === 0 ? (
                    <span className="font-bold text-sm" style={{ color: '#E74C3C' }}>今天</span>
                  ) : (
                    <span className="font-bold text-sm" style={{ color: 'var(--color-text-light)' }}>
                      {anniv.days_left} 天后
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Feature Cards Grid */}
      <div>
        <h2 className="font-bold mb-3" style={{ color: 'var(--color-text)' }}>功能入口</h2>
        <div className="grid grid-cols-2 gap-3">
          <FeatureCard
            to="/wishes"
            title="愿望清单"
            icon="✨"
            description="一起想做的事"
          />
          <FeatureCard
            to="/albums"
            title="相册"
            icon="🖼️"
            description="美好瞬间记录"
          />
          <FeatureCard
            to="/wallet"
            title="恋爱账本"
            icon="💰"
            description="支出·罚款·钱包"
          />
          <FeatureCard
            to="/memos"
            title="备忘录"
            icon="📝"
            description="共享·想法·记录"
          />
          <FeatureCard
            to="/weekly"
            title="周总结"
            icon="📊"
            description="每周·回顾·对比"
          />
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ to, title, icon, description }) {
  return (
    <Link
      to={to}
      className="card flex flex-col items-center text-center hover:shadow-soft transition-all hover:-translate-y-0.5 active:scale-95"
    >
      <span className="text-3xl mb-2">{icon}</span>
      <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{title}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{description}</p>
    </Link>
  )
}