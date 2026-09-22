import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import Icon from '../components/Icon.jsx'

export default function KBItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { invalidateByPrefix } = useDataCache()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadItem()
  }, [id])

  async function loadItem() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      if (!data) {
        alert('条目不存在')
        navigate('/knowledge', { replace: true })
        return
      }
      setItem(data)
    } catch (err) {
      console.error('加载条目失败:', err)
      alert('加载失败: ' + err.message)
      navigate('/knowledge', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('确定要删除这个条目吗？')) return
    try {
      const { error } = await supabase.from('knowledge_base').delete().eq('id', id)
      if (error) throw error
      invalidateByPrefix('knowledge_base')
      navigate('/knowledge')
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  if (!item) return null

  const isMale = profile?.gender === 'male'

  return (
    <div className="space-y-4 animate-fade-in">
      {loading && (
        <div className="glass-pill fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-xs flex items-center gap-2">
          <Icon name="book" size={16} /> 加载中...
        </div>
      )}
      <div className="feature-page-header flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <span>←</span> 返回
        </button>
        <h1 className="page-title">
          <Icon name="book" size={20} /> 条目详情
        </h1>
        <div className="w-16" />
      </div>

      {/* Title Card */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {item.tags && item.tags.map((tag, i) => (
            <span
              key={i}
              className="tag"
              style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
            >
              #{tag}
            </span>
          ))}
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>{item.title}</h2>
        <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
          创建于 {new Date(item.created_at).toLocaleString('zh-CN')}
          {item.updated_at && item.updated_at !== item.created_at &&
            ` · 更新于 ${new Date(item.updated_at).toLocaleString('zh-CN')}`}
        </p>
      </div>

      {/* Male Solution */}
      {item.content_male && (
        <div className={`card ${isMale ? 'border-2' : ''}`} style={isMale ? { borderColor: 'var(--color-primary)' } : {}}>
          <div className="flex items-center gap-2 mb-2">
            <Icon name="user" size={19} />
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>男生应该怎么做</h3>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text)' }}>
            {item.content_male}
          </div>
        </div>
      )}

      {/* Female Solution */}
      {item.content_female && (
        <div className={`card ${!isMale ? 'border-2' : ''}`} style={!isMale ? { borderColor: 'var(--color-primary)' } : {}}>
          <div className="flex items-center gap-2 mb-2">
            <Icon name="user" size={19} />
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>女生应该怎么做</h3>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text)' }}>
            {item.content_female}
          </div>
        </div>
      )}

      {!item.content_male && !item.content_female && (
        <div className="card text-center" style={{ color: 'var(--color-text-light)' }}>
          暂无解决方法内容
        </div>
      )}

      {/* Actions */}
      <div className="card flex gap-3">
        <button
          onClick={() => navigate(`/knowledge/${id}/edit`)}
          className="btn-primary flex-1"
        >
          <Icon name="pencil" size={16} /> 编辑
        </button>
        <button onClick={handleDelete} className="btn-danger flex-1">
          <Icon name="trash" size={16} /> 删除
        </button>
      </div>
    </div>
  )
}
