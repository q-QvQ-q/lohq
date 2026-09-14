import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { getWeekNumber, getWeekRange } from '../utils/dateUtils.js'

function StarRating({ value, onChange, size = 'text-xl', readOnly = false }) {
  const [hoverValue, setHoverValue] = useState(0)
  
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange(star)}
          onMouseEnter={() => !readOnly && setHoverValue(star)}
          onMouseLeave={() => !readOnly && setHoverValue(0)}
          className={`${size} transition-all ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
          style={{ color: (hoverValue || value) >= star ? '#FFD700' : '#DDD' }}
        >
          ★
        </button>
      ))}
      {value > 0 && (
        <span className="text-xs ml-1" style={{ color: 'var(--color-text-light)' }}>
          {value}.0
        </span>
      )}
    </div>
  )
}

export default function WeeklySummaries() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { fetchWithCache, invalidateByPrefix, profileMap } = useDataCache()
  const nameOf = (id, fallback = '宝宝') => id ? (profileMap[id]?.nickname || fallback) : fallback
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentWeek, setCurrentWeek] = useState(getWeekNumber(new Date()))
  const [showModal, setShowModal] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newRating, setNewRating] = useState(5)
  const [newPartnerRating, setNewPartnerRating] = useState(5)
  const [existingSummary, setExistingSummary] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile?.id) loadSummaries()
  }, [currentYear, currentWeek, profile?.id])

  async function loadSummaries() {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      const cacheKey = `weekly_${currentYear}_${currentWeek}`
      const data = await fetchWithCache(cacheKey, async () => {
        const { data } = await supabase
          .from('weekly_summaries')
          .select('*')
          .eq('year', currentYear)
          .eq('week_number', currentWeek)
        return data || []
      })
      // Old deployments could contain duplicate rows after a double-click.
      // Keep the latest row for each author while the database migration
      // permanently removes duplicates and adds the unique index.
      const latestByAuthor = new Map()
      ;(data || []).forEach(summary => {
        const current = latestByAuthor.get(summary.author_id)
        const currentTime = new Date(current?.updated_at || current?.created_at || 0).getTime()
        const summaryTime = new Date(summary.updated_at || summary.created_at || 0).getTime()
        if (!current || summaryTime >= currentTime) latestByAuthor.set(summary.author_id, summary)
      })
      const uniqueSummaries = Array.from(latestByAuthor.values())
      setSummaries(uniqueSummaries)
      
      const mine = uniqueSummaries.find(s => s.author_id === profile?.id)
      setExistingSummary(mine || null)
      
      if (mine) {
        setNewRating(mine.my_rating || 5)
        setNewPartnerRating(mine.partner_rating || 5)
      } else {
        setNewRating(5)
        setNewPartnerRating(5)
      }
    } catch (err) {
      console.error('加载失败:', err)
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveSummary() {
    if (saving) return
    if (!newContent.trim()) {
      alert('请填写内容')
      return
    }
    
    setSaving(true)
    try {
      if (existingSummary) {
        const { data, error } = await supabase
          .from('weekly_summaries')
          .update({ 
            content: newContent,
            my_rating: newRating,
            partner_rating: newPartnerRating,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSummary.id)
          .select()
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('weekly_summaries')
          .insert({
            week_number: currentWeek,
            year: currentYear,
            author_id: profile.id,
            content: newContent,
            my_rating: newRating,
            partner_rating: newPartnerRating
          })
          .select()
        if (error) throw error
      }
      
      setShowModal(false)
      setNewContent('')
      setNewRating(5)
      setNewPartnerRating(5)
      invalidateByPrefix(`weekly_`)
      await loadSummaries()
    } catch (err) {
      console.error('保存周总结失败:', err)
      alert('保存失败: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSummary(id) {
    if (!confirm('确定删除这篇周总结吗？')) return
    try {
      const { error } = await supabase
        .from('weekly_summaries')
        .delete()
        .eq('id', id)
      if (error) throw error
      invalidateByPrefix(`weekly_`)
      await loadSummaries()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  function openCreateModal() {
    if (existingSummary) {
      setNewContent(existingSummary.content)
      setNewRating(existingSummary.my_rating || 5)
      setNewPartnerRating(existingSummary.partner_rating || 5)
    } else {
      setNewContent('')
      setNewRating(5)
      setNewPartnerRating(5)
    }
    setShowModal(true)
  }

  function changeWeek(delta) {
    let newWeek = currentWeek + delta
    let newYear = currentYear
    
    // Calculate max weeks for the target year
    const dec28 = new Date(newYear, 11, 28)
    const maxWeek = getWeekNumber(dec28)
    
    if (newWeek < 1) {
      newYear -= 1
      const prevDec28 = new Date(newYear, 11, 28)
      newWeek = getWeekNumber(prevDec28)
    } else if (newWeek > maxWeek) {
      newWeek = 1
      newYear += 1
    }
    
    setCurrentWeek(newWeek)
    setCurrentYear(newYear)
  }

  const weekRange = getWeekRange(currentYear, currentWeek)
  const isCurrentWeek = currentYear === new Date().getFullYear() && currentWeek === getWeekNumber(new Date())

  // 计算双方平均评分
  const mySummary = summaries.find(s => s.author_id === profile?.id)
  const partnerSummary = summaries.find(s => s.author_id !== profile?.id)

  return (
    <div className="space-y-4">
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs flex items-center gap-2"
             style={{ backgroundColor: 'var(--color-primary)', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <span className="animate-spin">📊</span> 加载中...
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
          <span>📊</span> 周总结
        </h1>
        <button
          type="button"
          onClick={openCreateModal}
          className="px-3 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
        >
          {existingSummary ? '编辑' : '+ 写总结'}
        </button>
      </div>

      {/* Week Navigation */}
      <div className="card">
        <div className="flex items-center justify-between">
          <button onClick={() => changeWeek(-1)} className="text-lg hover:opacity-70 px-2" style={{ color: 'var(--color-text)' }}>
            ←
          </button>
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              {currentYear}年 第 {currentWeek} 周
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
              {weekRange.start.getMonth() + 1}月{weekRange.start.getDate()}日 - {weekRange.end.getMonth() + 1}月{weekRange.end.getDate()}日
              {isCurrentWeek && <span className="ml-1" style={{ color: 'var(--color-primary-dark)' }}>· 本周</span>}
            </p>
          </div>
          <button onClick={() => changeWeek(1)} className="text-lg hover:opacity-70 px-2" style={{ color: 'var(--color-text)' }}>
            →
          </button>
        </div>
      </div>

      {/* 本周评分汇总 */}
      {summaries.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text)' }}>💝 本周评分</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--color-primary-light)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>我给自己的评分</p>
              {mySummary?.my_rating ? (
                <>
                  <div className="text-2xl" style={{ color: '#FFD700' }}>
                    {'★'.repeat(mySummary.my_rating)}{'☆'.repeat(5 - mySummary.my_rating)}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text)' }}>
                    {mySummary.my_rating}/5.0
                  </p>
                </>
              ) : (
                <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>未评分</p>
              )}
            </div>
            <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--color-primary-light)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>对方给我的评分</p>
              {partnerSummary?.partner_rating ? (
                <>
                  <div className="text-2xl" style={{ color: '#FFD700' }}>
                    {'★'.repeat(partnerSummary.partner_rating)}{'☆'.repeat(5 - partnerSummary.partner_rating)}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text)' }}>
                    {partnerSummary.partner_rating}/5.0
                  </p>
                </>
              ) : (
                <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>未评分</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summaries Display */}
      <div className="space-y-3">
        {summaries.length === 0 ? (
          <div className="text-center py-12 card">
            <span className="text-4xl block mb-3">📊</span>
            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              本周还没有总结
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 我的总结 */}
            <div className="card" style={{ border: '2px solid var(--color-primary)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" 
                       style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>
                    我
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                    我的总结
                  </span>
                </div>
                {mySummary?.my_rating && (
                  <span className="text-sm" style={{ color: '#FFD700' }}>
                    {'★'.repeat(mySummary.my_rating)}
                  </span>
                )}
              </div>
              {mySummary ? (
                <>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                    {mySummary.content}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px dashed var(--color-primary-light)' }}>
                    <p className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                      {mySummary.updated_at && mySummary.updated_at !== mySummary.created_at 
                        ? `✏️ 已编辑 · ${new Date(mySummary.updated_at).toLocaleString('zh-CN')}`
                        : new Date(mySummary.created_at).toLocaleString('zh-CN')
                      }
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setExistingSummary(mySummary)
                          openCreateModal()
                        }}
                        className="text-xs hover:opacity-70 px-2 py-1 rounded"
                        style={{ color: 'var(--color-primary-dark)', backgroundColor: 'var(--color-primary-light)' }}
                      >
                        ✏️ 编辑
                      </button>
                      <button
                        onClick={() => deleteSummary(mySummary.id)}
                        className="text-xs hover:opacity-70 px-2 py-1 rounded"
                        style={{ color: '#E74C3C', backgroundColor: 'var(--color-primary-light)' }}
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-3">
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                    还没有写总结
                  </p>
                  <button
                    onClick={openCreateModal}
                    className="px-4 py-2 rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    ✍️ 写总结
                  </button>
                </div>
              )}
            </div>

            {/* 对方的总结 */}
            <div className="card" style={{ border: '2px solid var(--color-primary-dark)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" 
                       style={{ backgroundColor: 'var(--color-primary-dark)', color: 'white' }}>
                    宝
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                    宝宝的总结
                  </span>
                </div>
                {partnerSummary?.my_rating && (
                  <span className="text-sm" style={{ color: '#FFD700' }}>
                    {'★'.repeat(partnerSummary.my_rating)}
                  </span>
                )}
              </div>
              {partnerSummary ? (
                <>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
                    {partnerSummary.content}
                  </p>
                  <p className="text-xs mt-2" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                    {nameOf(partnerSummary.author_id)} · {new Date(partnerSummary.created_at).toLocaleString('zh-CN')}
                  </p>
                </>
              ) : (
                <p className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                  宝宝还没有写总结
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="text-center">
        <p className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
          💡 小贴士：每周日晚上写一篇总结，回顾这一周的美好时光
        </p>
      </div>

      {/* 新建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold mb-2" style={{ color: 'var(--color-text)' }}>
              ✍️ 我的周总结
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-light)' }}>
              {currentYear}年 第 {currentWeek} 周
            </p>
            
            {/* 评分部分 */}
            <div className="space-y-3 mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-primary-light)' }}>
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text)' }}>
                  🌟 我这周的表现（给自己打分）
                </label>
                <StarRating value={newRating} onChange={setNewRating} />
              </div>
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text)' }}>
                  💝 宝宝这周的表现（给宝宝打分）
                </label>
                <StarRating value={newPartnerRating} onChange={setNewPartnerRating} />
              </div>
            </div>
            
            <div className="mb-4">
              <label className="text-xs font-bold block mb-1" style={{ color: 'var(--color-text-light)' }}>
                总结内容
              </label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="这周发生了什么？心情如何？想对宝宝说什么？"
                rows={6}
                className="w-full p-3 rounded-lg text-sm resize-none"
                style={{ 
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-text)',
                  border: 'none',
                  outline: 'none'
                }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowModal(false)
                  setNewContent('')
                }}
                className="flex-1 py-2 rounded-lg text-sm font-bold"
                style={{ 
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-text)'
                }}
              >
                取消
              </button>
              <button
                onClick={saveSummary}
                disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
