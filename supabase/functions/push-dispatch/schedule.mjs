// Calendar dates and reminder times are interpreted in Asia/Shanghai.
export function chinaClock(instant = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

export function dueWithinWindow(remindTime, currentTime, minutes = 10) {
  const [hour, minute] = String(remindTime).split(':').map(Number)
  const [nowHour, nowMinute] = String(currentTime).split(':').map(Number)
  if (![hour, minute, nowHour, nowMinute].every(Number.isInteger)) return false
  const difference = nowHour * 60 + nowMinute - (hour * 60 + minute)
  return difference >= 0 && difference <= minutes
}

export function todoOccursOn(todo, date) {
  if (!todo.due_date || date < todo.due_date) return false
  const recurrence = todo.recurrence || 'none'
  if (recurrence === 'none') return date === todo.due_date
  if (recurrence === 'daily') return true
  const first = Date.parse(`${todo.due_date}T12:00:00Z`)
  const current = Date.parse(`${date}T12:00:00Z`)
  if (!Number.isFinite(first) || !Number.isFinite(current)) return false
  if (recurrence === 'weekly') return Math.round((current - first) / 86400000) % 7 === 0
  if (recurrence === 'monthly') {
    const startDay = Number(todo.due_date.slice(8, 10))
    const [year, month, day] = date.split('-').map(Number)
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return day === Math.min(startDay, lastDay)
  }
  return false
}

export function anniversaryOccursOn(anniversary, date) {
  if (!anniversary.date || date < anniversary.date) return false
  return anniversary.is_repeat_yearly
    ? anniversary.date.slice(5) === date.slice(5)
    : anniversary.date === date
}
