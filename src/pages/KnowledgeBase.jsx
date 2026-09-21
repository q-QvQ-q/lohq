import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import Icon from '../components/Icon.jsx'

export default function KnowledgeBase() {
  const navigate = useNavigate()
  const { fetchWithCache, invalidateByPrefix } = useDataCache()
  const [items, setItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const data = await fetchWithCache('knowledge_base', async () => {
        const { data } = await supabase
          .from('knowledge_base')
          .select('*')
          .order('updated_at', { ascending: false })
        return data || []
      })
      setItems(data)
    } catch (err) {
      console.error('加载知识库失败:', err)
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // 提取所有可用的标签
  const allTags = useMemo(() => {
    const tags = new Set()
    items.forEach((item) => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach((tag) => tags.add(tag))
      }
    })
    return Array.from(tags).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 标签筛选
      if (selectedTag) {
        if (!item.tags || !item.tags.includes(selectedTag)) return false
      }
      // 搜索
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const matchTitle = item.title && item.title.toLowerCase().includes(query)
        const matchContent =
          (item.content_male && item.content_male.toLowerCase().includes(query)) ||
          (item.content_female && item.content_female.toLowerCase().includes(query))
        const matchTags = item.tags && item.tags.some((t) => t.toLowerCase().includes(query))
        if (!matchTitle && !matchContent && !matchTags) return false
      }
      return true
    })
  }, [items, searchQuery, selectedTag])

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <button
          onClick={() => navigate(-1)}
          className="justify-self-start flex items-center gap-1 text-sm font-bold hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text)' }}
        >
          <span>←</span> 返回
        </button>
        <h1 className="page-title justify-self-center" style={{ marginBottom: 0 }}>
          <Icon name="book" size={21} /> 错题本
        </h1>
        <div aria-hidden="true" />
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTag('')}
            className={`tag cursor-pointer transition-colors ${!selectedTag ? 'is-selected' : ''}`}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag === selectedTag ? '' : tag)}
              className={`tag cursor-pointer transition-colors ${tag === selectedTag ? 'is-selected' : ''}`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <span
          className="absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--color-text-light)' }}
        >
          <Icon name="search" size={18} />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field pl-10"
          placeholder="搜索标题或标签，如：冷战、吃醋、吵架..."
        />
      </div>

      {/* Items List */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-light)' }}>
          加载中...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card text-center py-12">
          <Icon name="book" size={30} className="mx-auto mb-3" />
          <p style={{ color: 'var(--color-text-light)' }}>
            {searchQuery || selectedTag ? '没有找到匹配的条目' : '还没有错题条目哦~'}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.7 }}>
            {searchQuery || selectedTag ? '换个关键词试试' : '点击右下角按钮添加第一条'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <Link
              key={item.id}
              to={`/knowledge/${item.id}`}
              className="card block hover:shadow-soft transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {item.tags && item.tags.slice(0, 3).map((tag, i) => (
                      <span
                        key={i}
                        className="tag"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <h3 className="font-bold truncate" style={{ color: 'var(--color-text)' }}>
                    {item.title}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
                    {item.updated_at ? new Date(item.updated_at).toLocaleDateString('zh-CN') : ''}
                  </p>
                </div>
                <span className="ml-2" style={{ color: 'var(--color-text-light)' }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Floating Add Button */}
      <Link to="/knowledge/new" className="fab">
        <span className="text-2xl">＋</span>
      </Link>
    </div>
  )
}
