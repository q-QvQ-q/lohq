import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase } from '../supabase/client.js'

function decodePublicKey(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export default function PushSettings() {
  const { user } = useAuth()
  const [ready, setReady] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window
  const installed = typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)

  useEffect(() => {
    if (!supported || !installed || !user?.id) return
    let active = true
    Promise.all([
      navigator.serviceWorker.ready,
      supabase.functions.invoke('push-dispatch', { method: 'GET' })
    ]).then(async ([registration, result]) => {
      if (result.error || !result.data?.publicKey) throw result.error || new Error('推送服务尚未配置')
      const subscription = await registration.pushManager.getSubscription()
      const saved = subscription ? await supabase.from('push_subscriptions')
        .select('id').eq('endpoint', subscription.endpoint).maybeSingle() : null
      if (saved?.error) throw saved.error
      if (active) {
        setReady({ registration, publicKey: result.data.publicKey })
        setEnabled(Boolean(subscription && saved?.data) && Notification.permission === 'granted')
      }
    }).catch((reason) => {
      if (active) setError(`推送服务暂不可用：${reason.message || reason}`)
    })
    return () => { active = false }
  }, [supported, installed, user?.id])

  async function enable() {
    if (!ready || !user?.id || busy) return
    setBusy(true)
    setError('')
    try {
      // Keep subscribe() in the button gesture handler so iOS can show its permission prompt.
      const subscription = await ready.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(ready.publicKey)
      })
      const json = subscription.toJSON()
      if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('设备订阅信息不完整')
      const { error: saveError } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth_secret: json.keys.auth
      }, { onConflict: 'endpoint' })
      if (saveError) throw saveError
      setEnabled(true)
    } catch (reason) {
      setError(Notification.permission === 'denied'
        ? '通知权限已被拒绝，请到 iPhone「设置 → 通知 → LOHQ」开启。'
        : `开启失败：${reason.message || reason}`)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const subscription = await ready?.registration.pushManager.getSubscription()
      if (subscription) {
        const { error: removeError } = await supabase.from('push_subscriptions')
          .delete().eq('endpoint', subscription.endpoint)
        if (removeError) throw removeError
        await subscription.unsubscribe()
      }
      setEnabled(false)
    } catch (reason) {
      setError(`关闭失败：${reason.message || reason}`)
    } finally {
      setBusy(false)
    }
  }

  return <section className="card" aria-label="系统通知">
    <h2 className="font-semibold mb-2" style={{ color: 'var(--color-text)' }}>手机系统提醒</h2>
    <p className="text-sm mb-3" style={{ color: 'var(--color-text-light)' }}>
      开启后，新评论、需要提醒的待办和纪念日会显示为手机通知。无需一直打开网页；点击通知会进入对应页面。
    </p>
    {!installed ? <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
      请先在 Safari 中用「分享 → 添加到主屏幕」，再从主屏幕图标打开 LOHQ。
    </p> : !supported ? <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
      此设备或浏览器暂不支持网页推送；iPhone 需要 iOS 16.4 或更新版本。
    </p> : <button type="button" disabled={busy || (!ready && !enabled)}
      onClick={enabled ? disable : enable} className="btn-primary disabled:opacity-50">
      {busy ? '处理中…' : enabled ? '关闭系统提醒' : '开启系统提醒'}
    </button>}
    {error && <p role="alert" className="text-xs mt-2" style={{ color: '#B73535' }}>{error}</p>}
    {enabled && <p className="text-xs mt-2" style={{ color: 'var(--color-text-light)' }}>已为这台设备开启；具体显示方式由 iPhone「设置 → 通知」控制。</p>}
  </section>
}
