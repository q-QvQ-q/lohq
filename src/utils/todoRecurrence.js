export const RECURRENCE_LABELS = { none: '不重复', daily: '每天', weekly: '每周', monthly: '每月' }

export function occurrencesForMonth(todo, year, monthIndex) {
  const start = todo.due_date
  if (!start) return []
  const rule = todo.recurrence || 'none'
  const first = new Date(`${start}T12:00:00Z`)
  if (Number.isNaN(first.getTime())) return []
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const result = []
  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (date < start) continue
    const current = new Date(`${date}T12:00:00Z`)
    const days = Math.round((current - first) / 86400000)
    const matches = rule === 'daily' ||
      (rule === 'weekly' && days % 7 === 0) ||
      (rule === 'monthly' && day === Math.min(first.getUTCDate(), lastDay)) ||
      (rule === 'none' && date === start)
    if (matches) result.push(date)
  }
  return result
}

export function expandTodosForMonth(templates, completions, year, monthIndex) {
  const completed = new Set(completions.map(row => `${row.todo_id}:${row.occurrence_date}`))
  return templates.flatMap(todo => occurrencesForMonth(todo, year, monthIndex).map(date => ({
    ...todo,
    occurrence_date: date,
    is_completed: (todo.recurrence || 'none') === 'none'
      ? todo.is_completed
      : completed.has(`${todo.id}:${date}`)
  })))
}
