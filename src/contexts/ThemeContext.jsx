import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export const THEMES = {
  light: {
    name: '白天模式',
    colors: {
      primary: '#E18EAA', primaryLight: '#F9E8EE', primaryDark: '#AC687F',
      text: '#3D2E34', textLight: '#80636D', background: '#FCF4F6', accent: '#F7E1E8'
    }
  },
  dark: {
    name: '黑夜模式',
    colors: {
      primary: '#B86D98', primaryLight: '#352039', primaryDark: '#F1BDD4',
      text: '#FFF5FA', textLight: '#DCC3D1', background: '#160D1B', accent: '#4B2B48'
    }
  }
}

export const FONT_PRESETS = {
  huiwen: {
    name: '汇文明朝体',
    description: '复古铅字感',
    family: "'Huiwen-MinchoGBK', 'Huiwen-mincho', 'Songti SC', 'STSong', serif",
    loadFamily: 'Huiwen-MinchoGBK',
    remote: true
  },
  zcool: {
    name: '站酷快乐体',
    description: '轻松可爱',
    family: "'ZCOOL KuaiLe', 'Ma Shan Zheng', cursive, sans-serif",
    loadFamily: 'ZCOOL KuaiLe',
    remote: true
  },
  songti: {
    name: '宋体',
    description: '经典阅读',
    family: "SimSun, 'Songti SC', 'STSong', serif"
  },
  iphone: {
    name: 'iPhone 系统',
    description: '清晰轻盈',
    family: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'PingFang SC', sans-serif"
  },
  yahei: {
    name: '微软雅黑',
    description: '常用易读',
    family: "'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif"
  },
  sans: {
    name: '简洁无衬线',
    description: '通用现代',
    family: "Arial, 'Helvetica Neue', 'PingFang SC', sans-serif"
  }
}

const getInitialTheme = () => {
  const saved = localStorage.getItem('lohq_theme')
  // Previous color themes map to the new light appearance.
  return saved === 'dark' ? 'dark' : 'light'
}

const getInitialFont = () => {
  const saved = localStorage.getItem('lohq_font')
  return FONT_PRESETS[saved] ? saved : 'huiwen'
}

function loadFont(preset) {
  if (!preset?.remote || !document.fonts?.load) return Promise.resolve()
  return document.fonts.load(`1em "${preset.loadFamily}"`, '字体加载预览').catch(() => undefined)
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)
  const [font, setFontState] = useState(getInitialFont)
  const [fontLoading, setFontLoading] = useState(null)

  useEffect(() => {
    const root = document.documentElement
    const { colors } = THEMES[theme]
    root.dataset.theme = theme
    root.style.colorScheme = theme
    Object.entries(colors).forEach(([key, value]) => {
      const cssName = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
      root.style.setProperty(`--color-${cssName}`, value)
    })
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#160D1B' : '#FFF8FA'
    )
    localStorage.setItem('lohq_theme', theme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    const preset = FONT_PRESETS[font]
    root.dataset.font = font
    root.style.setProperty('--font-reading', preset.family)
    localStorage.setItem('lohq_font', font)
  }, [font])

  useEffect(() => {
    const preload = () => {
      Object.values(FONT_PRESETS)
        .filter(preset => preset.remote)
        .forEach(preset => { loadFont(preset) })
    }
    const idleId = window.requestIdleCallback?.(preload, { timeout: 1800 })
    const timeoutId = idleId === undefined ? window.setTimeout(preload, 400) : null
    return () => {
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [])

  const setFont = async (nextFont) => {
    if (!FONT_PRESETS[nextFont] || nextFont === font || fontLoading) return
    const preset = FONT_PRESETS[nextFont]
    setFontLoading(nextFont)
    await loadFont(preset)
    setFontState(nextFont)
    setFontLoading(null)
  }

  return <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES, font, setFont, fonts: FONT_PRESETS, fontLoading }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
