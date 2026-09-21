import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { sendPushNotification } from 'npm:@mmmike/web-push@1.3.0/send'
import { anniversaryOccursOn, chinaClock, dueWithinWindow, todoOccursOn } from './schedule.mjs'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret'
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function requireValue(name) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function safePath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value : '/notifications'
}

function allowedPushEndpoint(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'push.apple.com' || url.hostname.endsWith('.push.apple.com') ||
        url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com')
  } catch {
    return false
  }
}

async function data(query) {
  const result = await query
  if (result.error) throw result.error
  return result.data || []
}

async function runDispatch() {
  const supabase = createClient(requireValue('SUPABASE_URL'), requireValue('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const vapidDetails = {
    subject: requireValue('VAPID_SUBJECT'),
    publicKey: requireValue('VAPID_PUBLIC_KEY'),
    privateKey: requireValue('VAPID_PRIVATE_KEY')
  }
  const { date, time } = chinaClock()
  const [subscriptions, profiles, notifications, todos, anniversaries, completions] = await Promise.all([
    data(supabase.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_secret')),
    data(supabase.from('profiles').select('id,partner_id')),
    data(supabase.from('notifications')
      .select('id,recipient_id,type,title,body,resource_path,created_at')
      .is('push_sent_at', null).gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('created_at', { ascending: true }).limit(100)),
    data(supabase.from('todos').select('id,content,due_date,recurrence,is_completed,created_by,remind_time')
      .eq('remind_enabled', true).lte('due_date', date)),
    data(supabase.from('anniversaries').select('id,title,date,is_repeat_yearly,created_by,remind_time')
      .eq('remind_enabled', true)),
    data(supabase.from('todo_occurrence_completions').select('todo_id').eq('occurrence_date', date))
  ])

  const byUser = new Map()
  for (const subscription of subscriptions) {
    const list = byUser.get(subscription.user_id) || []
    list.push(subscription)
    byUser.set(subscription.user_id, list)
  }
  const partners = new Map(profiles.map(profile => [profile.id, profile.partner_id]))
  const completed = new Set(completions.map(item => item.todo_id))
  let sent = 0
  let failures = 0

  async function sendToSubscription(subscription, eventKey, payload, ttl) {
    if (!allowedPushEndpoint(subscription.endpoint)) {
      await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
      return true
    }
    const { error: claimError } = await supabase.from('push_deliveries').insert({
      subscription_id: subscription.id, event_key: eventKey
    })
    if (claimError?.code === '23505') return true
    if (claimError) throw claimError
    try {
      const delivered = await sendPushNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret }
      }, payload, vapidDetails, { ttl, urgency: 'normal', timeoutMs: 10000 })
      if (!delivered) {
        await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
        return true
      }
      sent += 1
      return true
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
        return true
      }
      await supabase.from('push_deliveries').delete()
        .eq('subscription_id', subscription.id).eq('event_key', eventKey)
      failures += 1
      console.error('Web Push delivery failed', error.statusCode || error.name || 'unknown')
      return false
    }
  }

  async function sendToUsers(userIds, eventKey, payload, ttl = 7200) {
    let allSucceeded = true
    for (const userId of new Set(userIds.filter(Boolean))) {
      for (const subscription of byUser.get(userId) || []) {
        const succeeded = await sendToSubscription(subscription, eventKey, payload, ttl)
        if (!succeeded) allSucceeded = false
      }
    }
    return allSucceeded
  }

  for (const item of notifications) {
    const eventKey = `notification:${item.id}`
    const succeeded = await sendToUsers([item.recipient_id], eventKey, {
      title: String(item.title || '新消息').slice(0, 80),
      body: item.type === 'memo_comment' ? '有人给你的备忘录留言，点击查看' : String(item.body || '').slice(0, 180),
      url: safePath(item.resource_path),
      tag: eventKey
    }, 86400)
    if (succeeded) {
      const { error } = await supabase.from('notifications')
        .update({ push_sent_at: new Date().toISOString() }).eq('id', item.id)
      if (error) throw error
    }
  }

  for (const item of todos) {
    if (!dueWithinWindow(item.remind_time, time) || !todoOccursOn(item, date)) continue
    if ((item.recurrence || 'none') === 'none' ? item.is_completed : completed.has(item.id)) continue
    const eventKey = `todo:${item.id}:${date}`
    await sendToUsers([item.created_by, partners.get(item.created_by)], eventKey, {
      title: '待办提醒', body: String(item.content).slice(0, 180),
      url: `/calendar?date=${date}&todo=${item.id}`, tag: eventKey
    })
  }

  for (const item of anniversaries) {
    if (!dueWithinWindow(item.remind_time, time) || !anniversaryOccursOn(item, date)) continue
    const eventKey = `anniversary:${item.id}:${date}`
    await sendToUsers([item.created_by, partners.get(item.created_by)], eventKey, {
      title: '纪念日提醒', body: String(item.title).slice(0, 180),
      url: `/calendar?date=${date}&anniversary=${item.id}`, tag: eventKey
    })
  }

  return { sent, failures, date, time }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method === 'GET') {
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    return publicKey ? json({ publicKey }) : json({ error: 'Push service is not configured' }, 503)
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('PUSH_CRON_SECRET')
  if (!secret || request.headers.get('x-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401)
  try {
    return json(await runDispatch())
  } catch (error) {
    console.error('Push dispatch failed:', error)
    return json({ error: 'Dispatch failed' }, 500)
  }
})
