import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import Icon from '../components/Icon.jsx'
import { DailyEmpty, DailyModal, DailyPageHeader, DailyToast, FormField } from '../components/DailyUI.jsx'

const PREVIEW_LETTERS = [
  { id: 'letter-1', author_id: 'preview-me', title: '写给我们的两周年', content: null, status: 'sealed', unlock_at: '2027-01-29T12:00:00.000Z', sealed_at: '2026-09-20T10:00:00.000Z', created_at: '2026-09-20T10:00:00.000Z' },
  { id: 'letter-2', author_id: 'preview-partner', title: '等桂花再开的时候', content: null, status: 'sealed', unlock_at: '2026-10-18T12:00:00.000Z', sealed_at: '2026-09-18T09:30:00.000Z', created_at: '2026-09-18T09:30:00.000Z' },
  { id: 'letter-3', author_id: 'preview-me', title: '去年的我们想说', content: '如果你看到这封信，我们应该已经一起走过了许多新的地方。希望那时的我们，还是会认真听彼此说话，也还记得在忙碌里留一个拥抱。', status: 'unlocked', unlock_at: '2026-08-22T12:00:00.000Z', sealed_at: '2026-02-14T08:00:00.000Z', created_at: '2026-02-14T08:00:00.000Z' },
  { id: 'letter-4', author_id: 'preview-me', title: '还没写完的夏天', content: '今天想写下……', status: 'draft', unlock_at: '2027-06-01T12:00:00.000Z', sealed_at: null, created_at: '2026-09-21T15:00:00.000Z' }
]

function localInputValue(date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return adjusted.toISOString().slice(0, 16)
}

