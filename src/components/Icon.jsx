import React from 'react'

// A small, consistent outline set for the app chrome and task controls.
const paths = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 4v18M8 7h8M8 11h7"/></>,
  settings: <><path d="M12 3.5a2 2 0 0 1 2 1.5l.3 1 1.1.6 1-.3a2 2 0 0 1 2.2.8l1 1.7a2 2 0 0 1-.4 2.3l-.8.7v1.2l.8.7a2 2 0 0 1 .4 2.3l-1 1.7a2 2 0 0 1-2.2.8l-1-.3-1.1.6-.3 1a2 2 0 0 1-2 1.5h-2a2 2 0 0 1-2-1.5l-.3-1-1.1-.6-1 .3a2 2 0 0 1-2.2-.8l-1-1.7a2 2 0 0 1 .4-2.3l.8-.7v-1.2l-.8-.7a2 2 0 0 1-.4-2.3l1-1.7a2 2 0 0 1 2.2-.8l1 .3 1.1-.6.3-1a2 2 0 0 1 2-1.5z"/><circle cx="12" cy="12" r="3"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  trash: <><path d="M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
  pencil: <><path d="m4 20 4.5-1 10-10a2 2 0 0 0-3-3l-10 10L4 20zM14 7l3 3"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  tag: <><path d="M3 4h9l9 9-8 8-9-9z"/><circle cx="8" cy="8" r="1"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5z"/>,
  list: <><path d="M9 6h12M9 12h12M9 18h12M3 6h2M3 12h2M3 18h2"/></>,
  heart: <path d="M20.8 5.6a5.4 5.4 0 0 0-7.6 0L12 6.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.8a5.4 5.4 0 0 0 0-7.6z"/>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M16 12h5M3 9h18"/></>,
  note: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  chart: <><path d="M3 21V3M3 21h18M7 16v-4M12 16V7M17 16v-7"/></>,
  file: <><path d="M6 2h8l4 4v16H6zM14 2v5h4M9 12h6M9 16h6"/></>,
  chevronLeft: <path d="m15 18-6-6 6-6"/>,
  chevronRight: <path d="m9 18 6-6-6-6"/>,
  x: <path d="M5 5 19 19M19 5 5 19"/>,
  repeat: <><path d="M4 8a4 4 0 0 1 4-4h11l-3-3M19 4l-3 3M20 16a4 4 0 0 1-4 4H5l3 3M5 20l3-3"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  circle: <circle cx="12" cy="12" r="9"/>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M2 20a7 7 0 0 1 14 0M17 5a3 3 0 0 1 0 6M18 14a6 6 0 0 1 4 6"/></>,
  search: <><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  gift: <><rect x="3" y="10" width="18" height="11" rx="1"/><path d="M3 10h18M12 10v11M12 10c-7 0-8-7-4-7 2 0 4 3 4 7zm0 0c7 0 8-7 4-7-2 0-4 3-4 7z"/></>,
  undo: <><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12"/></>,
  sparkle: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>,
  star: <path d="m12 2 3.1 6.3 7 .9-5.1 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5.1-5 7-.9z"/>
}

export default function Icon({ name, size = 18, className = '', ...props }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} {...props}>{paths[name] || paths.circle}</svg>
}
