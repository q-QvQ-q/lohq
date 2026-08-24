import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export const THEMES = {
  pink: {
    name: '柔雾粉',
    colors: {
      primary: '#E8C4C4',
      primaryLight: '#F2D7D9',
      primaryDark: '#D4A5A5',
      text: '#8B4557',
      textLight: '#A8767E',
      background: '#FDF8F5',
      accent: '#FFB5B5',
      icon: '🐱'
    }
  },
  blue: {
    name: '浅蓝',
    colors: {
      primary: '#B5D4E8',
      primaryLight: '#D4E6F1',
      primaryDark: '#8FB8D4',
      text: '#3D5A80',
      textLight: '#5B7BA3',
      background: '#F0F5FA',
      accent: '#A5C8E6',
      icon: '🐱'
    }
  },
  mint: {
    name: '薄荷绿',
    colors: {
      primary: '#B5E8D4',
      primaryLight: '#D4F1E6',
      primaryDark: '#8BD4B8',
      text: '#3D7860',
      textLight: '#5B9978',
      background: '#F0FAF5',
      accent: '#A5E6C8',
      icon: '🐱'
    }
  },
  lavender: {
    name: '薰衣草',
    colors: {
      primary: '#D4C4E8',
      primaryLight: '#E6D9F2',
      primaryDark: '#B8A5D4',
      text: '#5B4580',
      textLight: '#7B6699',
      background: '#F5F0FA',
      accent: '#B8A5E6',
      icon: '🐱'
    }
  },
  peach: {
    name: '蜜桃橙',
    colors: {
      primary: '#FFD4B5',
      primaryLight: '#FFE6D4',
      primaryDark: '#E8B88A',
      text: '#805B3D',
      textLight: '#997A5B',
      background: '#FFF5F0',
      accent: '#FFC89A',
      icon: '🐱'
    }
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('lohq_theme')
    return saved || 'pink'
  })

  useEffect(() => {
    localStorage.setItem('lohq_theme', theme)
    applyTheme(theme)
  }, [theme])

  const applyTheme = (themeKey) => {
    const themeData = THEMES[themeKey]
    if (!themeData) return
    const root = document.documentElement
    const { colors } = themeData
    root.style.setProperty('--color-primary', colors.primary)
    root.style.setProperty('--color-primary-light', colors.primaryLight)
    root.style.setProperty('--color-primary-dark', colors.primaryDark)
    root.style.setProperty('--color-text', colors.text)
    root.style.setProperty('--color-text-light', colors.textLight)
    root.style.setProperty('--color-background', colors.background)
    root.style.setProperty('--color-accent', colors.accent)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
