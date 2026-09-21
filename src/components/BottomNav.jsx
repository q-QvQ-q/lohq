import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: '首页', image: '/images/nav-home.png' },
  { to: '/calendar', label: '日历', image: '/images/nav-calendar.png' },
  { to: '/knowledge', label: '错题本', image: '/images/nav-book.png' },
  { to: '/settings', label: '设置', image: '/images/nav-settings.png' }
]

export default function BottomNav() {
  return (
    <nav aria-label="主导航" className="fixed bottom-3 left-3 right-3 z-40 md:bottom-5 bottom-nav rounded-[22px]">
      <div className="max-w-xl mx-auto grid grid-cols-4 items-center p-1.5">
        {items.map(({ to, label, image }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex flex-col items-center justify-center gap-1 min-h-14 rounded-full text-[11px] font-medium transition-colors ${isActive ? 'nav-active-glass' : 'text-[var(--color-text-light)] hover:bg-[var(--surface-muted)]'}`}>
            <img src={image} alt="" width="25" height="25" className="nav-art object-contain" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
