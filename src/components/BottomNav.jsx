import { NavLink } from 'react-router-dom'

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t"
      style={{ borderColor: 'var(--color-primary-light)' }}
    >
      <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-2">
        <NavItem to="/" label="首页" catType="home" />
        <NavItem to="/calendar" label="日历" catType="calendar" />
        <NavItem to="/knowledge" label="错题本" catType="book" />
        <NavItem to="/settings" label="设置" catType="settings" />
      </div>
    </nav>
  )
}

function NavItem({ to, label, catType }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center w-16 h-full rounded-xl transition-all duration-200 hover:scale-110 active:scale-95`
      }
    >
      {({ isActive }) => (
        <>
          <CatIcon type={catType} active={isActive} />
          <span className={`text-xs mt-0.5 transition-all ${isActive ? 'font-bold' : ''}`}
                style={{ color: isActive ? 'var(--color-primary-dark)' : 'var(--color-text-light)' }}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

const ICON_MAP = {
  home: '/images/首页图标.PNG',
  calendar: '/images/日历图标.PNG',
  book: '/images/错题本图标.PNG',
  settings: '/images/设置图标.PNG'
}

function CatIcon({ type, active }) {
  const size = 24
  const src = ICON_MAP[type]
  if (!src) return null
  
  return (
    <img
      src={src}
      alt={type}
      width={size}
      height={size}
      style={{
        objectFit: 'contain',
        opacity: active ? 1 : 0.55,
        transition: 'opacity 0.2s'
      }}
    />
  )
}
