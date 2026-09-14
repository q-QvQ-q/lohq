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
  const { fetchWithCache, invalidateByPrefix, profileMap } = useDataCache()
  const walletsEnsuredRef = useRef(false)
  
  const nameOf = (id, fallback = '宝宝') => id ? (profileMap[id]?.nickname || fallback) : fallback
  const genderOf = (id) => profileMap[id]?.gender
  
  const [wallets, setWallets] = useState([])
  const [sharedWallet, setSharedWallet] = useState(null)
  const [sharedTransactions, setSharedTransactions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [transactions, setTransactions] = useState([])
  const [walletsLoading, setWalletsLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('expenses')
  
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showFineModal, setShowFineModal] = useState(false)
  const [showRewardModal, setShowRewardModal] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  
  const [newExpense, setNewExpense] = useState({ amount: '', category: 'food', note: '', payer_id: '', expense_date: new Date().toISOString().split('T')[0] })
  const [newFine, setNewFine] = useState({ amount: '', reason: '', from_user_id: '', transaction_date: new Date().toISOString().split('T')[0] })
  const [newReward, setNewReward] = useState({ amount: '', reason: '', to_user_id: '', transaction_date: new Date().toISOString().split('T')[0] })
  const [newDeposit, setNewDeposit] = useState({ amount: '', note: '', transaction_date: new Date().toISOString().split('T')[0] })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    walletsEnsuredRef.current = false
    loadData()
  }, [profile?.id])

  async function loadData() {
    if (!profile?.id) {
      setWalletsLoading(false)
      setDataLoading(false)
      return
    }
    
    // 1. ensureWallets 优先执行（竞态修复：确保钱包存在再加载）
    const ensuredSharedWallet = !walletsEnsuredRef.current ? await ensureWallets() : null
    
    // 2. 并发加载所有数据
    setWalletsLoading(true)
    setDataLoading(true)
    
    try {
      const [walletResult, expenseResult, txResult, sharedWalletResult, sharedTxResult] = await Promise.all([
        fetchWithCache('wallets', async () => {
          const visibleUserIds = [profile.id, profile.partner_id].filter(Boolean)
          const { data } = await supabase
            .from('wallets')
            .select('*')
            .in('user_id', visibleUserIds)
            .order('balance', { ascending: false })
          return data || []
        }),
        fetchWithCache('expenses_recent', async () => {
          const { data } = await supabase
            .from('expenses')
            .select('*')
            .order('expense_date', { ascending: false })
            .limit(50)
          return data || []
        }, { ttl: 30000 }),
        fetchWithCache('transactions_recent', async () => {
          const { data } = await supabase
            .from('wallet_transactions')
            .select('*')
            .order('transaction_date', { ascending: false })
            .limit(50)
          return data || []
        }, { ttl: 30000 }),
        supabase
          .from('couple_wallets')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1),
        supabase
          .from('shared_wallet_transactions')
          .select('*')
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(20)
      ])
      
      setWallets(walletResult)
      setExpenses(expenseResult)
      setTransactions(txResult)
      setSharedWallet(sharedWalletResult.data?.[0] || ensuredSharedWallet || null)
      setSharedTransactions(sharedTxResult.data || [])
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setWalletsLoading(false)
      setDataLoading(false)
    }
  }

  async function ensureWallets() {
    if (!profile?.id) return

    const { data: setupWallet, error: setupError } = await supabase.rpc('ensure_wallet_setup')
    if (!setupError) {
      walletsEnsuredRef.current = true
      return setupWallet
    }

    // Keep the existing two personal wallets usable until the new migration
    // has been run in Supabase.
    console.warn('共同账本尚未初始化:', setupError.message)
    
    // 确保当前用户有钱包
    const { data: existing } = await supabase.from('wallets').select('id').eq('user_id', profile.id)
    if (!existing || existing.length === 0) {
      await supabase.from('wallets').insert({ user_id: profile.id, balance: 0 })
    }
    
    // 如果有伴侣，同时确保伴侣也有钱包
    if (profile?.partner_id) {
      const { data: partnerWallet } = await supabase.from('wallets').select('id').eq('user_id', profile.partner_id)
      if (!partnerWallet || partnerWallet.length === 0) {
        await supabase.from('wallets').insert({ user_id: profile.partner_id, balance: 0 })
      }
    }
    
    walletsEnsuredRef.current = true
    return null
  }

  async function addExpense() {
    if (!profile?.id) {
      alert('请先登录')
      return
    }
    const expenseAmount = parseFloat(newExpense.amount)
    if (!Number.isFinite(expenseAmount) || expenseAmount <= 0 || !newExpense.payer_id) {
      alert('请填写完整信息')
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      if (newExpense.payer_id === 'shared') {
        if (!sharedWallet?.id) throw new Error('共同账本尚未初始化')
        const { error } = await supabase.rpc('adjust_shared_wallet', {
          p_wallet_id: sharedWallet.id,
          p_type: 'expense',
          p_amount: expenseAmount,
          p_note: newExpense.note || null,
          p_transaction_date: newExpense.expense_date,
          p_category: newExpense.category
        })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert({
            amount: expenseAmount,
            category: newExpense.category,
            note: newExpense.note || null,
            payer_id: newExpense.payer_id,
            expense_date: newExpense.expense_date,
            created_by: profile.id
          })
        if (error) throw error
      }
      
      // 后台刷新，不阻塞UI
      invalidateByPrefix('expenses')
      invalidateByPrefix('wallets')
      await loadData()
      
      setNewExpense({ amount: '', category: 'food', note: '', payer_id: '', expense_date: new Date().toISOString().split('T')[0] })
      setShowExpenseModal(false)
    } catch (err) {
      alert('添加失败: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function applyPartnerTransaction(type) {
    const form = type === 'fine' ? newFine : newReward
    const amount = parseFloat(form.amount)
    if (!profile?.partner_id) {
      alert('请先在设置中绑定伴侣')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('请输入正确的金额')
      return
    }
    if (submitting) return

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('apply_partner_wallet_transaction', {
        p_type: type,
        p_amount: amount,
        p_reason: form.reason || null,
        p_transaction_date: form.transaction_date
      })
      if (error) throw error

      invalidateByPrefix('wallets')
      invalidateByPrefix('transactions')
      await loadData()

      if (type === 'fine') {
        setNewFine({ amount: '', reason: '', from_user_id: profile.partner_id, transaction_date: new Date().toISOString().split('T')[0] })
        setShowFineModal(false)
      } else {
        setNewReward({ amount: '', reason: '', to_user_id: profile.partner_id, transaction_date: new Date().toISOString().split('T')[0] })
        setShowRewardModal(false)
      }
    } catch (err) {
      alert('操作失败: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function addFine() {
    await applyPartnerTransaction('fine')
  }

  async function addReward() {
    await applyPartnerTransaction('reward')
  }

  async function addSharedDeposit() {
    const amount = parseFloat(newDeposit.amount)
    if (!sharedWallet?.id) {
      alert('请先绑定伴侣并初始化共同账本')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('请输入正确的金额')
      return
    }
    if (submitting) return

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('adjust_shared_wallet', {
        p_wallet_id: sharedWallet.id,
        p_type: 'deposit',
        p_amount: amount,
        p_note: newDeposit.note || null,
        p_transaction_date: newDeposit.transaction_date,
        p_category: null
      })
      if (error) throw error

      invalidateByPrefix('expenses')
      await loadData()
      setNewDeposit({ amount: '', note: '', transaction_date: new Date().toISOString().split('T')[0] })
      setShowDepositModal(false)
    } catch (err) {
      alert('存入失败: ' + err.message)
    } finally {
      setSubmitting(false)
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
    const name = nameOf(f.from_user_id, '未知')
    finesFromUser[name] = (finesFromUser[name] || 0) + parseFloat(f.amount)
  })

  const individualWallets = [...wallets].sort((a, b) => {
    if (a.user_id === profile?.id) return -1
    if (b.user_id === profile?.id) return 1
    return 0
  })
  const partnerWallet = individualWallets.find(wallet => wallet.user_id === profile?.partner_id)
  const partnerName = nameOf(profile?.partner_id, '对方')

  function openFineModal() {
    if (!profile?.partner_id) {
      alert('请先在设置中绑定伴侣')
      return
    }
    setNewFine(current => ({ ...current, from_user_id: profile.partner_id }))
    setShowFineModal(true)
  }

  function openRewardModal() {
    if (!profile?.partner_id) {
      alert('请先在设置中绑定伴侣')
      return
    }
    setNewReward(current => ({ ...current, to_user_id: profile.partner_id }))
    setShowRewardModal(true)
  }

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

      {/* Wallet Cards - 我的、对方、共同 */}
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
        ) : individualWallets.length > 0 ? (
          individualWallets.map(wallet => (
            <div key={wallet.id} className="card text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-xl">{genderOf(wallet.user_id) === 'female' ? '👧' : '👦'}</span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {wallet.user_id === profile?.id ? '我的' : `${nameOf(wallet.user_id)}的`}
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
        {!walletsLoading && profile?.partner_id && (
          <div className="card text-center col-span-2" style={{ borderColor: 'var(--color-primary)', borderWidth: '1px' }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-xl">🏦</span>
              <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>我们共同的</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: 'var(--color-primary-dark)' }}>
              ¥{Number(sharedWallet?.balance || 0).toFixed(2)}
            </p>
            <p className="text-xs mt-1 mb-3" style={{ color: 'var(--color-text-light)' }}>双方都可以存入，也可以用于共同支出</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowDepositModal(true)}
                className="btn-primary text-xs px-3 py-2"
                disabled={!sharedWallet}
              >
                + 存入
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewExpense(current => ({ ...current, payer_id: 'shared' }))
                  setShowExpenseModal(true)
                }}
                className="btn-secondary text-xs px-3 py-2"
                disabled={!sharedWallet}
              >
                - 共同支出
              </button>
            </div>
          </div>
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

          {sharedTransactions.length > 0 && (
            <div className="card mb-3">
              <h3 className="font-bold mb-2 text-sm" style={{ color: 'var(--color-text)' }}>🏦 共同账本最近流水</h3>
              <div className="space-y-2">
                {sharedTransactions.slice(0, 6).map(transaction => (
                  <div key={transaction.id} className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold" style={{ color: 'var(--color-text)' }}>
                        {transaction.type === 'deposit' ? `${nameOf(transaction.contributor_id)} 存入` : (transaction.note || CATEGORIES[transaction.category]?.label || '共同支出')}
                      </span>
                      <span className="ml-2" style={{ color: 'var(--color-text-light)' }}>
                        {formatDateShort(transaction.transaction_date)}
                      </span>
                    </div>
                    <span className="font-bold" style={{ color: transaction.type === 'deposit' ? '#4CAF50' : '#E74C3C' }}>
                      {transaction.type === 'deposit' ? '+' : '-'}¥{Number(transaction.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
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
                            {expense.shared_wallet_id ? '共同账户' : nameOf(expense.payer_id)} · {formatDateShort(expense.expense_date)}
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
              onClick={openFineModal}
              className="card text-center py-3 hover:shadow-md transition-shadow"
              style={{ borderColor: '#E74C3C', borderWidth: '1px' }}
            >
              <span className="text-2xl block">💢</span>
              <span className="text-xs font-bold" style={{ color: '#E74C3C' }}>记对方罚款</span>
            </button>
            <button
              onClick={openRewardModal}
              className="card text-center py-3 hover:shadow-md transition-shadow"
              style={{ borderColor: 'var(--color-primary)', borderWidth: '1px' }}
            >
              <span className="text-2xl block">🎁</span>
              <span className="text-xs font-bold" style={{ color: 'var(--color-primary-dark)' }}>奖励对方</span>
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
                          {nameOf(tx.from_user_id)} 被罚
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
                          {nameOf(tx.to_user_id)} 获得奖励
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
                            {fines.filter(f => nameOf(f.from_user_id, '未知') === name).length} 次
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
          wallets={individualWallets}
          sharedWallet={sharedWallet}
          newExpense={newExpense}
          setNewExpense={setNewExpense}
          onClose={() => setShowExpenseModal(false)}
          onSubmit={addExpense}
          submitting={submitting}
        />
      )}

      {/* Fine Modal */}
      {showFineModal && (
        <FineModal
          partnerName={partnerName}
          partnerBalance={partnerWallet?.balance}
          newFine={newFine}
          setNewFine={setNewFine}
          onClose={() => setShowFineModal(false)}
          onSubmit={addFine}
          submitting={submitting}
        />
      )}

      {/* Reward Modal */}
      {showRewardModal && (
        <RewardModal
          partnerName={partnerName}
          partnerBalance={partnerWallet?.balance}
          newReward={newReward}
          setNewReward={setNewReward}
          onClose={() => setShowRewardModal(false)}
          onSubmit={addReward}
          submitting={submitting}
        />
      )}

      {showDepositModal && (
        <DepositModal
          newDeposit={newDeposit}
          setNewDeposit={setNewDeposit}
          onClose={() => setShowDepositModal(false)}
          onSubmit={addSharedDeposit}
          submitting={submitting}
        />
      )}
    </div>
  )
}

function ExpenseModal({ wallets, sharedWallet, newExpense, setNewExpense, onClose, onSubmit, submitting }) {
  const { profileMap } = useDataCache()
  const nameOf = (id) => profileMap[id]?.nickname || '宝宝'
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
              <option key={w.id} value={w.user_id}>{nameOf(w.user_id)}</option>
            ))}
            {sharedWallet && <option value="shared">🏦 我们共同的</option>}
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
          <button onClick={onSubmit} className="btn-primary flex-1" disabled={submitting}>
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FineModal({ partnerName, partnerBalance, newFine, setNewFine, onClose, onSubmit, submitting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-md">
        <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
          💢 记一笔罚款
        </h3>
        <div className="space-y-3">
          <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(231, 76, 60, 0.08)', color: 'var(--color-text)' }}>
            将记录到 <strong>{partnerName}</strong> 的账本（当前 ¥{Number(partnerBalance || 0).toFixed(2)}）
          </div>
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
            💡 罚款只从对方账本扣除，不会转入你的账本
          </p>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={onSubmit} className="btn-primary flex-1" disabled={submitting}>
            {submitting ? '执行中...' : '执行'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RewardModal({ partnerName, partnerBalance, newReward, setNewReward, onClose, onSubmit, submitting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-md">
        <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>
          🎁 给一笔奖励
        </h3>
        <div className="space-y-3">
          <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-text)' }}>
            将记录到 <strong>{partnerName}</strong> 的账本（当前 ¥{Number(partnerBalance || 0).toFixed(2)}）
          </div>
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
          <button onClick={onSubmit} className="btn-primary flex-1" disabled={submitting}>
            {submitting ? '执行中...' : '执行'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DepositModal({ newDeposit, setNewDeposit, onClose, onSubmit, submitting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-md">
        <h3 className="font-bold mb-4" style={{ color: 'var(--color-text)' }}>🏦 存入共同账户</h3>
        <div className="space-y-3">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={newDeposit.amount}
            onChange={(e) => setNewDeposit({ ...newDeposit, amount: e.target.value })}
            placeholder="存入金额"
            className="input-field"
            autoFocus
          />
          <input
            type="text"
            value={newDeposit.note}
            onChange={(e) => setNewDeposit({ ...newDeposit, note: e.target.value })}
            placeholder="备注（可选）"
            className="input-field"
          />
          <input
            type="date"
            value={newDeposit.transaction_date}
            onChange={(e) => setNewDeposit({ ...newDeposit, transaction_date: e.target.value })}
            className="input-field"
          />
          <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
            💡 双方都能看到这笔存入和更新后的共同余额
          </p>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={onSubmit} className="btn-primary flex-1" disabled={submitting}>
            {submitting ? '存入中...' : '确认存入'}
          </button>
        </div>
      </div>
    </div>
  )
}
