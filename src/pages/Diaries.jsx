import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { formatDate, formatDateTime } from '../utils/dateUtils.js'

const MOODS = {
  happy: { emoji: '😊', label: '开心', color: '#FFD93D' },
  sweet: { emoji: '🥰', label: '甜蜜', color: '#FFB5C5' },
  normal: { emoji: '😐', label: '一般', color: '#B8C4D0' },
  sad: { emoji: '😢', label: '难过', color: '#6B9BFF' },
  angry: { emoji: '😤', label: '生气', color: '#FF6B6B' }
}

export default function Diaries() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [diaries, setDiaries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDiaries()
  }, [])

  async function loadDiaries() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('diaries')
        .select(`
          *,
          author:profiles!inner(nickname, gender)
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      setDiaries(data || [])
    } catch (err) {
      console.error('加载日记失败:', err)
      alert('加载日记失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('确定要删除这篇日记吗？')) return
    try {
      const { error } = await supabase
        .from('diaries')
        .delete()
        .eq('id', id)
      if (error) throw error
      setDiaries(diaries.filter(d => d.id !== id))
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs flex items-center gap-2"
             style={{ backgroundColor: 'var(--color-primary)', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <span className="animate-spin">📖</span> 加载中...
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <span>←</span> 返回
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          <span>📔</span> 心情日记
        </h1>
        <div style={{ width: '50px' }}></div>
      </div>

      {/* Diary List */}
      {diaries.length === 0 ? (
        <div className="text-center py-16 card">
          <span className="text-5xl mb-4 block">🐱</span>
          <p style={{ color: 'var(--color-text-light)' }}>还没有日记哦</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
            点击下面的按钮，记录今天的心情吧~
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {diaries.map((diary) => {
            const mood = MOODS[diary.mood] || MOODS.normal
            const isOwn = diary.author_id === profile?.id
            return (
              <div key={diary.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ backgroundColor: mood.color + '33', color: mood.color }}
                    >
                      {diary.author?.nickname?.[0] || '宝'}
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                        {diary.author?.nickname || '宝宝'}
                        {isOwn && (
                          <span className="ml-1 text-xs" style={{ color: 'var(--color-primary-dark)' }}>
                            (我)
                          </span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                        {formatDateTime(diary.created_at)}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xl p-2 rounded-full"
                    style={{ backgroundColor: mood.color + '20' }}
                    title={mood.label}
                  >
                    {mood.emoji}
                  </span>
                </div>
                
                <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--color-text)', lineHeight: 1.6 }}>
                  {diary.content}
                </p>

                {diary.images && diary.images.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {diary.images.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt="日记图片"
                        className="w-full aspect-square object-cover rounded-lg"
                      />
                    ))}
                  </div>
                )}

                {isOwn && (
                  <div className="flex justify-end mt-3 pt-3" style={{ borderTop: '1px solid var(--color-primary-light)' }}>
                    <button
                      onClick={() => handleDelete(diary.id)}
                      className="text-xs hover:opacity-70 transition-opacity"
                      style={{ color: '#E74C3C' }}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Floating Add Button */}
      <Link
        to="/diaries/new"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          zIndex: 30
        }}
      >
        <span className="text-2xl">✏️</span>
      </Link>
    </div>
  )
}