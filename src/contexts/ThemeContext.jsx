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
      primary: '#619DF1', primaryLight: '#25344A', primaryDark: '#A6C9FF',
      text: '#F3F6FB', textLight: '#BBC8D8', background: '#0C121B', accent: '#314966'
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
    localStorage.setItem('lohq_theme', theme)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
