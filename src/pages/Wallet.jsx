import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDataCache } from '../contexts/DataCacheContext.jsx'
import { formatDateShort } from '../utils/dateUtils.js'

const CATEGORIES = {
  food: { label: '餐饮', emoji: '🍜' },
  transport: { label: '交通', emoji: '🚗' },
  entertainment: { label: '娱乐', emoji: '🎮' },
  shopping: { label: '购物', emoji: '🛍️' },
  accommodation: { label: '住宿', emoji: '🏠' },
  other: { label: '其他', emoji: '📦' }
}

const CATEGORY_COLORS = {
  food: '#F5A623',
  transport: '#4CAF50',
  entertainment: '#9C27B0',
  shopping: '#E91E63',
  accommodation: '#00BCD4',
  other: '#607D8B'
}

export default function Wallet() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { fetchWithCache, invalidateByPrefix } = useDataCache()
  const walletsEnsuredRef = useRef(false)
  
  const [wallets, setWallets] = useState([])
  const [expenses, setExpenses] = useState([])
  const [transactions, setTransactions] = useState([])
  const [walletsLoading, setWalletsLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('expenses')
  
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showFineModal, setShowFineModal] = useState(false)
  const [showRewardModal, setShowRewardModal] = useState(false)
  
  const [newExpense, setNewExpense] = useState({ amount: '', category: 'food', note: '', payer_id: '', expense_date: new Date().toISOString().split('T')[0] })
  const [newFine, setNewFine] = useState({ amount: '', reason: '', from_user_id: '', transaction_date: new Date().toISOString().split('T')[0] })
  const [newReward, setNewReward] = useState({ amount: '', reason: '', to_user_id: '', transaction_date: new Date().toISOString().split('T')[0] })

  useEffect(() => {
    loadData()
  }, [profile?.id])

  async function loadData() {
    if (!profile?.id) {
      setWalletsLoading(false)
      setDataLoading(false)
      return
    }
    
    // 1. ensureWallets 优先执行（竞态修复：确保钱包存在再加载）
    if (!walletsEnsuredRef.current) {
      await ensureWallets()
    }
    
    // 2. 并发加载所有数据
    setWalletsLoading(true)
    setDataLoading(true)
    
    try {
      const [walletResult, expenseResult, txResult] = await Promise.all([
        fetchWithCache('wallets', async () => {
          const { data } = await supabase
            .from('wallets')
            .select('*, user:profiles(nickname, gender)')
            .order('balance', { ascending: false })
          return data || []
        }),
        fetchWithCache('expenses_recent', async () => {
          const { data } = await supabase
            .from('expenses')
            .select('*, payer_profile:profiles(nickname)')
            .order('expense_date', { ascending: false })
            .limit(50)
          return data || []
        }, { ttl: 30000 }),
        fetchWithCache('transactions_recent', async () => {
          const { data } = await supabase
            .from('wallet_transactions')
            .select('*, from_user_profile:profiles(nickname), to_user_profile:profiles(nickname)')
            .order('transaction_date', { ascending: false })
            .limit(50)
          return data || []
        }, { ttl: 30000 })
      ])
      
      setWallets(walletResult)
      setExpenses(expenseResult)
      setTransactions(txResult)
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setWalletsLoading(false)
      setDataLoading(false)
    }
  }

  async function ensureWallets() {
    if (!profile?.id) return
    
    const { data: existing } = await supabase.from('wallets').select('id').eq('user_id', profile.id)
    if (!existing || existing.length === 0) {
      await supabase.from('wallets').insert({ user_id: profile.id, balance: 0 })
    }
    walletsEnsuredRef.current = true
  }

  async function addExpense() {
    if (!newExpense.amount || !newExpense.payer_id) {
      alert('请填写完整信息')
      return
    }
    try {
      // 乐观更新：先在本地插入
      const tempId = 'temp_' + Date.now()
      const newRecord = {
        id: tempId,
        amount: parseFloat(newExpense.amount),
        category: newExpense.category,
        note: newExpense.note || null,
        payer_id: newExpense.payer_id,
        expense_date: newExpense.expense_date,
        created_by: profile.id,
        payer_profile: wallets.find(w => w.user_id === newExpense.payer_id)?.user?.nickname || '宝宝'
      }
      setExpenses(prev => [newRecord, ...prev])
      
      const { error } = await supabase
        .from('expenses')
        .insert({
          amount: parseFloat(newExpense.amount),
          category: newExpense.category,
          note: newExpense.note || null,
          payer_id: newExpense.payer_id,
          expense_date: newExpense.expense_date,
          created_by: profile.id
        })
      if (error) throw error
      
      // 后台刷新，不阻塞UI
      invalidateByPrefix('expenses')
      invalidateByPrefix('wallets')
      loadData()
      
      setNewExpense({ amount: '', category: 'food', note: '', payer_id: '', expense_date: new Date().toISOString().split('T')[0] })
      setShowExpenseModal(false)
    } catch (err) {
      // 回滚乐观更新
      setExpenses(prev => prev.filter(e => !e.id.startsWith('temp_')))
      alert('添加失败: ' + err.message)
    }
  }

  async function addFine() {
    if (!newFine.amount || !newFine.from_user_id) {
      alert('请填写完整信息')
      return
    }
    try {
      const fineAmount = parseFloat(newFine.amount)
      const otherId = wallets.find(w => w.user_id !== newFine.from_user_id)?.user_id
      const fromWallet = wallets.find(w => w.user_id === newFine.from_user_id)
      
      if (!fromWallet) {
        alert('找不到钱包')
        return
      }
      
      // 乐观更新
      const fromNickname = fromWallet.user?.nickname || '宝宝'
      const newTx = {
        id: 'temp_' + Date.now(),
        type: 'fine',
        from_user_id: newFine.from_user_id,
        to_user_id: otherId,
        amount: fineAmount,
        reason: newFine.reason || '犯错罚款',
        transaction_date: newFine.transaction_date,
        created_by: profile.id,
        from_user_profile: { nickname: fromNickname },
        to_user_profile: { nickname: wallets.find(w => w.user_id === otherId)?.user?.nickname || '宝宝' }
      }
      setTransactions(prev => [newTx, ...prev])
      
      // 乐观更新钱包余额
      setWallets(prev => prev.map(w => {
        if (w.user_id === newFine.from_user_id) {
          return { ...w, balance: parseFloat(w.balance) - fineAmount }
        }
        if (w.user_id === otherId) {
          return { ...w, balance: parseFloat(w.balance) + fineAmount }
        }
        return w
      }))
      
      const { error: txError } = await supabase
        .from('wallet_transactions')
        .insert({
          type: 'fine',
          from_user_id: newFine.from_user_id,
          to_user_id: otherId,
          amount: fineAmount,
          reason: newFine.reason || '犯错罚款',
          transaction_date: newFine.transaction_date,
          created_by: profile.id
        })
      if (txError) throw txError
      
      // 更新犯错方钱包
      const newFromBalance = parseFloat(fromWallet.balance) - fineAmount
      const { error: fromError } = await supabase
        .from('wallets')
        .update({ balance: newFromBalance, updated_at: new Date().toISOString() })
        .eq('user_id', newFine.from_user_id)
      if (fromError) throw fromError
      
      if (otherId) {
        const toWallet = wallets.find(w => w.user_id === otherId)
        const newToBalance = parseFloat(toWallet?.balance || 0) + fineAmount
        const { error: toError } = await supabase
          .from('wallets')
          .update({ balance: newToBalance, updated_at: new Date().toISOString() })
          .eq('user_id', otherId)
        if (toError) throw toError
      }
      
      // 后台刷新
      invalidateByPrefix('wallets')
      invalidateByPrefix('transactions')
      loadData()
      
      setNewFine({ amount: '', reason: '', from_user_id: '', transaction_date: new Date().toISOString().split('T')[0] })
      setShowFineModal(false)
    } catch (err) {
      // 回滚乐观更新
      setTransactions(prev => prev.filter(t => !t.id.startsWith('temp_')))
      invalidateByPrefix('wallets')
      invalidateByPrefix('transactions')
      loadData()
      alert('操作失败: ' + err.message)
    }
  }

  async function addReward() {
    if (!newReward.amount || !newReward.to_user_id) {
      alert('请填写完整信息')
      return
    }
    try {
      const rewardAmount = parseFloat(newReward.amount)
      const toWallet = wallets.find(w => w.user_id === newReward.to_user_id)
      
      if (!toWallet) {
        alert('找不到钱包')
        return
      }
      
      const toNickname = toWallet.user?.nickname || '宝宝'
      const fromNickname = wallets.find(w => w.user_id === profile.id)?.user?.nickname || '宝宝'
      
      // 乐观更新
      const newTx = {
        id: 'temp_' + Date.now(),
        type: 'reward',
        from_user_id: profile.id,
        to_user_id: newReward.to_user_id,
        amount: rewardAmount,
        reason: newReward.reason || '表现奖励',
        transaction_date: newReward.transaction_date,
        created_by: profile.id,
        from_user_profile: { nickname: fromNickname },
        to_user_profile: { nickname: toNickname }
      }
      setTransactions(prev => [newTx, ...prev])
      setWallets(prev => prev.map(w => 
        w.user_id === newReward.to_user_id 
          ? { ...w, balance: parseFloat(w.balance) + rewardAmount }
          : w
      ))
      
      const { error: txError } = await supabase
        .from('wallet_transactions')
        .insert({
          type: 'reward',
          from_user_id: profile.id,
          to_user_id: newReward.to_user_id,
          amount: rewardAmount,
          reason: newReward.reason || '表现奖励',
          transaction_date: newReward.transaction_date,
          created_by: profile.id
        })
      if (txError) throw txError
      
      const newBalance = parseFloat(toWallet.balance) + rewardAmount
      const { error: toError } = await supabase
        .from('wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('user_id', newReward.to_user_id)
      if (toError) throw toError
      
      // 后台刷新
      invalidateByPrefix('wallets')
      invalidateByPrefix('transactions')
      loadData()
      
      setNewReward({ amount: '', reason: '', to_user_id: '', transaction_date: new Date().toISOString().split('T')[0] })
      setShowRewardModal(false)
    } catch (err) {
      setTransactions(prev => prev.filter(t => !t.id.startsWith('temp_')))
      invalidateByPrefix('wallets')
      invalidateByPrefix('transactions')
      loadData()
      alert('操作失败: ' + err.message)
    }
  }

  const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  const fines = transactions.filter(t => t.type === 'fine')
  const rewards = transactions.filter(t => t.type === 'reward')

  // 统计数据计算
  const expenseByCategory = {}
  expenses.forEach(e => {
    const cat = e.category || 'other'
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + parseFloat(e.amount)
  })
  const categoryStats = Object.entries(expenseByCategory)
    .map(([cat, amount]) => ({
      cat,
      amount,
      percentage: totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : 0,
      ...CATEGORIES[cat]
    }))
    .sort((a, b) => b.amount - a.amount)

  const totalFines = fines.reduce((sum, t) => sum + parseFloat(t.amount), 0)
  const totalRewards = rewards.reduce((sum, t) => sum + parseFloat(t.amount), 0)
  const finesFromUser = {}
  fines.forEach(f => {
    const name = f.from_user_profile?.nickname || '未知'
    finesFromUser[name] = (finesFromUser[name] || 0) + parseFloat(f.amount)
  })

  return (
    <div className="space-y-4">
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
          <span>💰</span> 恋爱账本
        </h1>
        <div style={{ width: '50px' }}></div>
      </div>

      {/* Wallet Cards - 双人余额（单独加载状态） */}
      <div className="grid grid-cols-2 gap-3">
        {walletsLoading ? (
          <>
            <div className="card text-center animate-pulse">
              <div className="h-4 w-16 mx-auto rounded mb-2" style={{ backgroundColor: 'var(--color-primary-light)' }}></div>
              <div className="h-6 w-20 mx-auto rounded" style={{ backgroundColor: 'var(--color-primary-light)' }}></div>
            </div>
            <div className="card text-center animate-pulse">
              <div className="h-4 w-16 mx-auto rounded mb-2" style={{ backgroundColor: 'var(--color-primary-light)' }}></div>
              <div className="h-6 w-20 mx-auto rounded" style={{ backgroundColor: 'var(--color-primary-light)' }}></div>
            </div>
          </>
        ) : wallets.length > 0 ? (
          wallets.map(wallet => (
            <div key={wallet.id} className="card text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-xl">{wallet.user?.gender === 'female' ? '👧' : '👦'}</span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {wallet.user?.nickname || '宝宝'}
                </span>
              </div>
              <p className="text-2xl font-bold" style={{ color: wallet.balance >= 0 ? 'var(--color-primary-dark)' : '#E74C3C' }}>
                ¥{wallet.balance}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>钱包余额</p>
            </div>
          ))
        ) : (
          <>
            <div className="card text-center">
              <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>你</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--color-primary-dark)' }}>¥0</p>
            </div>
            <div className="card text-center">
              <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>对方</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--color-primary-dark)' }}>¥0</p>
            </div>
          </>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--color-primary-light)' }}>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'expenses' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'expenses' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          💸 支出
        </button>
        <button
          onClick={() => setActiveTab('rewards')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'rewards' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'rewards' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          🎁 奖惩
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'stats' ? '' : 'opacity-60'
          }`}
          style={{
            backgroundColor: activeTab === 'stats' ? 'white' : 'transparent',
            color: 'var(--color-text)'
          }}
        >
          📊 统计
        </button>
      </div>

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div>
          {/* Action Button */}
          <button
            onClick={() => setShowExpenseModal(true)}
            className="w-full btn-primary text-sm mb-3"
          >
            + 记一笔支出
          </button>
          
          {/* Summary Card */}
          <div className="card mb-3">
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>本月总支出</span>
              <span className="text-xl font-bold" style={{ color: 'var(--color-primary-dark)' }}>
                ¥{totalExpense.toFixed(2)}
              </span>
            </div>
          </div>
          
          {/* Expenses List */}
          <h3 className="font-bold mb-2 text-sm" style={{ color: 'var(--color-text)' }}>支出记录</h3>
          {dataLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="card animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: 'var(--color-primary-light)' }}></div>
                      <div>
                        <div className="h-3 w-24 rounded mb-1" style={{ backgroundColor: 'var(--color-primary-light)' }}></div>
                        <div className="h-2 w-16 rounded" style={{ backgroundColor: 'var(--color-primary-light)' }}></div>
                      </div>
                    </div>
                    <div className="h-4 w-12 rounded" style={{ backgroundColor: 'var(--color-primary-light)' }}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="card text-center py-8">
              <span className="text-3xl block mb-2">💰</span>
              <p style={{ color: 'var(--color-text-light)' }}>还没有支出记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map(expense => {
                const cat = CATEGORIES[expense.category] || CATEGORIES.other
                return (
                  <div key={expense.id} className="card card-hover">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{cat.emoji}</span>
                        <div>
                          <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                            {expense.note || cat.label}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                            {expense.payer_profile?.nickname || '宝宝'} · {formatDateShort(expense.expense_date)}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold" style={{ color: 'var(--color-primary-dark)' }}>
                        -¥{expense.amount}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Rewards Tab */}
      {activeTab === 'rewards' && (
        <div>
          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => setShowFineModal(true)}
              className="card text-center py-3 hover:shadow-md transition-shadow"
              style={{ borderColor: '#E74C3C', borderWidth: '1px' }}
            >
              <span className="text-2xl block">💢</span>
              <span className="text-xs font-bold" style={{ color: '#E74C3C' }}>记罚款</span>
            </button>
            <button
              onClick={() => setShowRewardModal(true)}
              className="card text-center py-3 hover:shadow-md transition-shadow"
              style={{ borderColor: 'var(--color-primary)', borderWidth: '1px' }}
            >
              <span className="text-2xl block">🎁</span>
              <span className="text-xs font-bold" style={{ color: 'var(--color-primary-dark)' }}>给奖励</span>
            </button>
          </div>

          {/* Fines Section */}
          <h3 className="font-bold mb-2 text-sm" style={{ color: 'var(--color-text)' }}>💢 罚款记录</h3>
          {fines.length === 0 ? (
            <div className="card text-center py-6 mb-3">
              <span className="text-2xl block mb-1">😊</span>
              <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>还没有罚款记录</p>
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {fines.map(tx => (
                <div key={tx.id} className="card" style={{ borderLeft: '4px solid #E74C3C' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>💢</span>
                      <div>
                        <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                          {tx.from_user_profile?.nickname} 被罚
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                          {tx.reason}
                        </p>
                      </div>
                    </div>
                    <span className="font-bold" style={{ color: '#E74C3C' }}>-¥{tx.amount}</span>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--color-text-light)' }}>
                    {formatDateShort(tx.transaction_date)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Rewards Section */}
          <h3 className="font-bold mb-2 text-sm" style={{ color: 'var(--color-text)' }}>🎁 奖励记录</h3>
          {rewards.length === 0 ? (
            <div className="card text-center py-6">
              <span className="text-2xl block mb-1">✨</span>
              <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>还没有奖励记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rewards.map(tx => (
                <div key={tx.id} className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>🎁</span>
                      <div>
                        <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                          {tx.to_user_profile?.nickname} 获得奖励
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                          {tx.reason}
                        </p>
                      </div>
                    </div>
                    <span className="font-bold" style={{ color: 'var(--color-primary-dark)' }}>+¥{tx.amount}</span>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--color-text-light)' }}>
                    {formatDateShort(tx.transaction_date)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-4 animate-fade-in">
          {/* Expense Category Breakdown */}
          <div className="card">
            <h3 className="font-bold mb-3 text-sm flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <span>📊</span> 支出分类占比
            </h3>
            {categoryStats.length === 0 ? (
              <div className="text-center py-4">
                <span className="text-2xl block mb-1">📈</span>
                <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>还没有支出数据</p>
              </div>
            ) : (
              <div className="space-y-3">
                {categoryStats.map(s => (
                  <div key={s.cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--color-text)' }}>
                        <span>{s.emoji}</span> {s.label}
                      </span>
                      <span className="text-xs font-bold" style={{ color: 'var(--color-primary-dark)' }}>
                        ¥{s.amount.toFixed(2)} ({s.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-primary-light)' }}>
                      <div 
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ 
                          width: `${s.percentage}%`,
                          backgroundColor: CATEGORY_COLORS[s.cat] || 'var(--color-primary)',
                          transition: 'width 0.7s ease-out'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fine Statistics */}
          <div className="card">
            <h3 className="font-bold mb-3 text-sm flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <span>💢</span> 罚款统计
            </h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center p-2 rounded-xl" style={{ backgroundColor: 'rgba(231, 76, 60, 0.1)' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>罚款总额</p>
                <p className="text-lg font-bold" style={{ color: '#E74C3C' }}>¥{totalFines.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 rounded-xl" style={{ backgroundColor: 'var(--color-primary-light)' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>奖励总额</p>
                <p className="text-lg font-bold" style={{ color: 'var(--color-primary-dark)' }}>¥{totalRewards.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 rounded-xl" style={{ backgroundColor: totalFines > totalRewards ? 'rgba(231, 76, 60, 0.1)' : 'rgba(76, 175, 80, 0.1)' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>净额</p>
                <p className="text-lg font-bold" style={{ color: totalFines > totalRewards ? '#E74C3C' : '#4CAF50' }}>
                  ¥{(totalFines - totalRewards).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Fines by person */}
            {fines.length > 0 && (
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-text-light)' }}>
                  被罚排行
                </p>
                <div className="space-y-2">
                  {Object.entries(finesFromUser)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, amount], idx) => (
                      <div key={name} className="flex items-center justify-between p-2 rounded-lg" 
                           style={{ backgroundColor: 'rgba(231, 76, 60, 0.08)' }}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                          </span>
                          <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                            {fines.filter(f => f.from_user_profile?.nickname === name).length} 次
                          </span>
                          <span className="text-sm font-bold" style={{ color: '#E74C3C' }}>¥{amount.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Fines Reasons */}
            {fines.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-text-light)' }}>
                  罚款原因TOP
                </p>
                <div className="space-y-1">
                  {Object.entries(
                    fines.reduce((acc, f) => {
                      const r = f.reason || '未说明'
                      acc[r] = (acc[r] || 0) + parseFloat(f.amount)
                      return acc
                    }, {})
                  )
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([reason, amount], idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded"
                           style={{ backgroundColor: 'rgba(231, 76, 60, 0.05)' }}>
                        <span style={{ color: 'var(--color-text)' }}>💢 {reason}</span>
                        <span className="font-bold" style={{ color: '#E74C3C' }}>¥{amount.toFixed(2)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <ExpenseModal
          wallets={wallets}
          newExpense={newExpense}
          setNewExpense={setNewExpense}
          onClose={() => setShowExpenseModal(false)}
          onSubmit={addExpense}
        />
      )}

      {/* Fine Modal */}
      {showFineModal && (
        <FineModal
          wallets={wallets}
          newFine={newFine}
          setNewFine={setNewFine}
          onClose={() => setShowFineModal(false)}
          onSubmit={addFine}
        />
      )}

      {/* Reward Modal */}
      {showRewardModal && (
        <RewardModal
          wallets={wallets}
          newReward={newReward}
          setNewReward={setNewReward}
          onClose={() => setShowRewardModal(false)}
          onSubmit={addReward}
        />
      )}
    </div>
  )
}

function ExpenseModal({ wallets, newExpense, setNewExpense, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-md">
        <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
          💸 记一笔支出
        </h3>
        <div className="space-y-3">
          <input
            type="number"
            value={newExpense.amount}
            onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
            placeholder="金额"
            className="input-field"
            autoFocus
          />
          <select
            value={newExpense.category}
            onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
            className="input-field"
          >
            {Object.entries(CATEGORIES).map(([key, val]) => (
              <option key={key} value={key}>{val.emoji} {val.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={newExpense.note}
            onChange={(e) => setNewExpense({ ...newExpense, note: e.target.value })}
            placeholder="备注（可选）"
            className="input-field"
          />
          <select
            value={newExpense.payer_id}
            onChange={(e) => setNewExpense({ ...newExpense, payer_id: e.target.value })}
            className="input-field"
          >
            <option value="">谁付的钱？</option>
            {wallets.map(w => (
              <option key={w.id} value={w.user_id}>{w.user?.nickname}</option>
            ))}
          </select>
          <input
            type="date"
            value={newExpense.expense_date}
            onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
            className="input-field"
          />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={onSubmit} className="btn-primary flex-1">保存</button>
        </div>
      </div>
    </div>
  )
}

function FineModal({ wallets, newFine, setNewFine, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-md">
        <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
          💢 记一笔罚款
        </h3>
        <div className="space-y-3">
          <select
            value={newFine.from_user_id}
            onChange={(e) => setNewFine({ ...newFine, from_user_id: e.target.value })}
            className="input-field"
          >
            <option value="">谁犯错了？</option>
            {wallets.map(w => (
              <option key={w.id} value={w.user_id}>{w.user?.nickname}</option>
            ))}
          </select>
          <input
            type="number"
            value={newFine.amount}
            onChange={(e) => setNewFine({ ...newFine, amount: e.target.value })}
            placeholder="罚款金额"
            className="input-field"
            autoFocus
          />
          <input
            type="text"
            value={newFine.reason}
            onChange={(e) => setNewFine({ ...newFine, reason: e.target.value })}
            placeholder="犯错原因（如：吵架冷战、迟到）"
            className="input-field"
          />
          <input
            type="date"
            value={newFine.transaction_date}
            onChange={(e) => setNewFine({ ...newFine, transaction_date: e.target.value })}
            className="input-field"
          />
          <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
            💡 罚款将自动从犯错方钱包扣除，加到对方钱包
          </p>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={onSubmit} className="btn-primary flex-1">执行</button>
        </div>
      </div>
    </div>
  )
}

function RewardModal({ wallets, newReward, setNewReward, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-md">
        <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
          🎁 给一笔奖励
        </h3>
        <div className="space-y-3">
          <select
            value={newReward.to_user_id}
            onChange={(e) => setNewReward({ ...newReward, to_user_id: e.target.value })}
            className="input-field"
          >
            <option value="">奖励给谁？</option>
            {wallets.map(w => (
              <option key={w.id} value={w.user_id}>{w.user?.nickname}</option>
            ))}
          </select>
          <input
            type="number"
            value={newReward.amount}
            onChange={(e) => setNewReward({ ...newReward, amount: e.target.value })}
            placeholder="奖励金额"
            className="input-field"
            autoFocus
          />
          <input
            type="text"
            value={newReward.reason}
            onChange={(e) => setNewReward({ ...newReward, reason: e.target.value })}
            placeholder="奖励原因（如：表现好、做家务）"
            className="input-field"
          />
          <input
            type="date"
            value={newReward.transaction_date}
            onChange={(e) => setNewReward({ ...newReward, transaction_date: e.target.value })}
            className="input-field"
          />
          <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
            💡 奖励将直接加到对方钱包余额
          </p>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={onSubmit} className="btn-primary flex-1">执行</button>
        </div>
      </div>
    </div>
  )
}