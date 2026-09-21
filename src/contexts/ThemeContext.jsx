import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export const THEMES = {
  light: {
    name: '白天模式',
    colors: {
      primary: '#A75C75', primaryLight: '#F5E4EA', primaryDark: '#7D4057',
      text: '#342A2E', textLight: '#705963', background: '#F8EFF2', accent: '#F2DDE5'
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

const getInitialTheme = () => {
  const saved = localStorage.getItem('lohq_theme')
  // Previous color themes map to the new light appearance.
  return saved === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

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

  return <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
