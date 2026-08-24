import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { DataCacheProvider } from './contexts/DataCacheContext.jsx'
import Layout from './components/Layout.jsx'
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
const Wallet = lazy(() => import('./pages/Wallet.jsx'))
const Memos = lazy(() => import('./pages/Memos.jsx'))
const WeeklySummaries = lazy(() => import('./pages/WeeklySummaries.jsx'))

function PageLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-pulse text-sm" style={{ color: 'var(--color-text-light)' }}>
        <span className="mr-2">🐱</span>加载中...
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="text-center">
        <span className="text-6xl mb-4 block">🐱</span>
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
        <Suspense fallback={<PageLoading />}>
          <Routes>
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
              <Route path="wallet" element={<Wallet />} />
              <Route path="memos" element={<Memos />} />
              <Route path="weekly" element={<WeeklySummaries />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </DataCacheProvider>
    </ThemeProvider>
  )
}