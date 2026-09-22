import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import Icon from '../components/Icon.jsx'
import { DailyEmpty, DailyModal, DailyPageHeader, DailyToast, FormField } from '../components/DailyUI.jsx'

const TYPES = {
  all: { label: '全部', icon: 'list' },
  food: { label: '美食', icon: 'utensils' },
  hotel: { label: '酒店', icon: 'home' },
  place: { label: '地点', icon: 'mapPin' },
  fun: { label: '娱乐', icon: 'gift' },
  travel: { label: '旅行', icon: 'location' },
  other: { label: '其他', icon: 'star' }
}

const RECOMMEND_LABEL = { recommend: '会推荐', neutral: '看情况', avoid: '不推荐' }

const PREVIEW_RECORDS = [
  { id: 'c1', name: '梧桐树下小馆', category: 'food', visit_date: '2026-09-18', address: '衡山路 42 号', price: 268, price_type: 'total', notes: '靠窗的位置很好看，松露意面值得再点。', created_by: 'preview-me', cover_path: null },
  { id: 'c2', name: '山野有风民宿', category: 'hotel', visit_date: '2026-08-30', address: '莫干山镇竹源路 17 号', price: 689, price_type: 'total', notes: '阳台能看到竹林，早餐的米糕很好吃。', created_by: 'preview-partner', cover_path: null },
  { id: 'c3', name: '西岸美术馆', category: 'place', visit_date: '2026-08-16', address: '龙腾大道 2600 号', price: 120, price_type: 'total', notes: '看完展在江边走了很久。', created_by: 'preview-me', cover_path: null }
]

const PREVIEW_REVIEWS = [
  { id: 'r1', check_in_id: 'c1', user_id: 'preview-me', rating: 5, comment: '气氛很舒服，下次还想坐同一个位置。', recommendation: 'recommend', tags: ['适合约会', '环境好'] },
  { id: 'r2', check_in_id: 'c1', user_id: 'preview-partner', rating: 4, comment: '甜品比主菜更惊喜。', recommendation: 'recommend', tags: ['甜品好吃'] },
  { id: 'r3', check_in_id: 'c2', user_id: 'preview-me', rating: 4, comment: '安静，适合躺平一整天。', recommendation: 'recommend', tags: ['风景好'] },
  { id: 'r4', check_in_id: 'c3', user_id: 'preview-partner', rating: 5, comment: '展很好看，和你一起更好看。', recommendation: 'recommend', tags: ['会再去'] }
]

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

