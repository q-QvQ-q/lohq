import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import Icon from '../components/Icon.jsx'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const emptyForm = () => ({ title: '', happened_on: today(), incident: '', cause: '', resolution: '', lesson: '', action_plan: '' })
const emptyReview = () => ({ reviewed_on: today(), progress: '进行中', note: '' })
const shortDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('zh-CN') : ''

function Field({ label, value, onChange, placeholder, rows, type = 'text' }) {
  const id = `reflection-${label}`
  return (
    <div>
      <label htmlFor={id} className="label-text">{label}</label>
      {rows ? (
        <textarea id={id} className="input-field resize-y" rows={rows} value={value}
          onChange={event => onChange(event.target.value)} placeholder={placeholder} required />
      ) : (
        <input id={id} className="input-field" type={type} value={value}
          onChange={event => onChange(event.target.value)} placeholder={placeholder} required />
      )}
    </div>
  )
}

export default function Reflections() {
  const navigate = useNavigate()
  const { profile, partnerProfile } = useAuth()
  const [items, setItems] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [reviewForm, setReviewForm] = useState(emptyReview)
  const [saving, setSaving] = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)
  const selected = items.find(item => item.id === selectedId)
  const own = selected?.author_id === profile?.id

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return }
    let active = true
    async function load() {
      setLoading(true)
      const [itemResult, reviewResult] = await Promise.all([
        supabase.from('reflections').select('*').order('created_at', { ascending: false }),
        supabase.from('reflection_reviews').select('*').order('created_at', { ascending: true })
      ])
      if (!active) return
      if (itemResult.error || reviewResult.error) {
        setError('加载失败，请稍后重试。若是首次使用，请先执行检讨书数据库迁移。')
      } else {
        setItems(itemResult.data || [])
        setReviews(reviewResult.data || [])
        setError('')
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [profile?.id])

  function openCreate() {
    setSelectedId(null)
    setForm(emptyForm())
    setError('')
    setView('form')
  }

  function openEdit() {
    if (!own) return
    setForm({
      title: selected.title, happened_on: selected.happened_on,
      incident: selected.incident, cause: selected.cause,
      resolution: selected.resolution, lesson: selected.lesson,
      action_plan: selected.action_plan
    })
    setError('')
    setView('form')
  }

  async function save(event) {
    event.preventDefault()
    if (saving || !profile?.id) return
    const clean = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
    if (Object.values(clean).some(value => !value)) { setError('请填写所有内容。'); return }
    setSaving(true)
    setError('')
    const query = selectedId
      ? supabase.from('reflections').update(clean).eq('id', selectedId).eq('author_id', profile.id)
      : supabase.from('reflections').insert({ ...clean, author_id: profile.id })
    const { data, error: saveError } = await query.select().single()
    setSaving(false)
    if (saveError) { setError(`保存失败：${saveError.message}`); return }
    setItems(current => [data, ...current.filter(item => item.id !== data.id)]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
    setSelectedId(data.id)
    setView('detail')
  }

  async function remove() {
    if (!own || !window.confirm('确定删除这篇检讨书及全部后续回顾吗？')) return
    setError('')
    const { error: deleteError } = await supabase.from('reflections').delete().eq('id', selectedId).eq('author_id', profile.id)
    if (deleteError) { setError(`删除失败：${deleteError.message}`); return }
    setItems(current => current.filter(item => item.id !== selectedId))
    setReviews(current => current.filter(review => review.reflection_id !== selectedId))
    setSelectedId(null)
    setView('list')
  }

  async function addReview(event) {
    event.preventDefault()
    if (reviewSaving || !own) return
    const note = reviewForm.note.trim()
    if (!note) { setError('请填写回顾感想。'); return }
    setReviewSaving(true)
    setError('')
    const { data, error: saveError } = await supabase.from('reflection_reviews').insert({
      reflection_id: selectedId,
      author_id: profile.id,
      reviewed_on: reviewForm.reviewed_on,
      progress: reviewForm.progress,
      note
    }).select().single()
    setReviewSaving(false)
    if (saveError) { setError(`回顾保存失败：${saveError.message}`); return }
    setReviews(current => [...current, data])
    setReviewForm(emptyReview())
  }

  function back() {
    if (view === 'form' && selectedId) setView('detail')
    else if (view !== 'list') { setView('list'); setSelectedId(null) }
    else navigate('/')
    setError('')
  }

  return (
    <div className="keepsake-font space-y-4 animate-fade-in">
      <div className="feature-page-header flex items-center justify-between gap-3">
        <button type="button" onClick={back} className="text-sm font-bold hover:opacity-70">← 返回</button>
        <h1 className="page-title !mb-0"><Icon name="file" size={22} />检讨书</h1>
        {view === 'list' ? (
          <button type="button" onClick={openCreate} className="text-sm font-bold" style={{ color: 'var(--color-primary-dark)' }}>＋ 新增</button>
        ) : <span className="w-12" />}
      </div>

      {error && <p role="alert" className="card text-sm" style={{ color: '#B73535' }}>{error}</p>}

      {view === 'list' && (
        loading ? <p className="text-center py-12">加载中...</p> : error ? null : items.length === 0 ? (
          <div className="card text-center py-10">
            <Icon name="file" size={26} className="mx-auto mb-3" />
            <p className="mb-4">还没有检讨书</p>
            <button type="button" className="btn-primary" onClick={openCreate}>写第一篇</button>
          </div>
        ) : <div className="space-y-3">
          {items.map(item => (
            <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setReviewForm(emptyReview()); setError(''); setView('detail') }}
              className="card w-full text-left hover:shadow-soft transition-shadow active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3">
                <span className="font-bold break-words">{item.title}</span>
                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-light)' }}>{shortDate(item.happened_on)}</span>
              </div>
              <p className="text-sm mt-2 line-clamp-2 whitespace-pre-wrap" style={{ color: 'var(--color-text-light)' }}>{item.incident}</p>
              <p className="text-xs mt-3" style={{ color: 'var(--color-text-light)' }}>
                {item.author_id === profile?.id ? '我' : partnerProfile?.nickname || '伴侣'} · {reviews.filter(review => review.reflection_id === item.id).length} 次回顾
              </p>
            </button>
          ))}
        </div>
      )}

      {view === 'form' && (
        <form onSubmit={save} className="card space-y-4">
          <h2 className="font-bold text-lg">{selectedId ? '编辑检讨书' : '新建检讨书'}</h2>
          <Field label="标题" value={form.title} onChange={value => setForm(current => ({ ...current, title: value }))} placeholder="给这件事起个标题" />
          <Field label="发生日期" type="date" value={form.happened_on} onChange={value => setForm(current => ({ ...current, happened_on: value }))} />
          <Field label="事情经过" rows={4} value={form.incident} onChange={value => setForm(current => ({ ...current, incident: value }))} placeholder="犯了什么事？具体发生了什么？" />
          <Field label="原因分析" rows={3} value={form.cause} onChange={value => setForm(current => ({ ...current, cause: value }))} placeholder="当时为什么会这样？" />
          <Field label="解决结果" rows={3} value={form.resolution} onChange={value => setForm(current => ({ ...current, resolution: value }))} placeholder="最后怎么处理的？是否已经解决？" />
          <Field label="检讨心得" rows={4} value={form.lesson} onChange={value => setForm(current => ({ ...current, lesson: value }))} placeholder="认识到了什么？" />
          <Field label="改进计划" rows={3} value={form.action_plan} onChange={value => setForm(current => ({ ...current, action_plan: value }))} placeholder="写下一两件具体要做到的事" />
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={back}>取消</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
          </div>
        </form>
      )}

      {view === 'detail' && selected && (
        <div className="space-y-4">
          <article className="card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-bold break-words">{selected.title}</h2><p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{shortDate(selected.happened_on)} · {own ? '我' : partnerProfile?.nickname || '伴侣'}</p></div>
              {own && <button type="button" onClick={openEdit} className="text-sm whitespace-nowrap font-bold">编辑</button>}
            </div>
            {[
              ['事情经过', selected.incident], ['原因分析', selected.cause],
              ['解决结果', selected.resolution], ['检讨心得', selected.lesson],
              ['改进计划', selected.action_plan]
            ].map(([label, value]) => <section key={label}><h3 className="font-bold text-sm mb-1">{label}</h3><p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{value}</p></section>)}
            {own && <button type="button" onClick={remove} className="text-xs" style={{ color: '#B73535' }}>删除这篇检讨书</button>}
          </article>

          <section className="space-y-3">
            <h2 className="font-bold">后续回顾</h2>
            {reviews.filter(review => review.reflection_id === selectedId).length === 0 && <p className="card text-sm">还没有回顾，之后可以来记录改进情况。</p>}
            {reviews.filter(review => review.reflection_id === selectedId).map(review => (
              <div className="card" key={review.id}>
                <div className="flex justify-between gap-2 text-sm font-bold"><span>{shortDate(review.reviewed_on)}</span><span>{review.progress}</span></div>
                <p className="text-sm whitespace-pre-wrap break-words mt-2 leading-relaxed">{review.note}</p>
              </div>
            ))}
          </section>

          {own && <form onSubmit={addReview} className="card space-y-3">
            <h3 className="font-bold">添加一次回顾</h3>
            <Field label="回顾日期" type="date" value={reviewForm.reviewed_on} onChange={value => setReviewForm(current => ({ ...current, reviewed_on: value }))} />
            <div><label htmlFor="review-progress" className="label-text">执行情况</label>
              <select id="review-progress" className="input-field" value={reviewForm.progress} onChange={event => setReviewForm(current => ({ ...current, progress: event.target.value }))}>
                <option>进行中</option><option>已做到</option><option>需要调整</option>
              </select>
            </div>
            <Field label="补充感想" rows={3} value={reviewForm.note} onChange={value => setReviewForm(current => ({ ...current, note: value }))} placeholder="计划做到了吗？有什么新的想法？" />
            <button type="submit" className="btn-primary w-full" disabled={reviewSaving}>{reviewSaving ? '保存中...' : '保存回顾'}</button>
          </form>}
        </div>
      )}
    </div>
  )
}
