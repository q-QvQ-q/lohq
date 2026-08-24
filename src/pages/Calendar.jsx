import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { formatDate, getAnniversaryTypeLabel } from '../utils/dateUtils.js'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const MOODS = {
  happy: { emoji: '😊', label: '开心' },
  sweet: { emoji: '🥰', label: '甜蜜' },
  normal: { emoji: '😐', label: '一般' },
  sad: { emoji: '😢', label: '难过' },
  angry: { emoji: '😤', label: '生气' }
}

export default function Calendar() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { fetchWithCache, invalidateByPrefix } = useDataCache()
  
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [diaries, setDiaries] = useState([])
  const [todos, setTodos] = useState([])
  const [anniversaries, setAnniversaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  
  const [showTodoModal, setShowTodoModal] = useState(false)
  const [showAnniversaryModal, setShowAnniversaryModal] = useState(false)
  const [showDiaryModal, setShowDiaryModal] = useState(false)
  
  const [newTodo, setNewTodo] = useState({ content: '', priority: 'normal' })
  const [newAnniversary, setNewAnniversary] = useState({ title: '', date: '', type: 'birthday', is_repeat_yearly: true })
  const [newDiary, setNewDiary] = useState({ mood: 'normal', content: '' })

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`
  const cacheKeyDiary = `diaries_${year}_${month}`
  const cacheKeyTodo = `todos_${year}_${month}`

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
      const key = t.due_date
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
    loadData()
  }, [currentMonth])

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
            .select('*, author_profile:profiles(nickname, gender)')
            .gte('created_at', startDate)
            .lte('created_at', endDate + 'T23:59:59')
            .order('created_at', { ascending: true })
          return data || []
        }),
        fetchWithCache(cacheKeyTodo, async () => {
          const { data } = await supabase
            .from('todos')
            .select('*, created_by_profile:profiles(nickname)')
            .gte('due_date', startDate)
            .lte('due_date', endDate)
            .order('due_date', { ascending: true })
          return data || []
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
    setCurrentMonth(new Date(year, month - 1, 1))
  }

  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1))
  }

  async function toggleTodo(id) {
    try {
      const todo = todos.find(t => t.id === id)
      if (!todo) return
      
      const { error } = await supabase
        .from('todos')
        .update({
          is_completed: !todo.is_completed,
          completed_at: !todo.is_completed ? new Date().toISOString() : null,
          completed_by: !todo.is_completed ? profile.id : null
        })
        .eq('id', id)
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
    try {
      const dateStr = getDateKey(selectedDate)
      const { error } = await supabase
        .from('todos')
        .insert({
          content: newTodo.content.trim(),
          priority: newTodo.priority,
          due_date: dateStr,
          created_by: profile.id
        })
      if (error) throw error
      setNewTodo({ content: '', priority: 'normal' })
      setShowTodoModal(false)
      invalidateByPrefix('todos')
      await loadData()
    } catch (err) {
      alert('添加失败: ' + err.message)
    }
  }

  async function addAnniversary() {
    if (!newAnniversary.title.trim() || !newAnniversary.date) {
      alert('请填写完整信息')
      return
    }
    try {
      const { error } = await supabase
        .from('anniversaries')
        .insert({
          title: newAnniversary.title.trim(),
          date: newAnniversary.date,
          type: newAnniversary.type,
          is_repeat_yearly: newAnniversary.is_repeat_yearly,
          created_by: profile.id
        })
      if (error) throw error
      setNewAnniversary({ title: '', date: '', type: 'birthday', is_repeat_yearly: true })
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
          created_by: profile.id,
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
    if (!confirm('确定删除这条待办吗？')) return
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
  const pendingTodos = useMemo(() => todos.filter(t => !t.is_completed), [todos])
  const allAnniversaries = anniversaries

  return (
    <div className="space-y-4">
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs flex items-center gap-2"
             style={{ backgroundColor: 'var(--color-primary)', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <span className="animate-spin">🐱</span> 加载中...
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <span>←</span> 返回
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          <span>📅</span> 日历
        </h1>
        <div style={{ width: '50px' }}></div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between card">
        <button onClick={prevMonth} className="text-xl hover:opacity-70 px-2" style={{ color: 'var(--color-text)' }}>
          ←
        </button>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
          {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
        </h2>
        <button onClick={nextMonth} className="text-xl hover:opacity-70 px-2" style={{ color: 'var(--color-text)' }}>
          →
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
          const isSelected = getDateKey(selectedDate) === getDateKey(date)
          
          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(date)}
              className={`aspect-square p-1 rounded-lg flex flex-col items-center justify-center relative transition-all ${
                isSelected ? 'ring-2' : 'hover:opacity-80'
              }`}
              style={{
                backgroundColor: isSelected ? 'var(--color-primary-light)' : 'rgba(212, 165, 165, 0.1)',
                color: 'var(--color-text)',
                borderColor: isSelected ? 'var(--color-primary)' : 'transparent',
                borderWidth: isSelected ? '2px' : '0',
                opacity: isSelected ? 1 : 0.8
              }}
            >
              <span className="text-sm font-bold" 
                    style={{ color: isToday(date) ? 'var(--color-primary-dark)' : 'var(--color-text)' }}>
                {date.getDate()}
              </span>
              <div className="flex gap-0.5 mt-0.5">
                {hasAnniversary && <span className="text-xs">🎂</span>}
                {hasDiary && <span className="text-xs">📔</span>}
                {hasTodo && <span className="text-xs">✅</span>}
              </div>
            </button>
          )
        })}
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--color-primary-light)' }}>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'all' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'all' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          📋 全部
        </button>
        <button
          onClick={() => setActiveTab('diary')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'diary' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'diary' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          📔 日记
        </button>
        <button
          onClick={() => setActiveTab('todo')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'todo' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'todo' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          ✅ 待办
        </button>
        <button
          onClick={() => setActiveTab('anniversary')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'anniversary' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'anniversary' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          🎂 纪念
        </button>
      </div>

      {/* Add Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setShowDiaryModal(true)}
          className="card text-center py-3 hover:shadow-md transition-shadow"
        >
          <span className="text-xl block">✏️</span>
          <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>写日记</span>
        </button>
        <button
          onClick={() => setShowTodoModal(true)}
          className="card text-center py-3 hover:shadow-md transition-shadow"
        >
          <span className="text-xl block">➕</span>
          <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>加待办</span>
        </button>
        <button
          onClick={() => setShowAnniversaryModal(true)}
          className="card text-center py-3 hover:shadow-md transition-shadow"
        >
          <span className="text-xl block">🎂</span>
          <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>纪念日</span>
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
                  🎂 纪念日
                </p>
                {selectedAnniversaries.map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg mb-1" 
                       style={{ backgroundColor: 'rgba(255, 200, 200, 0.3)' }}>
                    <span>🎂</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{a.title}</span>
                    <span className="text-xs ml-auto" style={{ color: 'var(--color-text-light)' }}>
                      {getAnniversaryTypeLabel(a.type)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Diaries */}
            {selectedDiaries.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--color-text-light)' }}>
                  📔 日记
                </p>
                {selectedDiaries.map(d => {
                  const mood = MOODS[d.mood] || MOODS.normal
                  return (
                    <div key={d.id} className="p-2 rounded-lg mb-2 border-l-4 relative" 
                         style={{ borderColor: 'var(--color-primary-dark)', backgroundColor: 'var(--color-primary-light)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span>{mood.emoji}</span>
                        <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                          {d.author_profile?.nickname || '宝宝'}
                        </span>
                        <button
                          onClick={() => deleteDiary(d.id)}
                          className="absolute top-1 right-1 text-xs hover:opacity-70"
                          style={{ color: 'var(--color-text-light)' }}
                        >
                          ✕
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
                  ✅ 待办
                </p>
                {selectedTodos.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg mb-1"
                       style={{ backgroundColor: t.is_completed ? 'var(--color-primary-light)' : 'white', border: '1px solid var(--color-primary-light)' }}>
                    <input
                      type="checkbox"
                      checked={t.is_completed}
                      onChange={() => toggleTodo(t.id)}
                      className="w-4 h-4"
                    />
                    <span className={`flex-1 text-sm ${t.is_completed ? 'line-through' : ''}`} 
                          style={{ color: t.is_completed ? 'var(--color-text-light)' : 'var(--color-text)' }}>
                      {t.content}
                    </span>
                    {t.priority === 'high' && (
                      <span className="text-xs px-1 rounded" style={{ backgroundColor: '#FFE0E0', color: '#E74C3C' }}>
                        重要
                      </span>
                    )}
                    <button
                      onClick={() => deleteTodo(t.id)}
                      className="text-xs hover:opacity-70"
                      style={{ color: 'var(--color-text-light)' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {selectedAnniversaries.length === 0 && selectedDiaries.length === 0 && selectedTodos.length === 0 && (
              <div className="text-center py-4">
                <span className="text-3xl block mb-2">🐱</span>
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
                📔 本月日记
              </h3>
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                共 {monthDiaries.length} 篇
              </span>
            </div>
            
            {monthDiaries.length === 0 ? (
              <div className="text-center py-4">
                <span className="text-3xl block mb-2">📔</span>
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
                        <span>{mood.emoji}</span>
                        <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                          {d.author_profile?.nickname || '宝宝'}
                        </span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--color-text-light)' }}>
                          {dDate.getMonth() + 1}月{dDate.getDate()}日
                        </span>
                        <button
                          onClick={() => deleteDiary(d.id)}
                          className="absolute top-1 right-1 text-xs hover:opacity-70"
                          style={{ color: 'var(--color-text-light)' }}
                        >
                          ✕
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
                ✅ 待办事项
              </h3>
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                共 {pendingTodos.length} 项未完成
              </span>
            </div>
            
            {pendingTodos.length === 0 ? (
              <div className="text-center py-4">
                <span className="text-3xl block mb-2">🎉</span>
                <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                  太棒了！没有待办事项
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingTodos.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg"
                       style={{ backgroundColor: 'white', border: '1px solid var(--color-primary-light)' }}>
                    <input
                      type="checkbox"
                      checked={t.is_completed}
                      onChange={() => toggleTodo(t.id)}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <p className="text-sm" style={{ color: 'var(--color-text)' }}>
                        {t.content}
                      </p>
                      {t.due_date && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                          📅 {t.due_date}
                        </p>
                      )}
                    </div>
                    {t.priority === 'high' && (
                      <span className="text-xs px-1 rounded" style={{ backgroundColor: '#FFE0E0', color: '#E74C3C' }}>
                        重要
                      </span>
                    )}
                    <button
                      onClick={() => deleteTodo(t.id)}
                      className="text-xs hover:opacity-70"
                      style={{ color: 'var(--color-text-light)' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 纪念 Tab - 显示所有纪念日 */}
        {activeTab === 'anniversary' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>
                🎂 所有纪念日
              </h3>
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                共 {allAnniversaries.length} 个
              </span>
            </div>
            
            {allAnniversaries.length === 0 ? (
              <div className="text-center py-4">
                <span className="text-3xl block mb-2">🎂</span>
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
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg" 
                         style={{ backgroundColor: isToday ? 'rgba(255, 200, 200, 0.3)' : 'white', border: '1px solid var(--color-primary-light)' }}>
                      <span className="text-xl">🎂</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                          {a.title}
                          {isToday && <span className="text-xs ml-1" style={{ color: '#E74C3C' }}>今天</span>}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                          {aDate.getFullYear()}年{aDate.getMonth() + 1}月{aDate.getDate()}日 · {getAnniversaryTypeLabel(a.type)}
                          {a.is_repeat_yearly && ' · 每年'}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteAnniversary(a.id)}
                        className="text-xs hover:opacity-70"
                        style={{ color: 'var(--color-text-light)' }}
                      >
                        ✕
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card w-full max-w-md">
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              ✏️ 写日记
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
                    <span className="text-xl">{val.emoji}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card w-full max-w-md">
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              ✅ 添加待办
            </h3>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
              {formatDate(selectedDate)}
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
              <div className="flex gap-2">
                <button
                  onClick={() => setNewTodo({ ...newTodo, priority: 'normal' })}
                  className={`flex-1 py-2 rounded-lg text-sm ${newTodo.priority === 'normal' ? 'font-bold' : ''}`}
                  style={{
                    backgroundColor: newTodo.priority === 'normal' ? 'var(--color-primary)' : 'var(--color-primary-light)',
                    color: newTodo.priority === 'normal' ? 'white' : 'var(--color-text)'
                  }}
                >
                  一般
                </button>
                <button
                  onClick={() => setNewTodo({ ...newTodo, priority: 'high' })}
                  className={`flex-1 py-2 rounded-lg text-sm ${newTodo.priority === 'high' ? 'font-bold' : ''}`}
                  style={{
                    backgroundColor: newTodo.priority === 'high' ? '#E74C3C' : 'var(--color-primary-light)',
                    color: newTodo.priority === 'high' ? 'white' : 'var(--color-text)'
                  }}
                >
                  重要
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowTodoModal(false)}
                className="btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={addTodo}
                className="btn-primary flex-1"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Anniversary Modal */}
      {showAnniversaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card w-full max-w-md">
            <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              🎂 添加纪念日
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
              <select
                value={newAnniversary.type}
                onChange={(e) => setNewAnniversary({ ...newAnniversary, type: e.target.value })}
                className="input-field"
              >
                <option value="birthday">🎂 生日</option>
                <option value="love">💕 恋爱纪念</option>
                <option value="holiday">🎉 节日</option>
                <option value="other">📌 其他</option>
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
                onClick={() => setShowAnniversaryModal(false)}
                className="btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={addAnniversary}
                className="btn-primary flex-1"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