export default function CheckIns({ preview = false }) {
  const { profile: authProfile, partnerProfile: authPartner } = useAuth()
  const profile = preview ? { id: 'preview-me', nickname: '小蓝' } : authProfile
  const partnerProfile = preview ? { id: 'preview-partner', nickname: '小樱' } : authPartner
  const [spaceId, setSpaceId] = useState(preview ? 'preview-space' : null)
  const [records, setRecords] = useState(preview ? PREVIEW_RECORDS : [])
  const [reviews, setReviews] = useState(preview ? PREVIEW_REVIEWS : [])
  const [activeType, setActiveType] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(!preview)
  const [pageError, setPageError] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [form, setForm] = useState({ name: '', category: 'food', visit_date: new Date().toISOString().slice(0, 10), address: '', price: '', price_type: 'total', notes: '' })
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', recommendation: 'recommend', tags: [] })

  useEffect(() => {
    if (!preview && profile?.id) initialise()
    return () => { if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview) }
  }, [preview, profile?.id])

  async function initialise() {
    setLoading(true)
    const { data, error } = await supabase.rpc('ensure_daily_couple_space')
    if (error) {
      setPageError('功能数据尚未同步。你仍可以先查看本地展示版。')
      setLoading(false)
      return
    }
    setSpaceId(data)
    await loadRecords(data)
    setLoading(false)
  }

  async function loadRecords(id = spaceId) {
    if (!id) return
    const [recordResult, reviewResult] = await Promise.all([
      supabase.from('check_ins').select('*').eq('space_id', id).is('deleted_at', null).order('visit_date', { ascending: false }),
      supabase.from('check_in_reviews').select('*').eq('space_id', id)
    ])
    if (recordResult.error || reviewResult.error) {
      setPageError('打卡记录加载失败，请稍后重试。')
      return
    }
    const nextRecords = recordResult.data || []
    const paths = nextRecords.map(record => record.cover_path).filter(Boolean)
    let signedMap = {}
    if (paths.length) {
      const { data } = await supabase.storage.from('photos').createSignedUrls(paths, 3600)
      ;(data || []).forEach((item, index) => { signedMap[paths[index]] = item.signedUrl })
    }
    setRecords(nextRecords.map(record => ({ ...record, cover_url: signedMap[record.cover_path] || '' })))
    setReviews(reviewResult.data || [])
  }

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter(record => (activeType === 'all' || record.category === activeType) && (!query || `${record.name} ${record.address}`.toLowerCase().includes(query)))
  }, [records, activeType, search])

  const reviewedCount = records.filter(record => reviews.filter(review => review.check_in_id === record.id).length === 2).length
  const average = reviews.length ? (reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length).toFixed(1) : '—'

  function getReview(recordId, userId) {
    return reviews.find(review => review.check_in_id === recordId && review.user_id === userId)
  }

  function openReview(record) {
    const existing = getReview(record.id, profile?.id)
    setSelected(record)
    setReviewForm(existing ? { rating: existing.rating, comment: existing.comment || '', recommendation: existing.recommendation || 'recommend', tags: existing.tags || [] } : { rating: 5, comment: '', recommendation: 'recommend', tags: [] })
    setModal('review')
  }

  function handlePhoto(file) {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file || null)
    setPhotoPreview(file ? URL.createObjectURL(file) : '')
  }

  function resetForm() {
    handlePhoto(null)
    setForm({ name: '', category: 'food', visit_date: new Date().toISOString().slice(0, 10), address: '', price: '', price_type: 'total', notes: '' })
  }

  async function createRecord(event) {
    event.preventDefault()
    if (!form.name.trim() || !form.address.trim() || !form.visit_date) return setToast({ message: '请填写名称、日期和地址', tone: 'error' })
    const payload = { ...form, name: form.name.trim(), address: form.address.trim(), notes: form.notes.trim() || null, price: form.price ? Number(form.price) : null, created_by: profile.id }
    if (preview) {
      setRecords(current => [{ id: `check-${Date.now()}`, ...payload, cover_url: photoPreview }, ...current])
    } else {
      const { data, error } = await supabase.from('check_ins').insert({ ...payload, space_id: spaceId }).select().single()
      if (error) return setToast({ message: '保存失败，请稍后重试', tone: 'error' })
      if (photoFile) {
        const extension = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${spaceId}/check-ins/${data.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('photos').upload(path, photoFile)
        if (!uploadError) await supabase.from('check_ins').update({ cover_path: path }).eq('id', data.id)
      }
      await loadRecords()
    }
    resetForm()
    setModal(null)
    setToast({ message: '这次共同体验已经收进手账' })
  }

  async function submitReview(event) {
    event.preventDefault()
    if (!selected) return
    const payload = { check_in_id: selected.id, space_id: spaceId, user_id: profile.id, ...reviewForm, rating: Number(reviewForm.rating), updated_at: new Date().toISOString() }
    if (preview) {
      setReviews(current => {
        const exists = current.some(review => review.check_in_id === selected.id && review.user_id === profile.id)
        return exists ? current.map(review => review.check_in_id === selected.id && review.user_id === profile.id ? { ...review, ...payload } : review) : [...current, { id: `review-${Date.now()}`, ...payload }]
      })
    } else {
      const { error } = await supabase.from('check_in_reviews').upsert(payload, { onConflict: 'check_in_id,user_id' })
      if (error) return setToast({ message: '评价保存失败，请稍后重试', tone: 'error' })
      await loadRecords()
    }
    setModal(null)
    setToast({ message: '你的感受已经记下来了' })
  }

  return (
    <div className="daily-page checkin-page animate-fade-in">
      <DailyPageHeader icon="mapPin" title="打卡评价" action="记一处" actionIcon="plus" onAction={() => setModal('create')} />
      {loading && <div className="daily-loading"><Icon name="mapPin" />正在翻开共同手账…</div>}
      {pageError && <div className="daily-inline-note is-warning"><Icon name="info" />{pageError}</div>}

      <section className="checkin-journal">
        <div className="checkin-journal__stamp"><Icon name="location" size={24} /><span>OUR<br />PLACES</span></div>
        <div className="checkin-journal__copy"><p>我们一起体验过</p><strong>{records.length}<small> 个地方</small></strong><span>{reviewedCount} 个已写完双人评价</span></div>
        <div className="checkin-journal__score"><span>共同评分</span><strong>{average}</strong><div><Icon name="star" size={14} /> / 5</div></div>
      </section>

      <div className="checkin-tools">
        <label className="checkin-search"><Icon name="search" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜名称或地址" /></label>
        <nav className="daily-chip-row" aria-label="打卡分类">
          {Object.entries(TYPES).map(([key, item]) => <button key={key} type="button" className={`glass-pill ${activeType === key ? 'is-selected' : ''}`} onClick={() => setActiveType(key)}><Icon name={item.icon} size={14} />{item.label}</button>)}
        </nav>
      </div>

      {filteredRecords.length === 0 ? <DailyEmpty icon="mapPin" title={records.length ? '没有找到这条回忆' : '共同手账还是空白'} body={records.length ? '换个关键词，或者清除分类筛选。' : '从最近一起吃过、住过或去过的地方开始。'} action={records.length ? '查看全部' : '记下第一处'} onAction={() => records.length ? (setSearch(''), setActiveType('all')) : setModal('create')} /> : (
        <div className="checkin-timeline">
          {filteredRecords.map(record => {
            const mine = getReview(record.id, profile?.id)
            const theirs = getReview(record.id, partnerProfile?.id)
            const reviewList = [mine, theirs].filter(Boolean)
            const avg = reviewList.length ? (reviewList.reduce((sum, review) => sum + Number(review.rating), 0) / reviewList.length).toFixed(1) : null
            return (
              <article className="checkin-entry" key={record.id}>
                <span className="checkin-entry__dot" />
                <div className={`checkin-entry__photo is-${record.category}`} style={record.cover_url ? { backgroundImage: `url(${record.cover_url})` } : undefined}>
                  {!record.cover_url && <><Icon name={TYPES[record.category]?.icon || 'mapPin'} size={31} /><span>{TYPES[record.category]?.label}</span></>}
                  <time>{formatDate(record.visit_date)}</time>
                </div>
                <div className="checkin-entry__body">
                  <div className="checkin-entry__title"><div><span>{TYPES[record.category]?.label || '其他'}</span><h2>{record.name}</h2></div>{avg && <strong><Icon name="star" size={14} />{avg}</strong>}</div>
                  <p className="checkin-entry__address"><Icon name="mapPin" size={14} />{record.address}</p>
                  {record.notes && <p className="checkin-entry__note">“{record.notes}”</p>}
                  <div className="checkin-entry__meta"><span>{record.price == null ? '未记价格' : `¥${Number(record.price).toFixed(0)} · ${record.price_type === 'per_person' ? '人均' : '两人总价'}`}</span><span>{reviewList.length}/2 人已评价</span></div>
                  <div className="couple-review-row">
                    <MiniReview name={profile?.nickname || '我'} review={mine} isMine />
                    <MiniReview name={partnerProfile?.nickname || 'TA'} review={theirs} />
                  </div>
                  <button type="button" className="checkin-entry__review" onClick={() => openReview(record)}>{mine ? '修改我的评价' : '写下我的评价'}</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {modal === 'create' && <DailyModal title="记下一次共同体验" onClose={() => { setModal(null); resetForm() }} wide>
        <form className="daily-form" onSubmit={createRecord}>
          <FormField label="名称"><input className="input-field" maxLength="50" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="餐厅、酒店或去过的地方" autoFocus /></FormField>
          <div className="daily-form__grid"><FormField label="分类"><select className="input-field" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{Object.entries(TYPES).filter(([key]) => key !== 'all').map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></FormField><FormField label="打卡日期"><input className="input-field" type="date" max={new Date().toISOString().slice(0, 10)} value={form.visit_date} onChange={event => setForm({ ...form, visit_date: event.target.value })} /></FormField></div>
          <FormField label="地址"><input className="input-field" maxLength="160" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="写下以后还能找到的地址" /></FormField>
          <div className="daily-form__grid"><FormField label="价格"><input className="input-field" type="number" min="0" step="0.01" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} placeholder="可不填" /></FormField><FormField label="价格口径"><select className="input-field" value={form.price_type} onChange={event => setForm({ ...form, price_type: event.target.value })}><option value="total">两人总价</option><option value="per_person">人均价格</option></select></FormField></div>
          <FormField label="共同备注"><textarea className="input-field" rows="3" maxLength="500" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="点过的菜、住过的房型，或那天发生的小事" /></FormField>
          <FormField label="留一张封面（可选）"><label className={`photo-picker ${photoPreview ? 'has-photo' : ''}`} style={photoPreview ? { backgroundImage: `url(${photoPreview})` } : undefined}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => handlePhoto(event.target.files?.[0])} /><span><Icon name="camera" />{photoPreview ? '换一张照片' : '选择照片'}</span></label></FormField>
          <div className="daily-form__actions"><button type="button" className="glass-button" onClick={() => { setModal(null); resetForm() }}>取消</button><button className="btn-primary" type="submit">收进共同手账</button></div>
        </form>
      </DailyModal>}

      {modal === 'review' && selected && <DailyModal title={`评价「${selected.name}」`} onClose={() => setModal(null)}>
        <form className="daily-form" onSubmit={submitReview}>
          <FormField label="这次体验值几颗星"><StarInput value={reviewForm.rating} onChange={rating => setReviewForm({ ...reviewForm, rating })} /></FormField>
          <FormField label="你的态度"><div className="recommend-switch">{Object.entries(RECOMMEND_LABEL).map(([key, label]) => <button type="button" key={key} aria-pressed={reviewForm.recommendation === key} onClick={() => setReviewForm({ ...reviewForm, recommendation: key })}>{label}</button>)}</div></FormField>
          <FormField label="想记住什么"><textarea className="input-field" rows="4" maxLength="500" value={reviewForm.comment} onChange={event => setReviewForm({ ...reviewForm, comment: event.target.value })} placeholder="环境、味道、服务，或者只属于那天的感受" /></FormField>
          <div className="daily-form__actions"><button type="button" className="glass-button" onClick={() => setModal(null)}>取消</button><button type="submit" className="btn-primary">保存我的评价</button></div>
        </form>
      </DailyModal>}

      {toast && <DailyToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}

function MiniReview({ name, review, isMine = false }) {
  return <div className={`mini-review ${review ? 'has-review' : ''}`}><span>{isMine ? '我' : name}</span>{review ? <><strong><Icon name="star" size={12} />{review.rating}</strong><p>{review.comment || RECOMMEND_LABEL[review.recommendation]}</p></> : <p>还没写评价</p>}</div>
}

function StarInput({ value, onChange }) {
  return <div className="star-input" role="radiogroup" aria-label="评分">{[1, 2, 3, 4, 5].map(rating => <button key={rating} type="button" role="radio" aria-checked={value === rating} className={rating <= value ? 'is-filled' : ''} onClick={() => onChange(rating)} aria-label={`${rating} 星`}><Icon name="star" size={27} /></button>)}</div>
}
