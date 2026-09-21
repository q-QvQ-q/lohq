import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client.js'

const SIGNED_URL_TTL = 24 * 60 * 60
const CACHE_KEY = 'lohq_avatar_urls_v1'
const CACHE_GRACE_MS = 5 * 60 * 1000
const avatarUrlCache = new Map()
const avatarUrlRequests = new Map()

function hydrateAvatarCache() {
  if (avatarUrlCache.size > 0) return
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    Object.entries(stored).forEach(([path, entry]) => {
      if (entry?.url && entry.expiresAt > Date.now() + CACHE_GRACE_MS) {
        avatarUrlCache.set(path, entry)
      }
    })
  } catch {
    // A broken browser cache should never block avatar rendering.
  }
}

function readCachedAvatar(path) {
  if (!path) return ''
  hydrateAvatarCache()
  const entry = avatarUrlCache.get(path)
  if (!entry || entry.expiresAt <= Date.now() + CACHE_GRACE_MS) {
    avatarUrlCache.delete(path)
    return ''
  }
  return entry.url
}

function rememberAvatar(path, url) {
  const entry = { url, expiresAt: Date.now() + SIGNED_URL_TTL * 1000 }
  avatarUrlCache.set(path, entry)
  try {
    const recentEntries = [...avatarUrlCache.entries()]
      .filter(([, value]) => value.expiresAt > Date.now() + CACHE_GRACE_MS)
      .slice(-12)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(recentEntries)))
  } catch {
    // Private browsing or a full storage quota can disable persistence.
  }
}

function requestAvatarUrl(path) {
  const cached = readCachedAvatar(path)
  if (cached) return Promise.resolve(cached)
  if (avatarUrlRequests.has(path)) return avatarUrlRequests.get(path)

  const request = supabase.storage
    .from('avatars')
    .createSignedUrl(path, SIGNED_URL_TTL, {
      transform: { width: 256, height: 256, resize: 'cover', quality: 82 }
    })
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) throw error || new Error('头像链接生成失败')
      rememberAvatar(path, data.signedUrl)
      return data.signedUrl
    })
    .finally(() => avatarUrlRequests.delete(path))

  avatarUrlRequests.set(path, request)
  return request
}

export function getAvatarStoragePath(value = '') {
  if (!value) return ''
  if (!value.startsWith('http')) return value

  const markers = [
    '/storage/v1/object/sign/avatars/',
    '/storage/v1/object/public/avatars/'
  ]
  const marker = markers.find(item => value.includes(item))
  if (!marker) return ''

  const encodedPath = value.split(marker)[1]?.split('?')[0] || ''
  try {
    return decodeURIComponent(encodedPath)
  } catch {
    return encodedPath
  }
}

export default function ProfileAvatar({ profile, size = 64, className = '', alt, decorative = false }) {
  const avatarValue = profile?.avatar_url || ''
  const avatarPath = getAvatarStoragePath(avatarValue)
  const [signedUrl, setSignedUrl] = useState(() => avatarPath ? readCachedAvatar(avatarPath) : (avatarValue.startsWith('http') ? avatarValue : ''))
  const [failed, setFailed] = useState(false)
  const initials = (profile?.nickname || '宝').trim().slice(0, 1) || '宝'

  useEffect(() => {
    let active = true
    setFailed(false)

    const path = getAvatarStoragePath(avatarValue)
    if (!path) {
      setSignedUrl(avatarValue.startsWith('http') ? avatarValue : '')
      return () => { active = false }
    }

    const cached = readCachedAvatar(path)
    if (cached) {
      setSignedUrl(cached)
      return () => { active = false }
    }

    setSignedUrl('')
    requestAvatarUrl(path)
      .then(url => {
        if (!active) return
        setSignedUrl(url)
      })
      .catch(() => active && setFailed(true))

    return () => { active = false }
  }, [avatarValue])

  const label = alt || `${profile?.nickname || '宝宝'}的头像`

  return (
    <span
      className={`profile-avatar ${className}`}
      style={{ width: size, height: size }}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
    >
      {signedUrl && !failed ? (
        <img src={signedUrl} alt={decorative ? '' : label} decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="profile-avatar__fallback" aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}