function formatFullTime(value) {
  if (!value) return '还未设置'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function countdown(value, now) {
  const milliseconds = new Date(value).getTime() - now
  if (milliseconds <= 0) return '现在可以打开'
  const days = Math.floor(milliseconds / 86400000)
  const hours = Math.floor((milliseconds % 86400000) / 3600000)
  if (days > 0) return `${days} 天 ${hours} 小时后`
  const minutes = Math.max(1, Math.floor(milliseconds / 60000))
  return `${hours} 小时 ${minutes % 60} 分后`
}

export default function FutureLetters({ preview = false }) {
  const { profile: authProfile, partnerProfile: authPartner } = useAuth()
  const profile = preview ? { id: 'preview-me', nickname: '小蓝' } : authProfile
  const partnerProfile = preview ? { id: 'preview-partner', nickname: '小樱' } : authPartner
  const [letters, setLetters] = useState(preview ? PREVIEW_LETTERS : [])
  const [activeTab, setActiveTab] = useState('sealed')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(!preview)
  const [pageError, setPageError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [form, setForm] = useState({ id: null, title: '', content: '', unlock_at: localInputValue(), paper_theme: 'blush' })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!preview && profile?.id) loadLetters()
  }, [preview, profile?.id])

  async function loadLetters() {
    setLoading(true)
    const { data, error } = await supabase.rpc('list_future_letters')
    if (error) {
      setPageError('功能数据尚未同步。你仍可以先查看本地展示版。')
      setLoading(false)
      return
    }
    setLetters(data || [])
    setLoading(false)
  }

  const normalizedLetters = useMemo(() => letters.map(letter => letter.status === 'sealed' && new Date(letter.unlock_at).getTime() <= now ? { ...letter, status: 'unlocked' } : letter), [letters, now])
  const groups = {
    sealed: normalizedLetters.filter(letter => letter.status === 'sealed'),
    unlocked: normalizedLetters.filter(letter => letter.status === 'unlocked'),
    draft: normalizedLetters.filter(letter => letter.status === 'draft' && letter.author_id === profile?.id)
  }
  const visible = groups[activeTab]

  function resetForm() {
    setForm({ id: null, title: '', content: '', unlock_at: localInputValue(), paper_theme: 'blush' })
  }

  function openComposer(letter = null) {
    if (letter) setForm({ id: letter.id, title: letter.title || '', content: letter.content || '', unlock_at: localInputValue(new Date(letter.unlock_at)), paper_theme: letter.paper_theme || 'blush' })
    else resetForm()
    setModal('compose')
  }

  function personName(id) {
    return id === profile?.id ? (profile?.nickname || '我') : (partnerProfile?.nickname || 'TA')
  }

  async function saveLetter(seal) {
    if (!form.title.trim() || !form.content.trim()) return setToast({ message: '请把标题和正文写完整', tone: 'error' })
    const unlockAt = new Date(form.unlock_at)
    if (Number.isNaN(unlockAt.getTime()) || unlockAt.getTime() < Date.now() + 10 * 60 * 1000) return setToast({ message: '开启时间至少要在十分钟以后', tone: 'error' })
    if (preview) {
      const next = { id: form.id || `letter-${Date.now()}`, author_id: profile.id, title: form.title.trim(), content: seal ? null : form.content.trim(), preview_content: form.content.trim(), status: seal ? 'sealed' : 'draft', unlock_at: unlockAt.toISOString(), sealed_at: seal ? new Date().toISOString() : null, created_at: new Date().toISOString(), paper_theme: form.paper_theme }
      setLetters(current => form.id ? current.map(letter => letter.id === form.id ? next : letter) : [next, ...current])
    } else {
      const { error } = await supabase.rpc('save_future_letter', { p_letter_id: form.id, p_title: form.title.trim(), p_content: form.content.trim(), p_unlock_at: unlockAt.toISOString(), p_paper_theme: form.paper_theme, p_seal: seal })
      if (error) return setToast({ message: '信件保存失败，请稍后重试', tone: 'error' })
      await loadLetters()
    }
    setModal(null)
    resetForm()
    setActiveTab(seal ? 'sealed' : 'draft')
    setToast({ message: seal ? '信件已封存，到约定那天再见' : '草稿已经替你收好' })
  }

  function openLetter(letter) {
    if (letter.status === 'draft') return openComposer(letter)
    if (letter.status === 'sealed') return setToast({ message: `还要等到 ${formatFullTime(letter.unlock_at)}`, tone: 'error' })
    setSelected(letter)
    setModal('read')
    if (!preview) supabase.rpc('mark_future_letter_read', { p_letter_id: letter.id })
  }

  return (
    <div className="daily-page letter-page animate-fade-in">
      <DailyPageHeader icon="envelope" title="未来信件" action="写一封" actionIcon="pencil" onAction={() => openComposer()} />
      {loading && <div className="daily-loading"><Icon name="envelope" />正在整理信箱…</div>}
      {pageError && <div className="daily-inline-note is-warning"><Icon name="info" />{pageError}</div>}

      <section className="letterbox-hero">
        <div className="letterbox-hero__mail">
          <span className="letterbox-hero__seal"><Icon name="heart" size={20} /></span>
          <div className="letterbox-hero__flap" />
          <Icon name="envelope" size={58} />
        </div>
        <div className="letterbox-hero__copy">
          <p>寄给未来的我们</p>
          <h2>有些话，值得晚一点打开</h2>
          <span>封存以后，连写信的人也不能偷看。</span>
        </div>
        <div className="letterbox-hero__count"><strong>{groups.sealed.length}</strong><span>封信<br />正在路上</span></div>
      </section>

      <div className="segmented-control daily-main-tabs" role="tablist">
        <button aria-selected={activeTab === 'sealed'} onClick={() => setActiveTab('sealed')}><Icon name="lock" size={15} />等待开启 <span>{groups.sealed.length}</span></button>
        <button aria-selected={activeTab === 'unlocked'} onClick={() => setActiveTab('unlocked')}><Icon name="envelope" size={15} />已经抵达 <span>{groups.unlocked.length}</span></button>
        <button aria-selected={activeTab === 'draft'} onClick={() => setActiveTab('draft')}><Icon name="pencil" size={15} />草稿 <span>{groups.draft.length}</span></button>
      </div>

      {visible.length === 0 ? <DailyEmpty icon={activeTab === 'draft' ? 'pencil' : 'envelope'} title={activeTab === 'sealed' ? '暂时没有在路上的信' : activeTab === 'unlocked' ? '还没有抵达的旧时光' : '草稿箱很干净'} body={activeTab === 'draft' ? '没写完的信会安静地等在这里。' : '挑一个未来的日子，给那时的你们留句话。'} action="写一封未来信" onAction={() => openComposer()} /> : (
        <div className="letter-grid">
          {visible.map((letter, index) => (
            <button type="button" className={`future-envelope is-${letter.status} theme-${letter.paper_theme || 'blush'}`} key={letter.id} onClick={() => openLetter(letter)} style={{ '--letter-angle': `${index % 2 ? 1.1 : -0.7}deg` }}>
              <span className="future-envelope__postmark"><Icon name={letter.status === 'sealed' ? 'lock' : letter.status === 'draft' ? 'pencil' : 'heart'} size={16} /></span>
              <span className="future-envelope__from">来自 {personName(letter.author_id)}</span>
              <strong>{letter.title}</strong>
              {letter.status === 'sealed' && <><span className="future-envelope__date">{formatFullTime(letter.unlock_at)} 开启</span><b>{countdown(letter.unlock_at, now)}</b></>}
              {letter.status === 'unlocked' && <><span className="future-envelope__date">{formatFullTime(letter.unlock_at)} 抵达</span><b>拆开读信</b></>}
              {letter.status === 'draft' && <><span className="future-envelope__date">上次写到这里</span><b>继续写</b></>}
              <span className="future-envelope__fold" />
            </button>
          ))}
        </div>
      )}

      <div className="letter-promise"><Icon name="lock" size={18} /><div><strong>到时间之前，正文不会被取回</strong><p>开启权限由服务端时间决定，修改设备时间也不能提前拆信。</p></div></div>

      {modal === 'compose' && <DailyModal title={form.id ? '继续写这封信' : '写给未来的我们'} onClose={() => setModal(null)} wide>
        <div className={`letter-paper theme-${form.paper_theme}`}>
          <FormField label="信的标题"><input className="input-field" maxLength="50" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="例如：写给我们的三周年" autoFocus /></FormField>
          <FormField label="想说的话"><textarea className="input-field letter-paper__content" maxLength="10000" value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder="亲爱的未来的我们……" /></FormField>
          <div className="daily-form__grid"><FormField label="开启时间" hint="至少在十分钟以后"><input className="input-field" type="datetime-local" min={localInputValue(new Date(Date.now() + 10 * 60 * 1000))} value={form.unlock_at} onChange={event => setForm({ ...form, unlock_at: event.target.value })} /></FormField><FormField label="信纸"><select className="input-field" value={form.paper_theme} onChange={event => setForm({ ...form, paper_theme: event.target.value })}><option value="blush">落樱粉</option><option value="cream">月光白</option><option value="lilac">晚霞紫</option></select></FormField></div>
        </div>
        <div className="seal-warning"><Icon name="info" size={17} /><p>点击“封存”后，直到开启时间到达，你和 TA 都无法查看或修改正文。</p></div>
        <div className="daily-form__actions letter-actions"><button type="button" className="glass-button" onClick={() => saveLetter(false)}>保存草稿</button><button type="button" className="btn-primary" onClick={() => saveLetter(true)}><Icon name="lock" size={16} />确认封存</button></div>
      </DailyModal>}

      {modal === 'read' && selected && <DailyModal title={selected.title} onClose={() => setModal(null)} wide>
        <article className={`opened-letter theme-${selected.paper_theme || 'blush'}`}>
          <div className="opened-letter__meta"><span>写信人：{personName(selected.author_id)}</span><span>{formatFullTime(selected.sealed_at || selected.created_at)} 写下</span></div>
          <h2>{selected.title}</h2>
          <p>{selected.content || selected.preview_content || '这封信的内容正在安全取回，请稍后再试。'}</p>
          <footer>于 {formatFullTime(selected.unlock_at)} 抵达</footer>
        </article>
      </DailyModal>}

      {toast && <DailyToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}
