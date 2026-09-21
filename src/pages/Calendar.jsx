import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { formatDate, getAnniversaryTypeLabel } from '../utils/dateUtils.js'
import { expandTodosForMonth, RECURRENCE_LABELS } from '../utils/todoRecurrence.js'
import Icon from '../components/Icon.jsx'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const emptyTodo = () => ({ content: '', remind_enabled: false, remind_time: '09:00', recurrence: 'none' })
const emptyAnniversary = () => ({ title: '', date: '', type: 'birthday', is_repeat_yearly: true, remind_enabled: false, remind_time: '09:00' })
const needsReminder = (item) => item.remind_enabled ?? item.priority === 'high'

function dateFromQuery(search) {
  const value = new URLSearchParams(search).get('date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function tabFromQuery(search) {
  const value = new URLSearchParams(search).get('tab')
  return ['all', 'diary', 'todo', 'anniversary'].includes(value) ? value : 'all'
}

const MOODS = {
  happy: { icon: 'sun', label: '开心' },
  sweet: { icon: 'heart', label: '甜蜜' },
  normal: { icon: 'circle', label: '一般' },
  sad: { icon: 'moon', label: '难过' },
  angry: { icon: 'x', label: '生气' }
}

const anniversaryClass = (type, isToday = false) => `anniversary-entry anniversary-entry--${type || 'other'}${isToday ? ' is-today' : ''}`

export default function Calendar({ previewData = null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const targetTodoId = new URLSearchParams(location.search).get('todo')
  const targetAnniversaryId = new URLSearchParams(location.search).get('anniversary')
  const { profile } = useAuth()
  const { fetchWithCache, invalidateByPrefix, profileMap } = useDataCache()
  
  const nameOf = (id, fallback = '宝宝') => id ? (profileMap[id]?.nickname || fallback) : fallback
  
  const [currentMonth, setCurrentMonth] = useState(() => dateFromQuery(location.search) || new Date())
  const [selectedDate, setSelectedDate] = useState(() => dateFromQuery(location.search) || new Date())
  const [diaries, setDiaries] = useState(previewData?.diaries || [])
  const [todos, setTodos] = useState(previewData?.todos || [])
  const [anniversaries, setAnniversaries] = useState(previewData?.anniversaries || [])
  const [loading, setLoading] = useState(!previewData)
  const [activeTab, setActiveTab] = useState(() => tabFromQuery(location.search))
  
  const [showTodoModal, setShowTodoModal] = useState(false)
  const [showAnniversaryModal, setShowAnniversaryModal] = useState(false)
  const [showDiaryModal, setShowDiaryModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState(null)
  const [editingAnniversary, setEditingAnniversary] = useState(null)
  
  const [newTodo, setNewTodo] = useState(emptyTodo)
  const [newAnniversary, setNewAnniversary] = useState(emptyAnniversary)
  const [newDiary, setNewDiary] = useState({ mood: 'normal', content: '' })

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`
  const cacheKeyDiary = `diaries_${year}_${month}`
  const cacheKeyTodo = `todos_recurring_${year}_${month}`

  const getDateKey = useCallback((date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }, [])

  const diaryMap = useMemo(() => {
    const map = new Map()
    for (const d of diaries) {
      const key = getDateKey(new Date(d.created_at))
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(d)
    }
    return map
  }, [diaries, getDateKey])

  const todoMap = useMemo(() => {
    const map = new Map()
    for (const t of todos) {
      const key = t.occurrence_date || t.due_date
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    return map
  }, [todos])

  const annivMap = useMemo(() => {
    const map = new Map()
    for (const a of anniversaries) {
      const aDate = new Date(a.date)
      let key
      if (a.is_repeat_yearly) {
        key = `${aDate.getMonth() + 1}-${aDate.getDate()}`
      } else {
        key = getDateKey(aDate)
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
    return map
  }, [anniversaries, getDateKey])

  const getDiariesForDate = useCallback((date) => {
    return diaryMap.get(getDateKey(date)) || []
  }, [diaryMap, getDateKey])

  const getTodosForDate = useCallback((date) => {
    return todoMap.get(getDateKey(date)) || []
  }, [todoMap, getDateKey])

  const getAnniversariesForDate = useCallback((date) => {
    const day = date.getDate()
    const mon = date.getMonth()
    const yearlyKey = `${mon + 1}-${day}`
    const yearly = annivMap.get(yearlyKey) || []
    const fullKey = getDateKey(date)
    const full = annivMap.get(fullKey) || []
    return [...yearly, ...full]
  }, [annivMap, getDateKey])

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result = []
    for (let i = 0; i < firstDay; i++) {
      result.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      result.push(new Date(year, month, i))
    }
    return result
  }, [year, month])

  const isToday = useCallback((date) => {
    const today = new Date()
    return getDateKey(today) === getDateKey(date)
  }, [getDateKey])

  useEffect(() => {
    if (previewData) return
    loadData()
  }, [currentMonth, previewData])

  useEffect(() => {
    const date = dateFromQuery(location.search)
    if (date) {
      setCurrentMonth(date)
      setSelectedDate(date)
      setActiveTab('all')
    }
  }, [location.search])

  async function loadData() {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      const [diaryData, todoData, annivData] = await Promise.all([
        fetchWithCache(cacheKeyDiary, async () => {
          const { data } = await supabase
            .from('diaries')
            .select('*')
            .gte('created_at', startDate)
            .lte('created_at', endDate + 'T23:59:59')
            .order('created_at', { ascending: true })
          return data || []
        }),
        fetchWithCache(cacheKeyTodo, async () => {
          const [singleResult, recurringResult, completionsResult] = await Promise.all([
            supabase.from('todos').select('*').eq('recurrence', 'none')
              .gte('due_date', startDate).lte('due_date', endDate),
            supabase.from('todos').select('*').neq('recurrence', 'none')
              .lte('due_date', endDate),
            supabase.from('todo_occurrence_completions').select('todo_id, occurrence_date')
              .gte('occurrence_date', startDate).lte('occurrence_date', endDate)
          ])
          for (const result of [singleResult, recurringResult, completionsResult]) {
            if (result.error) throw result.error
          }
          return expandTodosForMonth(
            [...singleResult.data, ...recurringResult.data],
            completionsResult.data, year, month
          )
        }),
        fetchWithCache('anniversaries', async () => {
          const { data } = await supabase.from('anniversaries').select('*')
          return data || []
        })
      ])
      
      const monthAnniversaries = annivData.filter(a => {
        const annivDate = new Date(a.date)
        return annivDate.getMonth() === month
      })
      
      setDiaries(diaryData)
      setTodos(todoData)
      setAnniversaries(monthAnniversaries)
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  function prevMonth() {
    const target = new Date(year, month - 1, 1)
    setCurrentMonth(target)
    setSelectedDate(target)
  }

  function nextMonth() {
    const target = new Date(year, month + 1, 1)
    setCurrentMonth(target)
    setSelectedDate(target)
  }

  function openTodoModal(todo = null) {
    setEditingTodo(todo)
    setNewTodo(todo ? {
      content: todo.content,
      remind_enabled: needsReminder(todo),
      remind_time: String(todo.remind_time || '09:00').slice(0, 5),
      recurrence: todo.recurrence || 'none'
    } : emptyTodo())
    setShowTodoModal(true)
  }

  function openAnniversaryModal(anniversary = null) {
    setEditingAnniversary(anniversary)
    setNewAnniversary(anniversary ? {
      title: anniversary.title,
      date: anniversary.date,
      type: anniversary.type,
      is_repeat_yearly: anniversary.is_repeat_yearly,
      remind_enabled: anniversary.remind_enabled || false,
      remind_time: String(anniversary.remind_time || '09:00').slice(0, 5)
    } : emptyAnniversary())
    setShowAnniversaryModal(true)
  }

  async function toggleTodo(todo) {
    try {
      if (!todo) return
      let result
      if (todo.recurrence && todo.recurrence !== 'none') {
        result = todo.is_completed
          ? await supabase.from('todo_occurrence_completions').delete()
            .eq('todo_id', todo.id).eq('occurrence_date', todo.occurrence_date)
          : await supabase.from('todo_occurrence_completions').upsert({
            todo_id: todo.id, occurrence_date: todo.occurrence_date, completed_by: profile.id
          }, { onConflict: 'todo_id,occurrence_date' })
      } else {
        result = await supabase.from('todos').update({
          is_completed: !todo.is_completed,
          completed_at: !todo.is_completed ? new Date().toISOString() : null,
          completed_by: !todo.is_completed ? profile.id : null
        }).eq('id', todo.id)
      }
      const { error } = result
      if (error) throw error
      invalidateByPrefix('todos')
      await loadData()
    } catch (err) {
      alert('操作失败: ' + err.message)
    }
  }

  async function addTodo() {
    if (!newTodo.content.trim()) {
      alert('请输入待办内容')
      return
    }
    if (newTodo.remind_enabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(newTodo.remind_time)) {
      alert('请选择有效的提醒时间')
      return
    }
    try {
      const dateStr = getDateKey(selectedDate)
      const values = {
        content: newTodo.content.trim(),
        priority: newTodo.remind_enabled ? 'high' : 'normal',
        remind_enabled: newTodo.remind_enabled,
        remind_time: newTodo.remind_time,
        recurrence: newTodo.recurrence
      }
      const { error } = editingTodo
        ? await supabase.from('todos').update(values).eq('id', editingTodo.id)
        : await supabase.from('todos').insert({ ...values, due_date: dateStr, created_by: profile.id })
      if (error) throw error
      setNewTodo(emptyTodo())
      setEditingTodo(null)
      setShowTodoModal(false)
      invalidateByPrefix('todos')
      await loadData()
    } catch (err) {
      alert('添加失败: ' + err.message)
    }
  }

  async function addAnniversary() {
    const anniversaryDate = newAnniversary.date || getDateKey(selectedDate)
    if (!newAnniversary.title.trim() || !anniversaryDate) {
      alert('请填写完整信息')
      return
    }
    if (newAnniversary.remind_enabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(newAnniversary.remind_time)) {
      alert('请选择有效的提醒时间')
      return
    }
    try {
      const values = {
        title: newAnniversary.title.trim(),
        date: anniversaryDate,
        type: newAnniversary.type,
        is_repeat_yearly: newAnniversary.is_repeat_yearly,
        remind_enabled: newAnniversary.remind_enabled,
        remind_time: newAnniversary.remind_time,
        ...(!editingAnniversary?.created_by ? { created_by: profile.id } : {})
      }
      const { error } = editingAnniversary
        ? await supabase.from('anniversaries').update(values).eq('id', editingAnniversary.id)
        : await supabase.from('anniversaries').insert({ ...values, created_by: profile.id })
      if (error) throw error
      setNewAnniversary(emptyAnniversary())
      setEditingAnniversary(null)
      setShowAnniversaryModal(false)
      invalidateByPrefix('anniversaries')
      await loadData()
    } catch (err) {
      alert('添加失败: ' + err.message)
    }
  }

  async function addDiary() {
    if (!newDiary.content.trim()) {
      alert('请输入日记内容')
      return
    }
    try {
      const { error } = await supabase
        .from('diaries')
        .insert({
          mood: newDiary.mood,
          content: newDiary.content.trim(),
          author_id: profile.id,
          created_at: getDateKey(selectedDate) + 'T12:00:00'
        })
      if (error) throw error
      setNewDiary({ mood: 'normal', content: '' })
      setShowDiaryModal(false)
      invalidateByPrefix('diaries')
      await loadData()
    } catch (err) {
      alert('保存失败: ' + err.message)
    }
  }

  async function deleteTodo(id) {
    if (!confirm('确定删除这条待办吗？重复待办会删除整个重复安排。')) return
    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)
      if (error) throw error
      invalidateByPrefix('todos')
      await loadData()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  async function deleteDiary(id) {
    if (!confirm('确定删除这篇日记吗？')) return
    try {
      const { error } = await supabase
        .from('diaries')
        .delete()
        .eq('id', id)
      if (error) throw error
      invalidateByPrefix('diaries')
      await loadData()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  async function deleteAnniversary(id) {
    if (!confirm('确定删除这个纪念日吗？')) return
    try {
      const { error } = await supabase
        .from('anniversaries')
        .delete()
        .eq('id', id)
      if (error) throw error
      invalidateByPrefix('anniversaries')
      await loadData()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  const selectedDiaries = useMemo(() => getDiariesForDate(selectedDate), [getDiariesForDate, selectedDate])
  const selectedTodos = useMemo(() => getTodosForDate(selectedDate), [getTodosForDate, selectedDate])
  const selectedAnniversaries = useMemo(() => getAnniversariesForDate(selectedDate), [getAnniversariesForDate, selectedDate])
  
  const monthDiaries = diaries
  const pendingTodos = useMemo(() => todos.filter(t => !t.is_completed).sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date)), [todos])
  const allAnniversaries = anniversaries

  return (
    <div className="space-y-5">
      {loading && (
        <div className="glass-pill fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-xs flex items-center gap-2">
          <Icon name="calendar" size={16} /> 加载中...
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <Icon name="chevronLeft" size={17} /> 返回
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          <Icon name="calendar" size={22} /> 日历
        </h1>
        <div style={{ width: '50px' }}></div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between card">
        <button onClick={prevMonth} className="icon-button" aria-label="上个月">
          <Icon name="chevronLeft" size={19} />
        </button>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
          {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
        </h2>
        <button onClick={nextMonth} className="icon-button" aria-label="下个月">
          <Icon name="chevronRight" size={19} />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center text-xs font-bold py-1" style={{ color: 'var(--color-text-light)' }}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, idx) => {
          if (!date) {
            return <div key={idx} />
          }
          
          const dayDiaries = getDiariesForDate(date)
          const dayTodos = getTodosForDate(date)
          const dayAnniversaries = getAnniversariesForDate(date)
          const hasDiary = dayDiaries.length > 0
          const hasTodo = dayTodos.length > 0
          const hasAnniversary = dayAnniversaries.length > 0
          const diaryMood = hasDiary ? (MOODS[dayDiaries[dayDiaries.length - 1]?.mood] || MOODS.normal) : null
          const isSelected = getDateKey(selectedDate) === getDateKey(date)
          const isCurrentDay = isToday(date)
          
          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(date)}
              className={`calendar-day aspect-square p-1 flex flex-col items-center justify-center relative${isCurrentDay ? ' is-today' : ''}`}
              aria-selected={isSelected}
              aria-label={`${date.getMonth() + 1}月${date.getDate()}日${isCurrentDay ? '，今天' : ''}${hasAnniversary ? '，有纪念日' : ''}`}
              style={{ color: 'var(--color-text)' }}
            >
              <span className={`calendar-day__date${hasAnniversary ? ' has-anniversary' : ''}`}>
                {date.getDate()}
              </span>
              <div className="calendar-day__markers" aria-hidden="true">
                {hasDiary && <span className="calendar-mood"><Icon name={diaryMood.icon} size={11} /></span>}
                {hasTodo && <span className="calendar-dot" />}
              </div>
            </button>
          )
        })}
      </div>

      {/* Tab Buttons */}
      <div className="segmented-control" role="tablist" aria-label="日历内容">
        <button role="tab" aria-selected={activeTab === 'all'} onClick={() => setActiveTab('all')}><Icon name="list" size={16} />全部</button>
        <button role="tab" aria-selected={activeTab === 'diary'} onClick={() => setActiveTab('diary')}><Icon name="note" size={16} />日记</button>
        <button role="tab" aria-selected={activeTab === 'todo'} onClick={() => setActiveTab('todo')}><Icon name="check" size={16} />待办</button>
        <button role="tab" aria-selected={activeTab === 'anniversary'} onClick={() => setActiveTab('anniversary')}><Icon name="heart" size={16} />纪念</button>
      </div>

      {/* Add Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setShowDiaryModal(true)}
          className="glass-button flex-col py-3"
        >
          <Icon name="pencil" size={18} />
          <span className="text-xs">写日记</span>
        </button>
        <button
          onClick={() => openTodoModal()}
          className="btn-primary flex-col py-3"
        >
          <Icon name="plus" size={18} />
          <span className="text-xs">加待办</span>
        </button>
        <button
          onClick={() => openAnniversaryModal()}
          className="glass-button flex-col py-3"
        >
          <Icon name="calendar" size={18} />
          <span className="text-xs">纪念日</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="card">
        {/* 全部 Tab - 显示选中日期的所有内容 */}
        {activeTab === 'all' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>
                {formatDate(selectedDate)}
              </h3>
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                共 {selectedDiaries.length + selectedTodos.length + selectedAnniversaries.length} 条记录
              </span>
            </div>

            {/* Anniversaries */}
            {selectedAnniversaries.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--color-text-light)' }}>
                  <Icon name="calendar" size={15} className="inline mr-1" />纪念日
                </p>
                {selectedAnniversaries.map(a => (
                  <div key={a.id} className={`${anniversaryClass(a.type)} mb-1`}
                       style={{ outline: a.id === targetAnniversaryId ? '2px solid var(--color-primary)' : undefined }}>
                    <span className="anniversary-entry__icon"><Icon name={a.type === 'love' ? 'heart' : a.type === 'birthday' ? 'gift' : 'calendar'} size={17} /></span>
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{a.title}</span>
                    {a.remind_enabled && <span className="meta-chip ml-auto"><Icon name="bell" size={13} />{String(a.remind_time || '09:00').slice(0, 5)}</span>}
                    <span className="anniversary-entry__type">
                      {getAnniversaryTypeLabel(a.type)}
                    </span>
                    <button type="button" onClick={() => openAnniversaryModal(a)} aria-label={`编辑纪念日：${a.title}`}
                      className="text-xs hover:opacity-70" style={{ color: 'var(--color-primary-dark)' }}>编辑</button>
                  </div>
                ))}
              </div>
            )}

            {/* Diaries */}
            {selectedDiaries.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--color-text-light)' }}>
                  <Icon name="note" size={15} className="inline mr-1" />日记
                </p>
                {selectedDiaries.map(d => {
                  const mood = MOODS[d.mood] || MOODS.normal
                  return (
                    <div key={d.id} className="p-2 rounded-lg mb-2 border-l-4 relative" 
                         style={{ borderColor: 'var(--color-primary-dark)', backgroundColor: 'var(--color-primary-light)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name={mood.icon} size={16} />
                        <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                          {nameOf(d.author_id)}
                        </span>
                        <button
                          onClick={() => deleteDiary(d.id)}
                          className="absolute top-1 right-1 text-xs hover:opacity-70"
                          style={{ color: 'var(--color-text-light)' }}
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                        {d.content}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Todos */}
            {selectedTodos.length > 0 && (
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--color-text-light)' }}>
                  <Icon name="check" size={15} className="inline mr-1" />待办
                </p>
                <div className="space-y-2">
                  {selectedTodos.map(t => <TodoCard key={`${t.id}-${t.occurrence_date}`} todo={t} highlighted={t.id === targetTodoId} onToggle={toggleTodo} onEdit={openTodoModal} onDelete={deleteTodo} />)}
                </div>
              </div>
            )}

            {/* Empty State */}
            {selectedAnniversaries.length === 0 && selectedDiaries.length === 0 && selectedTodos.length === 0 && (
              <div className="text-center py-4">
                <Icon name="calendar" size={25} className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                  这天还没有记录哦
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                  点击上面的按钮添加日记、待办或纪念日
                </p>
              </div>
            )}
          </>
        )}

        {/* 日记 Tab - 显示本月所有日记 */}
        {activeTab === 'diary' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>
                <Icon name="note" size={17} className="inline mr-1" />本月日记
              </h3>
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                共 {monthDiaries.length} 篇
              </span>
            </div>
            
            {monthDiaries.length === 0 ? (
              <div className="text-center py-4">
                <Icon name="note" size={25} className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                  本月还没有日记
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {monthDiaries.map(d => {
                  const mood = MOODS[d.mood] || MOODS.normal
                  const dDate = new Date(d.created_at)
                  return (
                    <div key={d.id} className="p-2 rounded-lg border-l-4 relative" 
                         style={{ borderColor: 'var(--color-primary-dark)', backgroundColor: 'var(--color-primary-light)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name={mood.icon} size={16} />
                        <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                          {nameOf(d.author_id)}
                        </span>
                        <span className="text-xs ml-auto mr-5" style={{ color: 'var(--color-text-light)' }}>
                          {dDate.getMonth() + 1}月{dDate.getDate()}日
                        </span>
                        <button
                          type="button"
                          aria-label="删除这篇日记"
                          onClick={() => deleteDiary(d.id)}
                          className="absolute top-1 right-1 text-xs hover:opacity-70"
                          style={{ color: 'var(--color-text-light)' }}
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                        {d.content}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* 待办 Tab - 显示所有未完成的待办 */}
        {activeTab === 'todo' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>
                <Icon name="check" size={17} className="inline mr-1" />待办事项
              </h3>
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                共 {pendingTodos.length} 项未完成
              </span>
            </div>
            
            {pendingTodos.length === 0 ? (
              <div className="text-center py-4">
                <Icon name="check" size={25} className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                  太棒了！没有待办事项
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingTodos.map(t => <TodoCard key={`${t.id}-${t.occurrence_date}`} todo={t} onToggle={toggleTodo} onEdit={openTodoModal} onDelete={deleteTodo} />)}
              </div>
            )}
          </>
        )}

        {/* 纪念 Tab - 显示所有纪念日 */}
        {activeTab === 'anniversary' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>
                <Icon name="calendar" size={17} className="inline mr-1" />所有纪念日
              </h3>
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                共 {allAnniversaries.length} 个
              </span>
            </div>
            
            {allAnniversaries.length === 0 ? (
              <div className="text-center py-4">
                <Icon name="calendar" size={25} className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                  还没有添加纪念日
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {allAnniversaries.map(a => {
                  const aDate = new Date(a.date)
                  const today = new Date()
                  const isToday = aDate.getMonth() === today.getMonth() && aDate.getDate() === today.getDate()
                  return (
                    <div key={a.id} className={anniversaryClass(a.type, isToday)}>
                      <span className="anniversary-entry__icon"><Icon name={a.type === 'love' ? 'heart' : a.type === 'birthday' ? 'gift' : 'calendar'} size={18} /></span>
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                          {a.title}
                          {isToday && <span className="anniversary-entry__today">今天</span>}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                          {aDate.getFullYear()}年{aDate.getMonth() + 1}月{aDate.getDate()}日 · {getAnniversaryTypeLabel(a.type)}
                          {a.is_repeat_yearly && ' · 每年'}
                          {a.remind_enabled && ` · ${String(a.remind_time || '09:00').slice(0, 5)} 提醒`}
                        </p>
                      </div>
                      <button type="button" onClick={() => openAnniversaryModal(a)} aria-label={`编辑纪念日：${a.title}`}
                        className="text-xs hover:opacity-70" style={{ color: 'var(--color-primary-dark)' }}>编辑</button>
                      <button
                        onClick={() => deleteAnniversary(a.id)}
                        className="text-xs hover:opacity-70"
                        style={{ color: 'var(--color-text-light)' }}
                      >
                        <Icon name="x" size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Diary Modal */}
      {showDiaryModal && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-surface" role="dialog" aria-modal="true" aria-label="写日记">
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              <Icon name="pencil" size={19} className="inline mr-1" />写日记
            </h3>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
              {formatDate(selectedDate)}
            </p>
            <div className="space-y-3">
              <div className="flex gap-2 justify-center">
                {Object.entries(MOODS).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => setNewDiary({ ...newDiary, mood: key })}
                    className={`flex-1 py-2 rounded-lg text-sm transition-all ${
                      newDiary.mood === key ? 'ring-2 font-bold' : 'opacity-60'
                    }`}
                    style={{
                      backgroundColor: newDiary.mood === key ? 'var(--color-primary-light)' : 'transparent',
                      borderColor: newDiary.mood === key ? 'var(--color-primary)' : 'transparent'
                    }}
                  >
                    <Icon name={val.icon} size={18} className="mx-auto" />
                    <span className="block text-xs">{val.label}</span>
                  </button>
                ))}
              </div>
              <textarea
                value={newDiary.content}
                onChange={(e) => setNewDiary({ ...newDiary, content: e.target.value })}
                placeholder="今天想记录什么呢..."
                className="input-field min-h-[100px]"
                autoFocus
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowDiaryModal(false)}
                className="btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={addDiary}
                className="btn-primary flex-1"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Todo Modal */}
      {showTodoModal && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-surface" role="dialog" aria-modal="true" aria-label={editingTodo ? '编辑待办' : '添加待办'}>
            <h3 className="text-xl font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <Icon name={editingTodo ? 'pencil' : 'plus'} size={20} /> {editingTodo ? '编辑待办' : '添加待办'}
            </h3>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
              {editingTodo ? `修改${editingTodo.recurrence !== 'none' ? '整个重复待办' : '待办'}的提醒设置` : formatDate(selectedDate)}
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={newTodo.content}
                onChange={(e) => setNewTodo({ ...newTodo, content: e.target.value })}
                placeholder="待办内容"
                className="input-field"
                autoFocus
              />
              <div className="segmented-control" role="group" aria-label="提醒设置">
                <button
                  onClick={() => setNewTodo({ ...newTodo, remind_enabled: false })}
                  aria-pressed={!newTodo.remind_enabled}
                >
                  <Icon name="circle" size={16} /> 不需要提醒
                </button>
                <button
                  onClick={() => setNewTodo({ ...newTodo, remind_enabled: true })}
                  aria-pressed={newTodo.remind_enabled}
                >
                  <Icon name="bell" size={16} /> 需要提醒
                </button>
              </div>
              {newTodo.remind_enabled && <label className="block text-sm" style={{ color: 'var(--color-text)' }}>
                提醒时间（北京时间）
                <input type="time" required value={newTodo.remind_time}
                  onChange={(e) => setNewTodo({ ...newTodo, remind_time: e.target.value })}
                  className="input-field mt-1" />
              </label>}
              <label className="block text-sm" style={{ color: 'var(--color-text)' }}>
                重复
                <select value={newTodo.recurrence}
                  onChange={(e) => setNewTodo({ ...newTodo, recurrence: e.target.value })}
                  className="input-field mt-1">
                  {Object.entries(RECURRENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowTodoModal(false); setEditingTodo(null) }}
                className="btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={addTodo}
                className="btn-primary flex-1"
              >
                {editingTodo ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Anniversary Modal */}
      {showAnniversaryModal && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-surface" role="dialog" aria-modal="true" aria-label={editingAnniversary ? '编辑纪念日' : '添加纪念日'}>
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              <Icon name="calendar" size={19} className="inline mr-1" />{editingAnniversary ? '编辑纪念日' : '添加纪念日'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newAnniversary.title}
                onChange={(e) => setNewAnniversary({ ...newAnniversary, title: e.target.value })}
                placeholder="纪念日名称（如：宝宝生日）"
                className="input-field"
                autoFocus
              />
              <input
                type="date"
                value={newAnniversary.date || getDateKey(selectedDate)}
                onChange={(e) => setNewAnniversary({ ...newAnniversary, date: e.target.value })}
                className="input-field"
              />
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                <input type="checkbox" checked={newAnniversary.remind_enabled}
                  onChange={(e) => setNewAnniversary({ ...newAnniversary, remind_enabled: e.target.checked })} />
                需要提醒
              </label>
              {newAnniversary.remind_enabled && <label className="block text-sm" style={{ color: 'var(--color-text)' }}>
                提醒时间（北京时间）
                <input type="time" required value={newAnniversary.remind_time}
                  onChange={(e) => setNewAnniversary({ ...newAnniversary, remind_time: e.target.value })}
                  className="input-field mt-1" />
              </label>}
              <select
                value={newAnniversary.type}
                onChange={(e) => setNewAnniversary({ ...newAnniversary, type: e.target.value })}
                className="input-field"
              >
                <option value="birthday">生日</option>
                <option value="love">恋爱纪念</option>
                <option value="holiday">节日</option>
                <option value="other">其他</option>
              </select>
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                <input
                  type="checkbox"
                  checked={newAnniversary.is_repeat_yearly}
                  onChange={(e) => setNewAnniversary({ ...newAnniversary, is_repeat_yearly: e.target.checked })}
                />
                每年重复
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowAnniversaryModal(false); setEditingAnniversary(null) }}
                className="btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={addAnniversary}
                className="btn-primary flex-1"
              >
                {editingAnniversary ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TodoCard({ todo, highlighted, onToggle, onEdit, onDelete }) {
  return (
    <div className={`task-card ${todo.is_completed ? 'is-complete' : ''}`} style={highlighted ? { outline: '2px solid var(--color-primary)' } : undefined}>
      <input type="checkbox" checked={todo.is_completed} onChange={() => onToggle(todo)} aria-label={`${todo.is_completed ? '取消完成' : '完成'}：${todo.content}`} className="mt-1 w-[18px] h-[18px] shrink-0 accent-[var(--color-primary)]" />
      <div className="task-card__body">
        <p className={`task-card__title ${todo.is_completed ? 'line-through opacity-70' : ''}`}>{todo.content}</p>
        <div className="task-card__meta">
          {todo.occurrence_date && <span className="meta-chip"><Icon name="calendar" size={13} />{todo.occurrence_date}</span>}
          {todo.recurrence && todo.recurrence !== 'none' && <span className="meta-chip"><Icon name="repeat" size={13} />{RECURRENCE_LABELS[todo.recurrence]}</span>}
          {needsReminder(todo) ? <span className="meta-chip"><Icon name="bell" size={13} />{String(todo.remind_time || '09:00').slice(0, 5)}</span> : <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>无提醒</span>}
          {todo.is_completed && <span className="meta-chip"><Icon name="check" size={13} />已完成</span>}
        </div>
      </div>
      <div className="task-card__actions">
        <button type="button" className="icon-button" title="编辑" aria-label={`编辑待办：${todo.content}`} onClick={() => onEdit(todo)}><Icon name="pencil" size={16} /></button>
        <button type="button" className="icon-button" title="删除" aria-label={`删除待办：${todo.content}`} onClick={() => onDelete(todo.id)}><Icon name="trash" size={16} /></button>
      </div>
    </div>
  )
}
