import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { formatTime } from '../utils/dateUtils.js'

function RatingStars({ value = 0, onChange, readOnly = false }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={value ? `${value} 星评分` : '未评分'}>
      {[1, 2, 3, 4, 5].map(score => (
        <button
          key={score}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(score)}
          className={`text-base leading-none ${readOnly ? 'cursor-default' : 'active:scale-90'}`}
          style={{ color: score <= value ? '#F5A623' : '#D8D8D8' }}
          aria-label={`${score} 星`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function Memos() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { fetchWithCache, invalidateByPrefix, profileMap } = useDataCache()
  const nameOf = (id, fallback = '宝宝') => id ? (profileMap[id]?.nickname || fallback) : fallback
  const [memos, setMemos] = useState([])
  const [comments, setComments] = useState({})
  const [ratings, setRatings] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingMemo, setEditingMemo] = useState(null)
  const [newMemo, setNewMemo] = useState({ title: '', content: '' })
  const [expandedMemos, setExpandedMemos] = useState({})
  const [commentInputs, setCommentInputs] = useState({})

  useEffect(() => {
    loadMemos()
  }, [profile?.id])

  async function loadMemos() {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      // 并行加载 memo 和评论
      const [data, commentsResult, ratingsResult] = await Promise.all([
        fetchWithCache('memos', async () => {
          const { data } = await supabase
            .from('memos')
            .select('*')
            .order('updated_at', { ascending: false })
          return data || []
        }),
        supabase
          .from('memo_comments')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('memo_ratings')
          .select('*')
      ])
      
      if (commentsResult.data) {
        const commentsMap = {}
        commentsResult.data.forEach(c => {
          if (!commentsMap[c.memo_id]) commentsMap[c.memo_id] = []
          commentsMap[c.memo_id].push(c)
        })
        setComments(commentsMap)
      }

      if (ratingsResult.data) {
        const ratingsMap = {}
        ratingsResult.data.forEach(rating => { ratingsMap[rating.memo_id] = rating })
        setRatings(ratingsMap)
      }
      
      setMemos(data || [])
    } catch (err) {
      console.error('加载失败:', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveMemo() {
    if (!newMemo.content.trim()) {
      alert('请填写内容')
      return
    }
    
    try {
      if (editingMemo) {
        const { error } = await supabase
          .from('memos')
          .update({
            title: newMemo.title || null,
            content: newMemo.content,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingMemo.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('memos')
          .insert({
            title: newMemo.title || null,
            content: newMemo.content,
            author_id: profile.id
          })
        if (error) throw error
      }
      
      setShowModal(false)
      setEditingMemo(null)
      setNewMemo({ title: '', content: '' })
      invalidateByPrefix('memos')
      await loadMemos()
    } catch (err) {
      alert('保存失败: ' + err.message)
    }
  }

  async function deleteMemo(id) {
    if (!confirm('确定删除这条备忘录吗？相关评论也会被删除。')) return
    try {
      const { error } = await supabase
        .from('memos')
        .delete()
        .eq('id', id)
      if (error) throw error
      invalidateByPrefix('memos')
      await loadMemos()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  async function addComment(memoId) {
    const content = commentInputs[memoId]?.trim()
    if (!content) return
    
    try {
      const { error } = await supabase
        .from('memo_comments')
        .insert({
          memo_id: memoId,
          content: content,
          author_id: profile.id
        })
      if (error) throw error

      // Notification delivery is deliberately independent of saving the
      // comment, so older databases keep accepting comments until migrated.
      if (profile?.partner_id) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            recipient_id: profile.partner_id,
            actor_id: profile.id,
            type: 'memo_comment',
            title: '宝宝评论了你的备忘录',
            body: content,
            resource_path: '/memos'
          })
        if (notificationError) console.warn('提醒未发送:', notificationError.message)
      }
      
      setCommentInputs(prev => ({ ...prev, [memoId]: '' }))
      invalidateByPrefix('memos')
      await loadMemos()
    } catch (err) {
      alert('评论失败: ' + err.message)
    }
  }

  async function deleteComment(id) {
    if (!confirm('确定删除这条评论吗？')) return
    try {
      const { error } = await supabase
        .from('memo_comments')
        .delete()
        .eq('id', id)
      if (error) throw error
      invalidateByPrefix('memos')
      await loadMemos()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  async function saveRating(memoId, score) {
    if (!profile?.id) return
    const previous = ratings[memoId]
    const optimisticRating = {
      ...(previous || {}),
      memo_id: memoId,
      reviewer_id: profile.id,
      score
    }
    setRatings(current => ({ ...current, [memoId]: optimisticRating }))

    try {
      const { data, error } = await supabase
        .from('memo_ratings')
        .upsert({ memo_id: memoId, reviewer_id: profile.id, score, updated_at: new Date().toISOString() }, { onConflict: 'memo_id,reviewer_id' })
        .select()
        .single()
      if (error) throw error
      setRatings(current => ({ ...current, [memoId]: data }))
    } catch (err) {
      setRatings(current => {
        const next = { ...current }
        if (previous) next[memoId] = previous
        else delete next[memoId]
        return next
      })
      alert('评分保存失败: ' + err.message)
    }
  }

  function toggleExpand(memoId) {
    setExpandedMemos(prev => ({ ...prev, [memoId]: !prev[memoId] }))
  }

  function openEditModal(memo) {
    setEditingMemo(memo)
    setNewMemo({
      title: memo.title || '',
      content: memo.content
    })
    setShowModal(true)
  }

  function openCreateModal() {
    setEditingMemo(null)
    setNewMemo({ title: '', content: '' })
    setShowModal(true)
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs flex items-center gap-2"
             style={{ backgroundColor: 'var(--color-primary)', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <span className="animate-spin">📝</span> 加载中...
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
          <span>📝</span> 备忘录
        </h1>
        <button
          onClick={openCreateModal}
          className="text-sm font-bold hover:opacity-70"
          style={{ color: 'var(--color-primary-dark)' }}
        >
          + 新建
        </button>
      </div>

      {/* 备忘录列表 */}
      <div className="space-y-3">
        {memos.length === 0 ? (
          <div className="text-center py-12 card">
            <span className="text-4xl block mb-3">📝</span>
            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              还没有备忘录
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
              点击"新建"开始记录吧
            </p>
          </div>
        ) : (
          memos.map(memo => {
            const memoComments = comments[memo.id] || []
            const isExpanded = expandedMemos[memo.id] || false
            
            return (
              <div key={memo.id} className="card relative group">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {memo.title && (
                      <h3 className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                        {memo.title}
                      </h3>
                    )}
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                      {memo.content}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditModal(memo)}
                      className="text-xs hover:opacity-70 px-2"
                      style={{ color: 'var(--color-text-light)' }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => deleteMemo(memo.id)}
                      className="text-xs hover:opacity-70 px-2"
                      style={{ color: '#E74C3C' }}
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-2 flex items-center justify-between" style={{ borderTop: '1px dashed var(--color-primary-light)' }}>
                  {memo.author_id === profile?.id ? (
                    <>
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>宝宝的评价</span>
                      {ratings[memo.id] ? (
                        <RatingStars value={ratings[memo.id].score} readOnly />
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.7 }}>等待评价</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>给这条备忘录评分</span>
                      <RatingStars value={ratings[memo.id]?.score || 0} onChange={(score) => saveRating(memo.id, score)} />
                    </>
                  )}
                </div>
                
                <div className="flex items-center gap-2 mt-3 pt-2" style={{ borderTop: '1px solid var(--color-primary-light)' }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs" 
                       style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>
                    {nameOf(memo.author_id)[0]}
                  </div>
                  <span className="text-xs font-bold" style={{ color: 'var(--color-text-light)' }}>
                    {nameOf(memo.author_id)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                    {formatTime(memo.updated_at)}
                  </span>
                  {memo.created_at !== memo.updated_at && (
                    <span className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                      · 已编辑
                    </span>
                  )}
                  <button
                    onClick={() => toggleExpand(memo.id)}
                    className="ml-auto text-xs flex items-center gap-1 hover:opacity-70"
                    style={{ color: 'var(--color-text-light)' }}
                  >
                    💬 {memoComments.length} 条评论 {isExpanded ? '▲' : '▼'}
                  </button>
                </div>

                {/* 评论区域 */}
                {isExpanded && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--color-primary-light)' }}>
                    {/* 评论列表 */}
                    {memoComments.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {memoComments.map(comment => (
                          <div key={comment.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-primary-light)' }}>
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0" 
                                 style={{ backgroundColor: 'var(--color-primary-dark)', color: 'white' }}>
                              {(comment.author_profile?.nickname || '宝')[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                                  {nameOf(comment.author_id)}
                                </span>
                                <span className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                                  {formatTime(comment.created_at)}
                                </span>
                              </div>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text)' }}>
                                {comment.content}
                              </p>
                            </div>
                            {comment.author_id === profile?.id && (
                              <button
                                onClick={() => deleteComment(comment.id)}
                                className="text-xs hover:opacity-70 flex-shrink-0"
                                style={{ color: 'var(--color-text-light)' }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-center mb-3" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                        还没有评论，来留个言吧
                      </p>
                    )}

                    {/* 添加评论 */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commentInputs[memo.id] || ''}
                        onChange={(e) => setCommentInputs(prev => ({ ...prev, [memo.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && addComment(memo.id)}
                        placeholder="写评论..."
                        className="flex-1 p-2 rounded-lg text-xs"
                        style={{ 
                          backgroundColor: 'var(--color-primary-light)',
                          color: 'var(--color-text)',
                          border: 'none',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={() => addComment(memo.id)}
                        className="px-3 py-2 rounded-lg text-xs font-bold text-white"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                      >
                        发送
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card w-full max-w-md max-h-[80vh] overflow-y-auto">
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              {editingMemo ? '✏️ 编辑备忘录' : '📝 新建备忘录'}
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text-light)' }}>
                  标题（可选）
                </label>
                <input
                  type="text"
                  value={newMemo.title}
                  onChange={(e) => setNewMemo({ ...newMemo, title: e.target.value })}
                  placeholder="给备忘录起个标题..."
                  className="w-full p-3 rounded-lg text-sm"
                  style={{ 
                    backgroundColor: 'var(--color-primary-light)',
                    color: 'var(--color-text)',
                    border: 'none',
                    outline: 'none'
                  }}
                />
              </div>
              
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text-light)' }}>
                  内容
                </label>
                <textarea
                  value={newMemo.content}
                  onChange={(e) => setNewMemo({ ...newMemo, content: e.target.value })}
                  placeholder="写下想记录的内容..."
                  rows={8}
                  className="w-full p-3 rounded-lg text-sm resize-none"
                  style={{ 
                    backgroundColor: 'var(--color-primary-light)',
                    color: 'var(--color-text)',
                    border: 'none',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setShowModal(false)
                  setEditingMemo(null)
                  setNewMemo({ title: '', content: '' })
                }}
                className="flex-1 py-2 rounded-lg text-sm font-bold"
                style={{ 
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-text)'
                }}
              >
                取消
              </button>
              <button
                onClick={saveMemo}
                className="flex-1 py-2 rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
