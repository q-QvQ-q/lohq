import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import Icon from '../components/Icon.jsx'

export default function Wishes() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { fetchWithCache, invalidateByPrefix } = useDataCache()
  const [wishes, setWishes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newWish, setNewWish] = useState({ content: '', note: '' })
  const [activeTab, setActiveTab] = useState('pending')

  useEffect(() => {
    loadWishes()
  }, [profile?.id])

  async function loadWishes() {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      const data = await fetchWithCache('wishes', async () => {
        const { data } = await supabase
          .from('wishes')
          .select('*')
          .order('is_completed', { ascending: true })
          .order('created_at', { ascending: false })
        return data || []
      })
      setWishes(data)
    } catch (err) {
      console.error('加载愿望失败:', err)
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function addWish() {
    if (!newWish.content.trim()) {
      alert('请输入愿望内容')
      return
    }
    if (!profile?.id) {
      alert('请先登录')
      return
    }
    try {
      const { error } = await supabase
        .from('wishes')
        .insert({
          content: newWish.content.trim(),
          note: newWish.note.trim() || null,
          created_by: profile.id
        })
      if (error) throw error
      setNewWish({ content: '', note: '' })
      setShowModal(false)
      invalidateByPrefix('wishes')
      await loadWishes()
    } catch (err) {
      alert('添加失败: ' + err.message)
    }
  }

  async function toggleComplete(id) {
    try {
      const wish = wishes.find(w => w.id === id)
      if (!wish) return
      
      const { data, error } = await supabase
        .from('wishes')
        .update({
          is_completed: !wish.is_completed,
          completed_at: !wish.is_completed ? new Date().toISOString() : null
        })
        .eq('id', id)
        .select()
      
      if (error) throw error
      invalidateByPrefix('wishes')
      await loadWishes()
    } catch (err) {
      console.error('操作失败:', err)
      alert('操作失败: ' + err.message)
    }
  }

  async function deleteWish(id) {
    if (!confirm('确定删除这个愿望吗？')) return
    try {
      const { error } = await supabase
        .from('wishes')
        .delete()
        .eq('id', id)
      if (error) throw error
      invalidateByPrefix('wishes')
      await loadWishes()
    } catch (err) {
      console.error('删除失败:', err)
      alert('删除失败: ' + err.message)
    }
  }

  const pendingWishes = wishes.filter(w => !w.is_completed)
  const completedWishes = wishes.filter(w => w.is_completed)

  return (
    <div className="space-y-4">
      {loading && (
        <div className="glass-pill fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-xs flex items-center gap-2">
          <Icon name="sparkle" size={16} /> 加载中...
        </div>
      )}
      {/* Header */}
      <div className="feature-page-header flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <span>←</span> 返回
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          <Icon name="sparkle" size={21} /> 愿望清单
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary text-sm"
        >
          <Icon name="plus" size={16} /> 添加
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--color-primary-light)' }}>
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'pending' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'pending' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          待实现 ({pendingWishes.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'completed' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'completed' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          已完成 ({completedWishes.length})
        </button>
      </div>

      {/* Pending Wishes Tab */}
      {activeTab === 'pending' && (
        <div>
          {pendingWishes.length === 0 ? (
            <div className="card text-center py-8">
              <Icon name="sparkle" size={26} className="mx-auto mb-2" />
              <p style={{ color: 'var(--color-text-light)' }}>还没有愿望哦</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                添加一个想和宝宝一起做的事吧
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingWishes.map(wish => (
                <div key={wish.id} className="card">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleComplete(wish.id)}
                      className="w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center hover:opacity-70 transition-opacity mt-0.5"
                      style={{ borderColor: 'var(--color-primary)' }}
                      title="标记为完成"
                    >
                      <Icon name="check" size={13} />
                    </button>
                    <div className="flex-1">
                      <p className="font-bold" style={{ color: 'var(--color-text)' }}>{wish.content}</p>
                      {wish.note && (
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
                          {wish.note}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteWish(wish.id)}
                      className="text-xs hover:opacity-70 px-1"
                      style={{ color: 'var(--color-text-light)' }}
                      title="删除"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed Wishes Tab */}
      {activeTab === 'completed' && (
        <div>
          {completedWishes.length === 0 ? (
            <div className="card text-center py-8">
              <Icon name="gift" size={26} className="mx-auto mb-2" />
              <p style={{ color: 'var(--color-text-light)' }}>还没有完成的愿望</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                完成愿望后会出现在这里
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {completedWishes.map(wish => (
                <div key={wish.id} className="card opacity-80" style={{ borderLeft: '4px solid var(--color-primary)' }}>
                  <div className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      <Icon name="check" size={13} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold line-through" style={{ color: 'var(--color-text-light)' }}>
                        {wish.content}
                      </p>
                      {wish.completed_at && (
                        <p className="text-xs mt-1" style={{ color: 'var(--color-primary-dark)' }}>
                          {new Date(wish.completed_at).toLocaleDateString()} 完成
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleComplete(wish.id)}
                        className="text-xs hover:opacity-70 px-1"
                        style={{ color: 'var(--color-text-light)' }}
                        title="撤销"
                      >
                        <Icon name="undo" size={16} />
                      </button>
                      <button
                        onClick={() => deleteWish(wish.id)}
                        className="text-xs hover:opacity-70 px-1"
                        style={{ color: 'var(--color-text-light)' }}
                        title="删除"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-surface" role="dialog" aria-modal="true" aria-label="添加愿望">
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              添加愿望
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newWish.content}
                onChange={(e) => setNewWish({ ...newWish, content: e.target.value })}
                placeholder="想和宝宝一起做的事"
                className="input-field"
                autoFocus
              />
              <textarea
                value={newWish.note}
                onChange={(e) => setNewWish({ ...newWish, note: e.target.value })}
                placeholder="详细说明（可选）"
                className="input-field w-full min-h-[60px] resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={addWish}
                className="btn-primary flex-1"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
