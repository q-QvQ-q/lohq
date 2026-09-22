import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'

export function DailyPageHeader({ icon, title, action, onAction, actionIcon = 'plus' }) {
  const navigate = useNavigate()
  return (
    <header className="daily-page-header">
      <button type="button" onClick={() => navigate(-1)} className="daily-back">
        <Icon name="chevronLeft" size={18} /> 返回
      </button>
      <h1><Icon name={icon} size={21} />{title}</h1>
      {action ? (
        <button type="button" className="daily-header-action" onClick={onAction}>
          <Icon name={actionIcon} size={16} />{action}
        </button>
      ) : <span className="daily-header-spacer" />}
    </header>
  )
}

export function DailyModal({ title, children, onClose, wide = false }) {
  useEffect(() => {
    const onKeyDown = event => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={`modal-surface daily-modal ${wide ? 'daily-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="daily-modal__head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭弹窗"><Icon name="x" /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

export function DailyToast({ message, tone = 'success', onDone }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2600)
    return () => window.clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className={`daily-toast is-${tone}`} role="status">
      <Icon name={tone === 'error' ? 'x' : 'check'} size={17} />
      <span>{message}</span>
    </div>
  )
}

export function DailyEmpty({ icon, title, body, action, onAction }) {
  return (
    <div className="daily-empty">
      <span><Icon name={icon} size={25} /></span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action && <button type="button" className="glass-button" onClick={onAction}>{action}</button>}
    </div>
  )
}

export function FormField({ label, hint, children }) {
  return (
    <label className="daily-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
