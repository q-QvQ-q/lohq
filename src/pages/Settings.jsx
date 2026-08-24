import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme, THEMES } from '../contexts/ThemeContext.jsx'
import { supabase } from '../supabase/client.js'

export default function Settings() {
  const navigate = useNavigate()
  const { profile, refreshProfile, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const [startDate, setStartDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [nicknameInput, setNicknameInput] = useState('')
  
  // 伴侣绑定状态
  const [partnerProfile, setPartnerProfile] = useState(null)
  const [bindingStatus, setBindingStatus] = useState('idle') // idle | searching | found | binding | bound
  const [searchEmail, setSearchEmail] = useState('')
  const [searchedUser, setSearchedUser] = useState(null)
  const [binding, setBinding] = useState(false)

  useEffect(() => {
    if (profile?.id) {
      loadSettings()
    }
  }, [profile?.id])

  async function loadSettings() {
    setLoading(true)
    try {
      if (!profile?.id) {
        setLoading(false)
        return
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .single()
      if (error) throw error
      
      if (data) {
        setStartDate(data.love_start_date || '2025-01-29')
        setNicknameInput(data.nickname || '')
        
        // 如果已绑定伴侣，加载伴侣信息
        if (data.partner_id) {
          setBindingStatus('bound')
          
          // 尝试加载伴侣信息
          try {
            const { data: partnerData, error: partnerError } = await supabase
              .from('profiles')
              .select('id, nickname, email, avatar_url, gender')
              .eq('id', data.partner_id)
              .single()
            if (!partnerError && partnerData) {
              setPartnerProfile(partnerData)
            } else {
              // 即使加载失败，也设置一个基本信息
              setPartnerProfile({
                id: data.partner_id,
                nickname: '伴侣',
                email: '已绑定',
                gender: null
              })
            }
          } catch (e) {
            // 加载失败也不影响绑定状态
            setPartnerProfile({
              id: data.partner_id,
              nickname: '伴侣',
              email: '已绑定',
              gender: null
            })
          }
        }
      }
    } catch (err) {
      console.error('加载设置失败:', err)
      alert('加载设置失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveDate() {
    if (!startDate) {
      alert('请选择日期')
      return
    }
    
    if (!profile?.id) {
      alert('请先登录')
      return
    }
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          love_start_date: startDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)
      if (error) throw error
      
      await refreshProfile()
      alert('日期已更新')
    } catch (err) {
      alert('保存失败: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleNicknameBlur() {
    const trimmed = nicknameInput.trim()
    if (!profile?.id) return
    if (trimmed === (profile?.nickname || '')) return
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nickname: trimmed })
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile()
    } catch (err) {
      alert('更新失败: ' + err.message)
    }
  }

  async function handleUpdateProfile(field, value) {
    if (!profile?.id) return
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: value })
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile()
    } catch (err) {
      alert('更新失败: ' + err.message)
    }
  }

  // 搜索伴侣
  async function handleSearchPartner() {
    const email = searchEmail.trim()
    if (!email) {
      alert('请输入邮箱')
      return
    }
    
    setBindingStatus('searching')
    setSearchedUser(null)
    
    try {
      const { data, error } = await supabase
        .rpc('find_profile_by_email', { search_email: email })
      
      if (error) throw error
      
      if (data && data.length > 0) {
        const user = data[0]
        if (user.id === profile.id) {
          alert('这是你自己的账号哦~')
          setBindingStatus('idle')
          return
        }
        if (user.partner_id) {
          alert('该账号已绑定其他伴侣')
          setBindingStatus('idle')
          return
        }
        setSearchedUser(user)
        setBindingStatus('found')
      } else {
        alert('未找到该账号')
        setBindingStatus('idle')
      }
    } catch (err) {
      console.error('搜索失败:', err)
      alert('搜索失败: ' + err.message)
      setBindingStatus('idle')
    }
  }

  // 确认绑定
  async function handleConfirmBind() {
    if (!searchedUser || !profile?.id) return
    
    setBinding(true)
    try {
      const { data, error } = await supabase
        .rpc('bind_partner', {
          p_user_id: profile.id,
          p_partner_email: searchedUser.email,
          p_start_date: null
        })
      
      if (error) throw error
      
      // JSON 返回值: data 是一个 JSON 对象
      // 如果返回的是数组，取第一个元素
      const result = Array.isArray(data) ? data[0] : data
      
      if (result?.success) {
        alert('🎉 绑定成功！')
        await refreshProfile()
        await loadSettings()
        // 重置搜索状态
        setSearchEmail('')
        setSearchedUser(null)
      } else {
        alert(result?.message || '绑定失败')
      }
    } catch (err) {
      console.error('绑定失败:', err)
      alert('绑定失败: ' + err.message)
    } finally {
      setBinding(false)
    }
  }

  // 解绑伴侣
  async function handleUnbind() {
    if (!confirm('确定要解除伴侣绑定吗？此操作将清空双方的绑定关系。')) return
    if (!profile?.id) return
    
    setBinding(true)
    try {
      const { data, error } = await supabase
        .rpc('unbind_partner', { p_user_id: profile.id })
      
      if (error) throw error
      
      // JSON 返回值
      const result = Array.isArray(data) ? data[0] : data
      
      if (result?.success) {
        alert('已解除绑定')
        setBindingStatus('idle')
        setPartnerProfile(null)
        await refreshProfile()
      } else {
        alert(result?.message || '解绑失败')
      }
    } catch (err) {
      console.error('解绑失败:', err)
      alert('解绑失败: ' + err.message)
    } finally {
      setBinding(false)
    }
  }

  // 取消搜索
  function handleCancelSearch() {
    setBindingStatus('idle')
    setSearchEmail('')
    setSearchedUser(null)
  }

  async function exportData() {
    if (!confirm('确定要导出所有数据吗？将生成一个 JSON 文件下载到本地。')) return
    
    try {
      const tables = [
        { name: 'profiles', key: 'profiles' },
        { name: 'anniversaries', key: 'anniversaries' },
        { name: 'knowledge_base', key: 'knowledge_base' },
        { name: 'diaries', key: 'diaries' },
        { name: 'todos', key: 'todos' },
        { name: 'wishes', key: 'wishes' },
        { name: 'albums', key: 'albums' },
        { name: 'photos', key: 'photos' },
        { name: 'wallets', key: 'wallets' },
        { name: 'expenses', key: 'expenses' },
        { name: 'wallet_transactions', key: 'wallet_transactions' },
        { name: 'memos', key: 'memos' },
        { name: 'weekly_summaries', key: 'weekly_summaries' }
      ]
      
      const exported = {
        exportDate: new Date().toISOString(),
        appName: 'LOHQ',
        tables: {}
      }
      
      for (const table of tables) {
        try {
          const { data, error } = await supabase
            .from(table.name)
            .select('*')
          if (!error && data) {
            exported.tables[table.key] = data
          }
        } catch (e) {
          exported.tables[table.key] = []
        }
      }
      
      // 下载 JSON 文件
      const jsonStr = JSON.stringify(exported, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `LOHQ_backup_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      alert('✅ 数据导出成功！文件已下载到本地。')
    } catch (err) {
      alert('导出失败: ' + err.message)
    }
  }

  return (
    <div className="space-y-6">
      {loading && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs flex items-center gap-2"
             style={{ backgroundColor: 'var(--color-primary)', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <span className="animate-spin">⚙️</span> 加载中...
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
          <span>⚙️</span> 设置
        </h1>
        <div style={{ width: '50px' }}></div>
      </div>

      {/* Theme Selection */}
      <div className="card">
        <h2 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>🎨 主题色</h2>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(THEMES).map(([key, data]) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              className={`flex flex-col items-center gap-1 p-2 rounded-input transition-all ${
                theme === key ? 'ring-2' : 'opacity-70 hover:opacity-100'
              }`}
              style={{
                backgroundColor: data.colors.primaryLight,
                '--tw-ring-color': data.colors.primary,
                borderColor: theme === key ? data.colors.primary : 'transparent'
              }}
            >
              <div
                className="w-8 h-8 rounded-full"
                style={{ backgroundColor: data.colors.primary }}
              />
              <span className="text-xs font-bold" style={{ color: data.colors.text }}>
                {data.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Profile Card */}
      <div className="card">
        <h2 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>👤 个人信息</h2>
        <div className="space-y-3">
          <div>
            <label className="label-text">昵称</label>
            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              onBlur={handleNicknameBlur}
              className="input-field"
              placeholder="失焦后自动保存"
            />
          </div>
          <div>
            <label className="label-text">性别</label>
            <div className="flex gap-3">
              <button
                onClick={() => handleUpdateProfile('gender', 'male')}
                className={`flex-1 py-2 rounded-input font-bold transition-all ${
                  profile?.gender === 'male'
                    ? 'ring-2'
                    : 'opacity-70'
                }`}
                style={{
                  backgroundColor: profile?.gender === 'male' ? 'var(--color-primary)' : 'var(--color-primary-light)',
                  color: 'var(--color-text)',
                  borderColor: 'var(--color-primary)'
                }}
              >
                👦 男生
              </button>
              <button
                onClick={() => handleUpdateProfile('gender', 'female')}
                className={`flex-1 py-2 rounded-input font-bold transition-all ${
                  profile?.gender === 'female'
                    ? 'ring-2'
                    : 'opacity-70'
                }`}
                style={{
                  backgroundColor: profile?.gender === 'female' ? 'var(--color-primary)' : 'var(--color-primary-light)',
                  color: 'var(--color-text)',
                  borderColor: 'var(--color-primary)'
                }}
              >
                👧 女生
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 伴侣绑定 */}
      <div className="card">
        <h2 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>💕 伴侣绑定</h2>
        
        {/* 已绑定状态 - 有 partner_id 就显示 */}
        {(profile?.partner_id || bindingStatus === 'bound') && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-primary-light)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl" 
                   style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>
                {partnerProfile?.gender === 'female' ? '👧' : partnerProfile?.gender === 'male' ? '👦' : '💕'}
              </div>
              <div className="flex-1">
                <p className="font-bold" style={{ color: 'var(--color-text)' }}>
                  {partnerProfile?.nickname || '伴侣'}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                  {partnerProfile?.email || '已绑定'}
                </p>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>
                已绑定
              </span>
            </div>
            <button
              onClick={handleUnbind}
              disabled={binding}
              className="w-full py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#E74C3C', color: 'white' }}
            >
              {binding ? '处理中...' : '🔗 解除绑定'}
            </button>
            <p className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
              💡 绑定后，双方可以互相查看所写信息，修改恋爱日期等重要操作需要对方同意
            </p>
          </div>
        )}
        
        {/* 未绑定状态 */}
        {!profile?.partner_id && bindingStatus !== 'bound' && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
              输入对方的邮箱账号进行绑定
            </p>
            
            {/* 搜索框 */}
            <div className="space-y-2">
              <input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && bindingStatus === 'idle' && handleSearchPartner()}
                placeholder="对方邮箱地址"
                className="w-full p-3 rounded-lg text-sm"
                style={{ 
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-text)',
                  border: 'none',
                  outline: 'none'
                }}
                disabled={bindingStatus === 'searching' || bindingStatus === 'binding'}
              />
              <button
                onClick={handleSearchPartner}
                disabled={bindingStatus === 'searching'}
                className="w-full py-3 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {bindingStatus === 'searching' ? '🔍 搜索中...' : '💕 搜索并绑定'}
              </button>
            </div>

            {/* 搜索结果 */}
            {bindingStatus === 'found' && searchedUser && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-primary-light)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" 
                       style={{ backgroundColor: 'var(--color-primary-dark)', color: 'white' }}>
                    {(searchedUser.nickname || '宝')[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                      {searchedUser.nickname || '宝宝'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                      {searchedUser.email}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelSearch}
                    className="flex-1 py-2 rounded-lg text-sm font-bold"
                    style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-text)' }}
                    disabled={binding}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmBind}
                    className="flex-1 py-2 rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                    disabled={binding}
                  >
                    {binding ? '绑定中...' : '💕 确认绑定'}
                  </button>
                </div>
              </div>
            )}

            {/* 提示 */}
            {bindingStatus === 'idle' && (
              <div className="text-center py-3">
                <span className="text-2xl block mb-1">💝</span>
                <p className="text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
                  还没有绑定伴侣
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.5 }}>
                  绑定后可共享更多功能
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Love Date */}
      <div className="card">
        <h2 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>💕 恋爱设置</h2>
        <div>
          <label className="label-text">在一起的日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input-field"
            disabled={bindingStatus === 'bound' && profile?.partner_id}
          />
          {bindingStatus === 'bound' && profile?.partner_id && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)', opacity: 0.6 }}>
              🔒 绑定后修改日期需要对方同意
            </p>
          )}
        </div>
        <button
          onClick={handleSaveDate}
          className="btn-primary w-full mt-4"
          disabled={saving}
        >
          {saving ? '保存中...' : '💾 保存日期'}
        </button>
      </div>

      {/* Data Management */}
      <div className="card">
        <h2 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>📦 数据管理</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-light)' }}>
          导出所有数据为 JSON 文件，用于备份或迁移
        </p>
        <button
          onClick={exportData}
          className="w-full py-3 rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          📥 一键导出所有数据
        </button>
      </div>

      {/* Logout */}
      <div className="card text-center">
        <button
          onClick={async () => {
            await signOut()
          }}
          className="btn-danger"
        >
          退出登录
        </button>
      </div>

      <div className="text-center text-xs" style={{ color: 'var(--color-text-light)', opacity: 0.5 }}>
        LOHQ v0.2.0 · 我们的恋爱小窝
      </div>
    </div>
  )
}
