import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import Icon from '../components/Icon.jsx'
import ProfileAvatar from '../components/ProfileAvatar.jsx'
import { DailyEmpty, DailyModal, DailyPageHeader, DailyToast, FormField } from '../components/DailyUI.jsx'

const CATEGORY_META = {
  all: { label: '全部', icon: 'shop' },
  food: { label: '吃喝', icon: 'utensils' },
  company: { label: '陪伴', icon: 'heart' },
  care: { label: '关怀', icon: 'sparkle' },
  chores: { label: '家务', icon: 'home' },
  fun: { label: '娱乐', icon: 'gift' },
  other: { label: '其他', icon: 'star' }
}

const PREVIEW = {
  accounts: [
    { id: 'a-me', user_id: 'preview-me', balance: 68 },
    { id: 'a-partner', user_id: 'preview-partner', balance: 42 }
  ],
  categories: Object.entries(CATEGORY_META).filter(([key]) => key !== 'all').map(([slug, meta], index) => ({ id: slug, slug, name: meta.label, sort_order: index })),
  items: [
    { id: 'milk-tea', name: '投喂一杯奶茶', description: '口味任选，今天也要甜甜的', price: 18, category_slug: 'food', provider_id: 'preview-partner', status: 'active' },
    { id: 'walk', name: '晚饭后散步', description: '放下手机，一起走满三十分钟', price: 12, category_slug: 'company', provider_id: 'preview-partner', status: 'active' },
    { id: 'massage', name: '肩颈按摩十分钟', description: '今日限定的放松服务', price: 25, category_slug: 'care', provider_id: 'preview-partner', status: 'active' },
    { id: 'choice', name: '今晚电影选择权', description: '片单由你定，不许偷偷睡着', price: 30, category_slug: 'fun', provider_id: 'preview-partner', status: 'active' }
  ],
  requests: [
    { id: 'request-1', requester_id: 'preview-partner', beneficiary_id: 'preview-partner', amount: 15, reason: '这周主动洗了两次碗', status: 'pending', created_at: new Date().toISOString() }
  ],
  orders: [
    { id: 'order-1', item_name: '周末早餐叫醒服务', price: 20, buyer_id: 'preview-partner', provider_id: 'preview-me', status: 'pending', note: '想吃溏心蛋', created_at: new Date(Date.now() - 3600000).toISOString() }
  ]
}

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function SweetShop({ preview = false }) {
  const { profile: authProfile, partnerProfile: authPartner } = useAuth()
  const profile = preview ? { id: 'preview-me', nickname: '小蓝' } : authProfile
  const partnerProfile = preview ? { id: 'preview-partner', nickname: '小樱' } : authPartner
  const [spaceId, setSpaceId] = useState(preview ? 'preview-space' : null)
  const [accounts, setAccounts] = useState(preview ? PREVIEW.accounts : [])
  const [categories, setCategories] = useState(preview ? PREVIEW.categories : [])
  const [items, setItems] = useState(preview ? PREVIEW.items : [])
  const [requests, setRequests] = useState(preview ? PREVIEW.requests : [])
  const [orders, setOrders] = useState(preview ? PREVIEW.orders : [])
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeView, setActiveView] = useState('menu')
  const [modal, setModal] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(!preview)
  const [pageError, setPageError] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [coinForm, setCoinForm] = useState({ beneficiary_id: profile?.id || '', amount: '', reason: '' })
  const [itemForm, setItemForm] = useState({ name: '', description: '', price: '', category_slug: 'food', provider_id: partnerProfile?.id || '' })

  useEffect(() => {
    if (!preview && profile?.id) initialise()
  }, [preview, profile?.id, partnerProfile?.id])

  useEffect(() => {
    setCoinForm(current => ({ ...current, beneficiary_id: current.beneficiary_id || profile?.id || '' }))
    setItemForm(current => ({ ...current, provider_id: current.provider_id || partnerProfile?.id || profile?.id || '' }))
  }, [profile?.id, partnerProfile?.id])

  async function initialise() {
    setLoading(true)
    setPageError('')
    const { data, error } = await supabase.rpc('ensure_daily_couple_space')
    if (error) {
      setPageError('功能数据尚未同步。你仍可以先查看本地展示版。')
      setLoading(false)
      return
    }
    setSpaceId(data)
    await loadShop(data)
    setLoading(false)
  }

  async function loadShop(id = spaceId) {
    if (!id) return
    const [accountResult, categoryResult, itemResult, requestResult, orderResult] = await Promise.all([
      supabase.from('sweet_coin_accounts').select('*').eq('space_id', id),
      supabase.from('shop_categories').select('*').eq('space_id', id).eq('is_active', true).order('sort_order'),
      supabase.from('shop_items').select('*').eq('space_id', id).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('sweet_coin_requests').select('*').eq('space_id', id).order('created_at', { ascending: false }),
      supabase.from('shop_orders').select('*').eq('space_id', id).order('created_at', { ascending: false })
    ])
    const firstError = [accountResult, categoryResult, itemResult, requestResult, orderResult].find(result => result.error)?.error
    if (firstError) {
      setPageError('加载小店失败，请稍后重试。')
      return
    }
    setAccounts(accountResult.data || [])
    setCategories(categoryResult.data || [])
    setItems(itemResult.data || [])
    setRequests(requestResult.data || [])
    setOrders(orderResult.data || [])
  }

  const myBalance = Number(accounts.find(account => account.user_id === profile?.id)?.balance || 0)
  const partnerBalance = Number(accounts.find(account => account.user_id === partnerProfile?.id)?.balance || 0)
  const visibleItems = useMemo(() => items.filter(item => activeCategory === 'all' || item.category_slug === activeCategory), [items, activeCategory])
  const pendingRequests = requests.filter(request => request.status === 'pending' && request.requester_id !== profile?.id)
  const actionableOrders = orders.filter(order => order.provider_id === profile?.id && ['pending', 'accepted'].includes(order.status))

  const showToast = (message, tone = 'success') => setToast({ message, tone })

  function personName(id) {
    return id === profile?.id ? (profile?.nickname || '我') : (partnerProfile?.nickname || 'TA')
  }

  async function submitCoinRequest(event) {
    event.preventDefault()
    const amount = Number.parseInt(coinForm.amount, 10)
    if (!amount || amount < 1 || !coinForm.reason.trim()) return showToast('请填写有效数量和加币理由', 'error')
    if (preview) {
      setRequests(current => [{ id: `request-${Date.now()}`, requester_id: profile.id, beneficiary_id: coinForm.beneficiary_id, amount, reason: coinForm.reason.trim(), status: 'pending', created_at: new Date().toISOString() }, ...current])
    } else {
      const { error } = await supabase.from('sweet_coin_requests').insert({ space_id: spaceId, requester_id: profile.id, beneficiary_id: coinForm.beneficiary_id, amount, reason: coinForm.reason.trim() })
      if (error) return showToast('申请提交失败，请稍后重试', 'error')
      await loadShop()
    }
    setCoinForm({ beneficiary_id: profile.id, amount: '', reason: '' })
    setModal(null)
    showToast('加币申请已交给 TA 确认')
  }

  async function reviewRequest(request, decision) {
    if (preview) {
      setRequests(current => current.map(item => item.id === request.id ? { ...item, status: decision } : item))
      if (decision === 'approved') setAccounts(current => current.map(account => account.user_id === request.beneficiary_id ? { ...account, balance: Number(account.balance) + Number(request.amount) } : account))
    } else {
      const { error } = await supabase.rpc('review_sweet_coin_request', { p_request_id: request.id, p_decision: decision, p_note: null })
      if (error) return showToast('处理失败，请稍后重试', 'error')
      await loadShop()
    }
    showToast(decision === 'approved' ? '已同意，甜心币到账啦' : '已拒绝这次申请')
  }

  async function submitItem(event) {
    event.preventDefault()
    const price = Number.parseInt(itemForm.price, 10)
    if (!itemForm.name.trim() || !price || price < 1) return showToast('请填写商品名称和有效价格', 'error')
    const next = { id: `item-${Date.now()}`, ...itemForm, name: itemForm.name.trim(), description: itemForm.description.trim(), price, status: 'active' }
    if (preview) setItems(current => [next, ...current])
    else {
      const { error } = await supabase.from('shop_items').insert({ ...next, id: undefined, space_id: spaceId, created_by: profile.id })
      if (error) return showToast('商品上架失败，请稍后重试', 'error')
      await loadShop()
    }
    setItemForm({ name: '', description: '', price: '', category_slug: 'food', provider_id: partnerProfile?.id || profile.id })
    setModal(null)
    showToast('新商品已经摆上货架')
  }

  async function placeOrder(event) {
    event.preventDefault()
    if (!selectedItem || myBalance < Number(selectedItem.price)) return showToast('甜心币余额不足', 'error')
    if (preview) {
      setAccounts(current => current.map(account => account.user_id === profile.id ? { ...account, balance: Number(account.balance) - Number(selectedItem.price) } : account))
      setOrders(current => [{ id: `order-${Date.now()}`, item_id: selectedItem.id, item_name: selectedItem.name, price: Number(selectedItem.price), buyer_id: profile.id, provider_id: selectedItem.provider_id, status: 'pending', note: orderNote.trim(), created_at: new Date().toISOString() }, ...current])
    } else {
      const { error } = await supabase.rpc('place_shop_order', { p_item_id: selectedItem.id, p_note: orderNote.trim() || null })
      if (error) return showToast(error.message?.includes('balance') ? '甜心币余额不足' : '点单失败，请稍后重试', 'error')
      await loadShop()
    }
    setModal(null)
    setOrderNote('')
    showToast('点单成功，已经通知 TA')
  }

  async function updateOrder(order, status) {
    if (preview) {
      setOrders(current => current.map(item => item.id === order.id ? { ...item, status } : item))
      if (['rejected', 'cancelled'].includes(status)) setAccounts(current => current.map(account => account.user_id === order.buyer_id ? { ...account, balance: Number(account.balance) + Number(order.price) } : account))
    } else {
      const { error } = await supabase.rpc('update_shop_order_status', { p_order_id: order.id, p_status: status })
      if (error) return showToast('订单更新失败，请稍后重试', 'error')
      await loadShop()
    }
    showToast(status === 'accepted' ? '接单啦，记得完成约定' : status === 'completed' ? '订单已完成' : '订单已取消，甜心币已退回')
  }

  function openOrder(item) {
    setSelectedItem(item)
    setOrderNote('')
    setModal('order')
  }

  return (
    <div className="daily-page shop-page animate-fade-in">
      <DailyPageHeader icon="shop" title="情侣点单小店" action="上架" actionIcon="plus" onAction={() => setModal('item')} />
      {loading && <div className="daily-loading"><Icon name="coin" />正在打开小店…</div>}
      {pageError && <div className="daily-inline-note is-warning"><Icon name="info" />{pageError}</div>}

      <section className="shop-counter" aria-label="双方甜心币余额">
        <div className="shop-counter__copy">
          <span className="shop-counter__open"><i /> 今日营业中</span>
          <h2>积累金币，解锁更多心仪权益</h2>
          <p>每一枚甜心币，都要两个人一起认可。</p>
          <button type="button" className="shop-counter__request" onClick={() => setModal('coin')}><Icon name="coin" size={16} />申请加币</button>
        </div>
        <div className="shop-counter__wallets">
          <BalanceCard profile={profile} balance={myBalance} label="我的口袋" />
          <span className="shop-counter__heart"><Icon name="heart" size={16} /></span>
          <BalanceCard profile={partnerProfile} balance={partnerBalance} label="TA 的口袋" />
        </div>
      </section>

      {(pendingRequests.length > 0 || actionableOrders.length > 0) && (
        <section className="shop-inbox">
          <div className="section-heading"><h2>等我处理</h2><span>{pendingRequests.length + actionableOrders.length} 件</span></div>
          {pendingRequests.map(request => (
            <div className="shop-inbox__row" key={request.id}>
              <span className="shop-inbox__icon"><Icon name="coin" /></span>
              <div><strong>{personName(request.requester_id)}申请 +{request.amount} 币</strong><p>{request.reason}</p></div>
              <div className="shop-inbox__actions"><button onClick={() => reviewRequest(request, 'rejected')}>拒绝</button><button className="is-primary" onClick={() => reviewRequest(request, 'approved')}>同意</button></div>
            </div>
          ))}
          {actionableOrders.map(order => (
            <div className="shop-inbox__row" key={order.id}>
              <span className="shop-inbox__icon"><Icon name="gift" /></span>
              <div><strong>{personName(order.buyer_id)}点了「{order.item_name}」</strong><p>{order.note || '没有特别备注'}</p></div>
              <div className="shop-inbox__actions">
                {order.status === 'pending' && <><button onClick={() => updateOrder(order, 'rejected')}>婉拒</button><button className="is-primary" onClick={() => updateOrder(order, 'accepted')}>接单</button></>}
                {order.status === 'accepted' && <button className="is-primary" onClick={() => updateOrder(order, 'completed')}>完成</button>}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="segmented-control daily-main-tabs" role="tablist">
        <button aria-selected={activeView === 'menu'} onClick={() => setActiveView('menu')}><Icon name="shop" size={16} />今日菜单</button>
        <button aria-selected={activeView === 'orders'} onClick={() => setActiveView('orders')}><Icon name="list" size={16} />订单小票</button>
        <button aria-selected={activeView === 'coins'} onClick={() => setActiveView('coins')}><Icon name="coin" size={16} />加币记录</button>
      </div>

      {activeView === 'menu' && <>
        <nav className="daily-chip-row" aria-label="菜单分类">
          {['all', ...categories.map(category => category.slug)].map(slug => {
            const meta = CATEGORY_META[slug] || { label: categories.find(category => category.slug === slug)?.name || slug, icon: 'tag' }
            return <button type="button" key={slug} className={`glass-pill ${activeCategory === slug ? 'is-selected' : ''}`} onClick={() => setActiveCategory(slug)}><Icon name={meta.icon} size={14} />{meta.label}</button>
          })}
        </nav>
        {visibleItems.length === 0 ? <DailyEmpty icon="shop" title="这一栏还空着" body="上架一个只有你们才懂的小愿望。" action="上架商品" onAction={() => setModal('item')} /> : (
          <div className="shop-menu-grid">
            {visibleItems.map(item => (
              <article className="menu-card" key={item.id}>
                <div className={`menu-card__visual is-${item.category_slug}`}><Icon name={CATEGORY_META[item.category_slug]?.icon || 'gift'} size={28} /><span>{CATEGORY_META[item.category_slug]?.label || '其他'}</span></div>
                <div className="menu-card__body">
                  <div><h3>{item.name}</h3><p>{item.description || '一份认真兑现的小约定'}</p></div>
                  <div className="menu-card__footer"><strong><Icon name="coin" size={15} />{item.price}</strong><button type="button" onClick={() => openOrder(item)} disabled={item.provider_id === profile?.id}> {item.provider_id === profile?.id ? '等 TA 来点' : '点一份'}</button></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </>}

      {activeView === 'orders' && (
        <div className="daily-record-list">
          {orders.length === 0 ? <DailyEmpty icon="list" title="还没有订单小票" body="点下第一份只属于你们的甜蜜服务吧。" /> : orders.map(order => (
            <article className="receipt-card" key={order.id}>
              <div className="receipt-card__tear" />
              <div className="receipt-card__head"><span>{formatTime(order.created_at)}</span><StatusPill status={order.status} /></div>
              <h3>{order.item_name}</h3>
              <p>{personName(order.buyer_id)} 点给 {personName(order.provider_id)}{order.note ? ` · ${order.note}` : ''}</p>
              <div className="receipt-card__total"><span>甜心币</span><strong>{order.price}</strong></div>
              {order.buyer_id === profile?.id && order.status === 'pending' && <button type="button" onClick={() => updateOrder(order, 'cancelled')}>取消订单</button>}
            </article>
          ))}
        </div>
      )}

      {activeView === 'coins' && (
        <div className="daily-record-list">
          {requests.length === 0 ? <DailyEmpty icon="coin" title="还没有加币记录" body="认真写下理由，邀请 TA 一起确认。" /> : requests.map(request => (
            <article className="coin-request-card" key={request.id}>
              <span className="coin-request-card__amount">+{request.amount}</span>
              <div><strong>给 {personName(request.beneficiary_id)}</strong><p>{request.reason}</p><small>{formatTime(request.created_at)} · {request.requester_id === profile?.id ? '我发起' : 'TA 发起'}</small></div>
              <StatusPill status={request.status} />
            </article>
          ))}
        </div>
      )}

      {modal === 'coin' && <DailyModal title="申请增加甜心币" onClose={() => setModal(null)}>
        <form className="daily-form" onSubmit={submitCoinRequest}>
          <FormField label="加给谁"><select className="input-field" value={coinForm.beneficiary_id} onChange={event => setCoinForm({ ...coinForm, beneficiary_id: event.target.value })}><option value={profile?.id}>给我</option>{partnerProfile?.id && <option value={partnerProfile.id}>给 {partnerProfile.nickname || 'TA'}</option>}</select></FormField>
          <FormField label="甜心币数量"><input className="input-field" type="number" min="1" step="1" value={coinForm.amount} onChange={event => setCoinForm({ ...coinForm, amount: event.target.value })} placeholder="例如 20" /></FormField>
          <FormField label="为什么值得奖励" hint="TA 同意后才会真正到账"><textarea className="input-field" rows="3" maxLength="100" value={coinForm.reason} onChange={event => setCoinForm({ ...coinForm, reason: event.target.value })} placeholder="认真写下这次奖励的理由" /></FormField>
          <div className="daily-form__actions"><button type="button" className="glass-button" onClick={() => setModal(null)}>取消</button><button className="btn-primary" type="submit">交给 TA 确认</button></div>
        </form>
      </DailyModal>}

      {modal === 'item' && <DailyModal title="上架一份小愿望" onClose={() => setModal(null)}>
        <form className="daily-form" onSubmit={submitItem}>
          <FormField label="商品名称"><input className="input-field" maxLength="30" value={itemForm.name} onChange={event => setItemForm({ ...itemForm, name: event.target.value })} placeholder="例如：抱抱充电五分钟" /></FormField>
          <div className="daily-form__grid"><FormField label="分类"><select className="input-field" value={itemForm.category_slug} onChange={event => setItemForm({ ...itemForm, category_slug: event.target.value })}>{Object.entries(CATEGORY_META).filter(([key]) => key !== 'all').map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></FormField><FormField label="价格"><input className="input-field" type="number" min="1" step="1" value={itemForm.price} onChange={event => setItemForm({ ...itemForm, price: event.target.value })} placeholder="甜心币" /></FormField></div>
          <FormField label="由谁兑现"><select className="input-field" value={itemForm.provider_id} onChange={event => setItemForm({ ...itemForm, provider_id: event.target.value })}><option value={profile?.id}>{profile?.nickname || '我'}</option>{partnerProfile?.id && <option value={partnerProfile.id}>{partnerProfile.nickname || 'TA'}</option>}</select></FormField>
          <FormField label="说明"><textarea className="input-field" rows="3" maxLength="200" value={itemForm.description} onChange={event => setItemForm({ ...itemForm, description: event.target.value })} placeholder="把怎么兑现写清楚一点" /></FormField>
          <div className="daily-form__actions"><button type="button" className="glass-button" onClick={() => setModal(null)}>取消</button><button className="btn-primary" type="submit">摆上货架</button></div>
        </form>
      </DailyModal>}

      {modal === 'order' && selectedItem && <DailyModal title="确认这份点单" onClose={() => setModal(null)}>
        <form className="daily-form" onSubmit={placeOrder}>
          <div className="order-confirm">
            <span><Icon name={CATEGORY_META[selectedItem.category_slug]?.icon || 'gift'} size={25} /></span>
            <div><h3>{selectedItem.name}</h3><p>{selectedItem.description}</p></div>
          </div>
          <div className="order-confirm__balance"><span>本次支付 <b>{selectedItem.price}</b> 枚</span><span>支付后剩余 <b>{myBalance - Number(selectedItem.price)}</b> 枚</span></div>
          <FormField label="留句话给 TA（可选）"><textarea className="input-field" rows="3" maxLength="100" value={orderNote} onChange={event => setOrderNote(event.target.value)} placeholder="例如：想在今晚睡前兑换" /></FormField>
          <div className="daily-form__actions"><button type="button" className="glass-button" onClick={() => setModal(null)}>再想想</button><button className="btn-primary" type="submit" disabled={myBalance < Number(selectedItem.price)}>确认点单</button></div>
        </form>
      </DailyModal>}

      {toast && <DailyToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}

function BalanceCard({ profile, balance, label }) {
  return <div className="balance-card"><ProfileAvatar profile={profile} size={36} /><span>{label}</span><strong><Icon name="coin" size={17} />{balance}</strong></div>
}

function StatusPill({ status }) {
  const labels = { pending: '待确认', approved: '已同意', rejected: '已拒绝', accepted: '已接单', completed: '已完成', cancelled: '已取消' }
  return <span className={`status-pill is-${status}`}>{labels[status] || status}</span>
}
