import { supabase } from '../supabase/client.js'

export async function removePushOnSignOut() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager?.getSubscription()
  if (!subscription) return
  // Unsubscribe locally even if the network is unavailable; the stale server entry
  // will be removed if the push endpoint later responds with 404/410.
  await subscription.unsubscribe()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 3000)
  try {
    await supabase.from('push_subscriptions').delete()
      .eq('endpoint', subscription.endpoint).abortSignal(controller.signal)
  } finally {
    window.clearTimeout(timeout)
  }
}
