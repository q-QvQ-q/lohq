import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { daysUntil, formatDate, formatDateShort, getNextOccurrence } from '../utils/dateUtils.js'

const TYPE_LABELS = {
  birthday: '生日',
  love: '恋爱纪念',
  holiday: '节日',
  other: '其他'
}

export default function Anniversaries() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { fetchWithCache, invalidateByPrefix } = useDataCache()
  const [anniversaries, setAnniversaries] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnniversaries()
  }, [profile?.id])

  async function loadAnniversaries() {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      const data = await fetchWithCache('anniversaries', async () => {
        const { data } = await supabase
          .from('anniversaries')
          .select('*')
          .order('date', { ascending: true })
        return data || []
      })
      setAnniversaries(data)
    } catch (err) {
      console.error('加载纪念日失败:', err)
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(data) {
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('anniversaries')
          .update(data)
          .eq('id', editingItem.id)
        if (error) throw error
      } else {
        if (!profile?.id) {
          alert('请先登录后再添加')
          return
        }
        const { error } = await supabase
          .from('anniversaries')
          .insert({ ...data, created_by: profile.id })
        if (error) throw error
      }
      setShowForm(false)
      setEditingItem(null)
      invalidateByPrefix('anniversaries')
      await loadAnniversaries()
    } catch (err) {
      alert('保存失败: ' + err.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('确定要删除这个纪念日吗？')) return
    try {
      const { error } = await supabase.from('anniversaries').delete().eq('id', id)
      if (error) throw error
      invalidateByPrefix('anniversaries')
      loadAnniversaries()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  function openEdit(item) {
    setEditingItem(item)
    setShowForm(true)
  }

  function openNew() {
    setEditingItem(null)
    setShowForm(true)
  }

  const sorted = [...anniversaries]
    .filter((a) => a.date)
    .map((a) => ({ ...a, days_left: daysUntil(a.date, a.is_repeat_yearly) }))
    .sort((a, b) => a.days_left - b.days_left)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <span>←</span> 返回
        </button>
        <div className="flex items-center gap-3">
          <h1 className="page-title">
            <span>📅</span> 纪念日
          </h1>
          <button onClick={openNew} className="btn-primary text-sm px-4 py-2" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
            ➕ 新增
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-mist-pink-500">加载中...</div>
      ) : sorted.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-5xl mb-3 block">🐱</span>
          <p className="text-mist-pink-500">还没有纪念日哦~</p>
          <p className="text-mist-pink-400 text-sm mt-1">点击上方按钮添加第一个吧！</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => (
            <AnniversaryCard
              key={item.id}
              item={item}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AnniversaryForm
          item={editingItem}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false)
            setEditingItem(null)
          }}
        />
      )}
    </div>
  )
}

function AnniversaryCard({ item, onEdit, onDelete }) {
  const nextDate = getNextOccurrence(item.date, item.is_repeat_yearly)
  const isToday = item.days_left === 0

  return (
    <div className="card hover:shadow-soft transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="tag">{TYPE_LABELS[item.type]}</span>
            {item.is_repeat_yearly && (
              <span className="tag bg-mist-pink-100 text-mist-pink-500">每年</span>
            )}
          </div>
          <h3 className="font-bold text-mist-pink-700">{item.title}</h3>
          <p className="text-mist-pink-400 text-sm">{formatDate(item.date)}</p>
          {item.note && (
            <p className="text-mist-pink-500 text-xs mt-1 italic">{item.note}</p>
          )}
        </div>
        <div className="text-right">
          <div
            className={`text-lg font-bold ${
              isToday ? 'text-red-500' : 'text-mist-pink-600'
            }`}
          >
            {isToday ? '今天' : `${item.days_left} 天`}
          </div>
          <div className="text-mist-pink-400 text-xs">
            {formatDateShort(nextDate)}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-mist-pink-100">
        <button
          onClick={onEdit}
          className="text-xs text-mist-pink-500 hover:text-mist-pink-700 font-bold"
        >
          ✏️ 编辑
        </button>
        <span className="text-mist-pink-200">|</span>
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-600 font-bold"
        >
          🗑️ 删除
        </button>
      </div>
    </div>
  )
}

function AnniversaryForm({ item, onSave, onClose }) {
  const [title, setTitle] = useState(item?.title || '')
  const [date, setDate] = useState(item?.date || new Date().toISOString().split('T')[0])
  const [type, setType] = useState(item?.type || 'love')
  const [isRepeatYearly, setIsRepeatYearly] = useState(item?.is_repeat_yearly ?? true)
  const [note, setNote] = useState(item?.note || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ title, date, type, is_repeat_yearly: isRepeatYearly, note })
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-card p-6 shadow-soft animate-fade-in max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-mist-pink-700">
            {item ? '编辑纪念日' : '新增纪念日'}
          </h2>
          <button onClick={onClose} className="text-mist-pink-400 hover:text-mist-pink-600 text-xl">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-text">名称</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="如：在一起纪念日"
              required
            />
          </div>

          <div>
            <label className="label-text">日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="label-text">类型</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className={`py-2 rounded-input text-sm font-bold transition-all ${
                    type === key
                      ? 'bg-mist-pink-300 text-mist-pink-800'
                      : 'bg-white/70 text-mist-pink-500 border-2 border-mist-pink-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRepeatYearly}
                onChange={(e) => setIsRepeatYearly(e.target.checked)}
                className="w-5 h-5 rounded accent-mist-pink-400"
              />
              <span className="text-mist-pink-600">每年重复</span>
            </label>
          </div>

          <div>
            <label className="label-text">备注（可选）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input-field resize-none"
              rows={3}
              placeholder="记点什么吧..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              取消
            </button>
            <button type="submit" className="btn-primary flex-1">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
