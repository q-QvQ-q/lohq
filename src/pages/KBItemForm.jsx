import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import Icon from '../components/Icon.jsx'

export default function KBItemForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { invalidateByPrefix } = useDataCache()
  const isEditing = !!id

  const [title, setTitle] = useState('')
  const [tags, setTags] = useState([])
  const [newTagInput, setNewTagInput] = useState('')
  const [allExistingTags, setAllExistingTags] = useState([])
  const [contentMale, setContentMale] = useState('')
  const [contentFemale, setContentFemale] = useState('')
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEditing) loadItem()
    loadExistingTags()
  }, [id])

  async function loadExistingTags() {
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('tags')
      if (error) throw error
      const tagSet = new Set()
      data?.forEach((item) => {
        if (item.tags && Array.isArray(item.tags)) {
          item.tags.forEach((t) => tagSet.add(t))
        }
      })
      setAllExistingTags(Array.from(tagSet).sort())
    } catch (err) {
      console.error('加载标签失败:', err)
    }
  }

  async function loadItem() {
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      if (data) {
        setTitle(data.title)
        setTags(data.tags || [])
        setContentMale(data.content_male || '')
        setContentFemale(data.content_female || '')
      }
    } catch (err) {
      console.error('加载条目失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const addTag = (tag) => {
    const trimmed = tag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
    }
    setNewTagInput('')
  }

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      alert('请填写标题')
      return
    }
    if (!profile?.id) {
      alert('请先登录')
      return
    }
    setSaving(true)
    try {
      // tag 单值字段：取 tags 数组第一个，如果为空设为 'other'
      const validTags = ['quarrel', 'cold_war', 'jealousy', 'communication', 'other']
      const firstTag = tags.length > 0 && validTags.includes(tags[0]) ? tags[0] : 'other'
      
      const data = {
        title: title.trim(),
        tags,
        tag: firstTag,
        keywords: tags,  // 用 tags 作为 keywords（搜索用）
        content_male: contentMale.trim() || null,
        content_female: contentFemale.trim() || null,
        updated_at: new Date().toISOString()
      }

      if (isEditing) {
        const { error } = await supabase
          .from('knowledge_base')
          .update(data)
          .eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('knowledge_base')
          .insert({
            ...data,
            created_by: profile.id,
            created_at: new Date().toISOString()
          })
        if (error) throw error
      }

      invalidateByPrefix('knowledge_base')
      navigate(isEditing ? `/knowledge/${id}` : '/knowledge')
    } catch (err) {
      alert('保存失败: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // 过滤出不在当前标签中的已有标签
  const availableTags = allExistingTags.filter((t) => !tags.includes(t))

  return (
    <div className="space-y-4 animate-fade-in">
      {loading && (
        <div className="glass-pill fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-xs flex items-center gap-2">
          <Icon name="note" size={16} /> 加载中...
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
          <Icon name={isEditing ? 'pencil' : 'plus'} size={20} />
          {isEditing ? '编辑条目' : '新增条目'}
        </h1>
        <div className="w-16" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div className="card">
          <label className="label-text">标题 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
            placeholder="如：吵架了怎么办？"
            required
          />
        </div>

        {/* Tags */}
        <div className="card space-y-3">
          <label className="label-text">标签</label>

          {/* Selected tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="tag flex items-center gap-1 cursor-pointer"
                  onClick={() => removeTag(tag)}
                  style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                >
                  #{tag}
                  <Icon name="x" size={15} />
                </span>
              ))}
            </div>
          )}

          {/* Add new tag */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag(newTagInput)
                }
              }}
              className="input-field flex-1"
              placeholder="输入新标签，回车添加"
            />
            <button
              type="button"
              onClick={() => addTag(newTagInput)}
              className="btn-secondary whitespace-nowrap"
            >
              添加
            </button>
          </div>

          {/* Existing tags */}
          {availableTags.length > 0 && (
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>点击选择已有标签：</p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    className="tag cursor-pointer hover:opacity-70 transition-opacity"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Male Content */}
        <div className="card">
          <label className="label-text flex items-center gap-2">
            <Icon name="user" size={17} /> 男生应该怎么做
          </label>
          <textarea
            value={contentMale}
            onChange={(e) => setContentMale(e.target.value)}
            className="input-field resize-none"
            rows={6}
            placeholder="记录男生在这种情况下应该怎么做..."
          />
        </div>

        {/* Female Content */}
        <div className="card">
          <label className="label-text flex items-center gap-2">
            <Icon name="user" size={17} /> 女生应该怎么做
          </label>
          <textarea
            value={contentFemale}
            onChange={(e) => setContentFemale(e.target.value)}
            className="input-field resize-none"
            rows={6}
            placeholder="记录女生在这种情况下应该怎么做..."
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary flex-1"
          >
            取消
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}
