import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { DataCacheProvider } from './contexts/DataCacheContext.jsx'
import { PresenceProvider } from './contexts/PresenceContext.jsx'
import Layout from './components/Layout.jsx'
import Icon from './components/Icon.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'

// 懒加载页面组件
const Home = lazy(() => import('./pages/Home.jsx'))
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase.jsx'))
const KBItemDetail = lazy(() => import('./pages/KBItemDetail.jsx'))
const KBItemForm = lazy(() => import('./pages/KBItemForm.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Calendar = lazy(() => import('./pages/Calendar.jsx'))
const Wishes = lazy(() => import('./pages/Wishes.jsx'))
const Albums = lazy(() => import('./pages/Albums.jsx'))
const Memos = lazy(() => import('./pages/Memos.jsx'))
const Notifications = lazy(() => import('./pages/Notifications.jsx'))
const WeeklySummaries = lazy(() => import('./pages/WeeklySummaries.jsx'))
const Reflections = lazy(() => import('./pages/Reflections.jsx'))
const SweetShop = lazy(() => import('./pages/SweetShop.jsx'))
const CheckIns = lazy(() => import('./pages/CheckIns.jsx'))
const FutureLetters = lazy(() => import('./pages/FutureLetters.jsx'))

const HOME_PREVIEW_DATA = {
  profile: { id: 'preview-me', nickname: '小蓝', avatar_url: '' },
  partnerProfile: { id: 'preview-partner', nickname: '小樱', avatar_url: '' },
  startDate: '2025-01-29',
  todayDiaries: [
    { id: 'preview-diary-1', author_id: 'preview-me', mood: 'happy', content: '忙完以后一起吃了晚饭，今天也很开心。', created_at: new Date().toISOString() },
    { id: 'preview-diary-2', author_id: 'preview-partner', mood: 'sweet', content: '被认真惦记着，就是今天最甜的事情。', created_at: new Date().toISOString() }
  ],
  anniversaries: []
}

const CALENDAR_PREVIEW_DATA = {
  diaries: [],
  todos: [],
  anniversaries: [
    { id: 'preview-love', title: '我们的纪念日', date: '2026-09-21', type: 'love', is_repeat_yearly: true, remind_enabled: true, remind_time: '20:00' },
    { id: 'preview-birthday', title: '小蓝生日', date: '2026-09-08', type: 'birthday', is_repeat_yearly: true, remind_enabled: false },
    { id: 'preview-holiday', title: '第一次旅行', date: '2026-09-15', type: 'holiday', is_repeat_yearly: true, remind_enabled: false },
    { id: 'preview-other', title: '搬进新家的日子', date: '2026-09-28', type: 'other', is_repeat_yearly: true, remind_enabled: false }
  ]
}

function PageLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-pulse text-sm" style={{ color: 'var(--color-text-light)' }}>
        <Icon name="circle" size={16} className="mr-2" />加载中...
      </div>
    </div>
  )
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">加载中...</div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">加载中...</div>
      </div>
    )
  }
  if (user) return <Navigate to="/" replace />
  return children
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center">
        <Icon name="search" size={38} className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>页面走丢了</h1>
        <p className="mb-6" style={{ color: 'var(--color-text-light)' }}>宝宝，这个页面找不到了哦~</p>
        <button onClick={() => navigate('/')} className="btn-primary">
          返回首页
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <DataCacheProvider>
        <PresenceProvider>
          <Suspense fallback={<PageLoading />}>
          <Routes>
            {import.meta.env.DEV && (
              <Route path="/__preview" element={<Layout />}>
                <Route path="home" element={<Home previewData={HOME_PREVIEW_DATA} />} />
                <Route path="calendar" element={<Calendar previewData={CALENDAR_PREVIEW_DATA} />} />
                <Route path="shop" element={<SweetShop preview />} />
                <Route path="check-ins" element={<CheckIns preview />} />
                <Route path="future-letters" element={<FutureLetters preview />} />
              </Route>
            )}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              }
            />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              <Route index element={<Home />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="knowledge" element={<KnowledgeBase />} />
              <Route path="knowledge/new" element={<KBItemForm />} />
              <Route path="knowledge/:id" element={<KBItemDetail />} />
              <Route path="knowledge/:id/edit" element={<KBItemForm />} />
              <Route path="wishes" element={<Wishes />} />
              <Route path="albums" element={<Albums />} />
              <Route path="wallet" element={<Navigate to="/shop" replace />} />
              <Route path="shop" element={<SweetShop />} />
              <Route path="check-ins" element={<CheckIns />} />
              <Route path="future-letters" element={<FutureLetters />} />
              <Route path="memos" element={<Memos />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="weekly" element={<WeeklySummaries />} />
              <Route path="reflections" element={<Reflections />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </Suspense>
        </PresenceProvider>
      </DataCacheProvider>
    </ThemeProvider>
  )
}
