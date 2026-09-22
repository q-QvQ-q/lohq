import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { daysBetween, daysUntil, formatDateShort, getAnniversaryTypeLabel } from '../utils/dateUtils.js'
import Icon from '../components/Icon.jsx'
import ProfileAvatar from '../components/ProfileAvatar.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { usePresence } from '../contexts/PresenceContext.jsx'

const MOODS = {
  happy: { icon: 'sun', label: '开心' },
  sweet: { icon: 'heart', label: '甜蜜' },
  normal: { icon: 'circle', label: '平静' },
  sad: { icon: 'moon', label: '难过' },
  angry: { icon: 'x', label: '生气' }
}

const QUICK_LINKS = [
  { to: '/albums', title: '我们的相册', icon: 'image', description: '收藏一起的瞬间' },
  { to: '/wishes', title: '愿望清单', icon: 'sparkle', description: '把以后慢慢实现' },
  { to: '/shop', title: '点单小店', icon: 'shop', description: '用甜心币兑换小心愿' },
  { to: '/check-ins', title: '打卡评价', icon: 'mapPin', description: '收藏一起体验过的地方' },
  { to: '/future-letters', title: '未来信件', icon: 'envelope', description: '写给未来某一天的我们' },
  { to: '/memos', title: '备忘录', icon: 'note', description: '留下彼此的提醒' },
  { to: '/reflections', title: '检讨书', icon: 'file', description: '认真写下想说的话' },
  { to: '/weekly', title: '周总结', icon: 'chart', description: '回顾这一周的我们' }
]

function localDayRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

function formatOnlineTime(value) {
  if (!value) return '离线'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '在线'
  return `${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 上线`
}

