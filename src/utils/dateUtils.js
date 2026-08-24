export function daysBetween(startDate) {
  const start = new Date(startDate)
  const today = new Date()
  start.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diff = today - start
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

export function daysUntil(targetDate, repeatYearly = true) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)
  if (repeatYearly) {
    target.setFullYear(today.getFullYear())
    if (target < today) {
      target.setFullYear(today.getFullYear() + 1)
    }
  }
  const diff = target - today
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours().toString().padStart(2, '0')
  const minute = date.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

export function getNextOccurrence(dateStr, repeatYearly = true) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(dateStr)
  date.setHours(0, 0, 0, 0)
  if (repeatYearly) {
    date.setFullYear(today.getFullYear())
    if (date < today) {
      date.setFullYear(today.getFullYear() + 1)
    }
  }
  return date
}

export function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const days = Math.floor((date - firstDayOfYear) / (24 * 60 * 60 * 1000))
  return Math.ceil((days + firstDayOfYear.getDay() + 1) / 7)
}

export function getWeekRange(year, weekNumber) {
  const firstDayOfYear = new Date(year, 0, 1)
  const startDay = new Date(firstDayOfYear)
  startDay.setDate(firstDayOfYear.getDate() + (weekNumber - 1) * 7 - firstDayOfYear.getDay())
  const endDay = new Date(startDay)
  endDay.setDate(startDay.getDate() + 6)
  return { start: startDay, end: endDay }
}

export function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function getAnniversaryTypeLabel(type) {
  const map = { birthday: '生日', love: '恋爱', holiday: '节日', other: '其他' }
  return map[type] || '其他'
}
