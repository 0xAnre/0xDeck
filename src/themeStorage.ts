export const THEMES = ['neutral', 'stone', 'mauve', 'taupe', 'olive'] as const

export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'neutral'

export const THEME_LABELS: Record<Theme, string> = {
  neutral: 'Neutral',
  stone: 'Stone',
  mauve: 'Mauve',
  taupe: 'Taupe',
  olive: 'Olive',
}

export const THEME_STORAGE_KEY = '0xdeck-theme'

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.add('dark')
}

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved && THEMES.includes(saved as Theme)) {
      return saved as Theme
    }
  } catch {
    // ignore
  }
  return DEFAULT_THEME
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}