function formatLastLogin(value) {
  if (!value) return '暂无登录记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无登录记录'
  const now = new Date()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const loggedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.round((today - loggedDay) / 86400000)
  if (dayDiff === 0) return `上次登录 ${time}`
  if (dayDiff === 1) return `昨天 ${time}`
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

export default function Home({ previewData = null }) {
  const auth = useAuth()
  const profile = previewData?.profile || auth.profile
  const partnerProfile = previewData?.partnerProfile || auth.partnerProfile
  const { fetchWithCache } = useDataCache()
  const { onlineSince: liveOnlineSince } = usePresence()
  const [startDate, setStartDate] = useState(previewData?.startDate || '2025-01-29')
  const [anniversaries, setAnniversaries] = useState(previewData?.anniversaries || [])
  const [todayDiaries, setTodayDiaries] = useState(previewData?.todayDiaries || [])
  const [lastLoginAt, setLastLoginAt] = useState(() => {
    if (!previewData) return {}
    const now = new Date().toISOString()
    return {
      [previewData.profile?.id]: now,
      [previewData.partnerProfile?.id]: now
    }
  })
  const [missYouState, setMissYouState] = useState('idle')
  const [loading, setLoading] = useState(!previewData)

  const today = useMemo(() => new Date(), [])
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const onlineSince = useMemo(() => {
    if (!previewData) return liveOnlineSince
    const now = new Date().toISOString()
    return { [previewData.profile?.id]: now, [previewData.partnerProfile?.id]: now }
  }, [previewData, liveOnlineSince])

  useEffect(() => {
    if (previewData) return
    loadData()
  }, [profile?.id, previewData])

  useEffect(() => {
    if (previewData || !profile?.id) return undefined

    const refreshLastLogins = async () => {
      const profileIds = [profile.id, partnerProfile?.id].filter(Boolean)
      const { data } = await supabase.from('profiles').select('*').in('id', profileIds)
      if (!data) return
      setLastLoginAt(current => {
        const next = { ...current }
        data.forEach(person => {
          if (person.last_login_at) next[person.id] = person.last_login_at
        })
        return next
      })
    }

    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') refreshLastLogins()
    }
    refreshLastLogins()
    const refreshInterval = window.setInterval(refreshLastLogins, 20000)
    document.addEventListener('visibilitychange', refreshOnVisible)

    return () => {
      window.clearInterval(refreshInterval)
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [profile?.id, partnerProfile?.id, previewData])

  useEffect(() => {
    setLastLoginAt(current => {
      const next = { ...current }
      if (profile?.id && profile.last_login_at) next[profile.id] = profile.last_login_at
      if (partnerProfile?.id && partnerProfile.last_login_at) next[partnerProfile.id] = partnerProfile.last_login_at
      return next
    })
  }, [profile?.id, profile?.last_login_at, partnerProfile?.id, partnerProfile?.last_login_at])

  async function loadData() {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    try {
      const { start, end } = localDayRange(today)
      const [annivData, diaryData] = await Promise.all([
        fetchWithCache('anniversaries', async () => {
          const { data } = await supabase
            .from('anniversaries')
            .select('*')
            .order('date', { ascending: true })
          return data || []
        }),
        fetchWithCache(`diaries_today_${todayKey}`, async () => {
          const { data } = await supabase
            .from('diaries')
            .select('id, author_id, mood, content, created_at')
            .gte('created_at', start)
            .lt('created_at', end)
            .order('created_at', { ascending: false })
          return data || []
        }, { ttl: 15000 })
      ])
      setAnniversaries(annivData)
      setTodayDiaries(diaryData)
      if (profile?.love_start_date) setStartDate(profile.love_start_date)
    } catch (err) {
      console.error('加载首页数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalDays = daysBetween(startDate)
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  }).format(today)

  const latestDiaryByAuthor = useMemo(() => {
    const map = new Map()
    todayDiaries.forEach(diary => {
      if (!map.has(diary.author_id)) map.set(diary.author_id, diary)
    })
    return map
  }, [todayDiaries])

  const people = [
    { profile, diary: latestDiaryByAuthor.get(profile?.id), fallback: '我' },
    { profile: partnerProfile, diary: latestDiaryByAuthor.get(partnerProfile?.id), fallback: '伴侣' }
  ]

  const upcomingAnniversaries = anniversaries
    .filter(item => item.date)
    .map(item => ({ ...item, days_left: daysUntil(item.date, item.is_repeat_yearly) }))
    .filter(item => item.days_left >= 0 && item.days_left <= 60)
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 2)

  async function sendMissYouReminder() {
    if (missYouState === 'sending') return
    if (!profile?.partner_id || !partnerProfile?.id) {
      setMissYouState('unavailable')
      window.setTimeout(() => setMissYouState('idle'), 2400)
      return
    }

    if (previewData) {
      setMissYouState('sent')
      window.setTimeout(() => setMissYouState('idle'), 2400)
      return
    }

    setMissYouState('sending')
    const { error } = await supabase
      .from('notifications')
      .insert({
        recipient_id: profile.partner_id,
        actor_id: profile.id,
        type: 'miss_you',
        title: '对方正在想念你',
        body: `${profile.nickname || '对方'}正在想念你`,
        resource_path: '/'
      })

    setMissYouState(error ? 'failed' : 'sent')
    window.setTimeout(() => setMissYouState('idle'), 2400)
  }

  return (
    <div className="home-memory max-w-2xl mx-auto animate-fade-in">
      {loading && (
        <div className="glass-pill fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-xs flex items-center gap-2">
          <Icon name="home" size={16} /> 正在打开我们的小窝
        </div>
      )}

      <section className="memory-hero" aria-labelledby="days-together-title">
        <div className="memory-hero__counter">
          <p id="days-together-title">我们已经相伴</p>
          <div className="memory-hero__number">
            <strong>{totalDays}</strong><span>天</span>
          </div>
        </div>

        <div className="couple-portraits" aria-label="我们的头像">
          <div className="couple-portrait">
            <ProfileAvatar profile={profile} size={68} />
            <div className="couple-portrait__meta">
              <span>{profile?.nickname || '我'}</span>
              <small className={onlineSince[profile?.id] ? 'is-online' : ''}>
                <i aria-hidden="true" />{onlineSince[profile?.id] ? formatOnlineTime(onlineSince[profile?.id]) : formatLastLogin(lastLoginAt[profile?.id])}
              </small>
            </div>
          </div>
          <button
            type="button"
            className={`couple-portraits__heart ${missYouState !== 'idle' ? `is-${missYouState}` : ''}`}
            onClick={sendMissYouReminder}
            disabled={missYouState === 'sending'}
            title={missYouState === 'sent' ? '已提醒对方' : missYouState === 'unavailable' ? '绑定伴侣后即可使用' : missYouState === 'failed' ? '发送失败，请稍后再试' : '提醒对方：我正在想念你'}
            aria-label={missYouState === 'sent' ? '已提醒对方' : missYouState === 'unavailable' ? '绑定伴侣后即可使用想念提醒' : missYouState === 'failed' ? '发送失败，请稍后再试' : '提醒对方：我正在想念你'}
          >
            <Icon name={missYouState === 'sent' ? 'check' : missYouState === 'failed' ? 'x' : 'heart'} size={22} />
          </button>
          <div className="couple-portrait">
            <ProfileAvatar profile={partnerProfile} size={68} />
            <div className="couple-portrait__meta">
              <span>{partnerProfile?.nickname || '伴侣'}</span>
              <small className={onlineSince[partnerProfile?.id] ? 'is-online' : ''}>
                <i aria-hidden="true" />{onlineSince[partnerProfile?.id] ? formatOnlineTime(onlineSince[partnerProfile?.id]) : formatLastLogin(lastLoginAt[partnerProfile?.id])}
              </small>
            </div>
          </div>
        </div>

        <div className="memory-hero__since">
          <span className="memory-hero__line" aria-hidden="true" />
          <time dateTime={todayKey}>{dateLabel}</time>
          <span className="memory-hero__line" aria-hidden="true" />
        </div>
      </section>

      <section className="mood-section" aria-labelledby="today-mood-title">
        <div className="section-heading">
          <div>
            <h2 id="today-mood-title">心情交换站</h2>
          </div>
          <Link to="/calendar?tab=diary" className="section-link">去写日记</Link>
        </div>
        <div className="mood-grid">
          {people.map(({ profile: person, diary, fallback }, index) => {
            const mood = MOODS[diary?.mood] || null
            return (
              <Link
                key={person?.id || fallback}
                to={`/calendar?date=${todayKey}&tab=diary`}
                className={`mood-card mood-card--${index === 0 ? 'mine' : 'theirs'}`}
                aria-label={`${person?.nickname || fallback}：${mood?.label || '待记录'}`}
              >
                <div className="mood-card__person">
                  <ProfileAvatar profile={person} size={36} />
                </div>
                <strong>{mood?.label || '待记录'}</strong>
                <span className="mood-card__icon"><Icon name={mood?.icon || 'note'} size={19} /></span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="quick-section" aria-labelledby="quick-title">
        <div className="section-heading">
          <div>
            <h2 id="quick-title">我们的日常</h2>
          </div>
        </div>
        <div className="quick-grid">
          {QUICK_LINKS.map(item => <QuickCard key={item.to} {...item} preview={Boolean(previewData)} />)}
        </div>
      </section>

      {upcomingAnniversaries.length > 0 && (
        <section className="upcoming-strip" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title"><Icon name="calendar" size={17} /> 快到的日子</h2>
          <div className="upcoming-strip__items">
            {upcomingAnniversaries.map(item => (
              <Link key={item.id} to="/calendar" className="upcoming-item">
                <span>{getAnniversaryTypeLabel(item.type)}</span>
                <div><strong>{item.title}</strong><small>{formatDateShort(item.date)}</small></div>
                <b>{item.days_left === 0 ? '今天' : `${item.days_left} 天后`}</b>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function QuickCard({ to, title, icon, description, preview = false }) {
  return (
    <Link to={preview && ['/shop', '/check-ins', '/future-letters'].includes(to) ? `/__preview${to}` : to} className="quick-card">
      <span className="quick-card__icon"><Icon name={icon} size={20} /></span>
      <div><strong>{title}</strong><p>{description}</p></div>
      <Icon name="chevronRight" size={17} className="quick-card__arrow" />
    </Link>
  )
}
