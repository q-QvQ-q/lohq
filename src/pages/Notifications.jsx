import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase } from '../supabase/client.js'
import { formatDateTime } from '../utils/dateUtils.js'

export default function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    let active = true
    const load = async () => {
      const { data, error } = await supabase.from('notifications').select('*')
        .eq('recipient_id', user.id).is('read_at', null)
        .order('created_at', { ascending: false }).limit(100)
      if (active) {
        if (error) console.error('加载提醒失败:', error)
        else {
          let resolved = data || []
          const legacy = resolved.filter(item => item.type === 'memo_comment' && item.resource_path === '/memos')
          if (legacy.length) {
            const [commentResult, memoResult] = await Promise.all([
              supabase.from('memo_comments').select('memo_id, author_id, content, created_at'),
              supabase.from('memos').select('id, title, created_at')
            ])
            if (!commentResult.error && !memoResult.error) {
              const memos = new Map((memoResult.data || []).map(memo => [memo.id, memo]))
              resolved = resolved.map(item => {
                if (item.type !== 'memo_comment' || item.resource_path !== '/memos') return item
                const match = (commentResult.data || [])
                  .filter(comment => comment.author_id === item.actor_id && comment.content === item.body)
                  .map(comment => ({ comment, distance: Math.abs(new Date(comment.created_at) - new Date(item.created_at)) }))
                  .filter(candidate => candidate.distance < 120000)
                  .sort((a, b) => a.distance - b.distance)[0]?.comment
                const memo = memos.get(match?.memo_id)
                return memo ? {
                  ...item,
                  resource_path: `/memos?memo=${memo.id}`,
                  title: `${new Date(memo.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}的备忘录有新评论`,
                  body: `${memo.title ? `${memo.title} · ` : ''}${item.body || ''}`
                } : item
              })
            }
          }
          if (active) setItems(resolved)
        }
        setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [user?.id])

  async function openItem(item) {
    if (opening) return
    setOpening(item.id)
    const { error } = await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', item.id).eq('recipient_id', user.id)
    if (error) {
      alert('打开提醒失败: ' + error.message)
      setOpening(null)
      return
    }
    setItems(current => current.filter(entry => entry.id !== item.id))
    window.dispatchEvent(new Event('notifications-changed'))
    navigate(item.resource_path?.startsWith('/') ? item.resource_path : '/memos')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>← 返回</button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>🔔 提醒</h1>
        <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{items.length} 条未读</span>
      </div>
      {loading ? <p className="text-center text-sm">加载中...</p> : items.length === 0 ? (
        <div className="card text-center py-10 text-sm" style={{ color: 'var(--color-text-light)' }}>暂时没有新提醒</div>
      ) : items.map(item => (
        <button key={item.id} type="button" disabled={!!opening} onClick={() => openItem(item)}
          className="card w-full text-left block disabled:opacity-60">
          <div className="flex justify-between gap-3">
            <strong className="text-sm" style={{ color: 'var(--color-text)' }}>{item.title}</strong>
            <time className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-light)' }}>{formatDateTime(item.created_at)}</time>
          </div>
          {item.body && <p className="text-xs mt-2 break-words" style={{ color: 'var(--color-text-light)' }}>{item.body}</p>}
          <p className="text-xs mt-2" style={{ color: 'var(--color-primary-dark)' }}>查看对应备忘录 →</p>
        </button>
      ))}
    </div>
  )
}
