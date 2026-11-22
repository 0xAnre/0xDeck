export const THEMES = ['neutral', 'stone', 'mauve', 'taupe', 'olive', 'black', 'cream'] as const

export type Theme = (typeof THEMES)[number]

export type ThemeAppearance = 'light' | 'dark'

export const DEFAULT_THEME: Theme = 'neutral'

export const THEME_LABELS: Record<Theme, string> = {
  neutral: 'Neutral',
  stone: 'Stone',
  mauve: 'Mauve',
  taupe: 'Taupe',
  olive: 'Olive',
  black: 'Black',
  cream: 'Cream',
}

/**
 * Every built-in palette except Cream is dark. `applyTheme` uses this to decide the
 * shadcn `.dark` variant class and the browser-native `color-scheme`, so Cream renders
 * shadcn's light component branches instead of dark fragments on a light surface.
 */
export const THEME_APPEARANCES: Record<Theme, ThemeAppearance> = {
  neutral: 'dark',
  stone: 'dark',
  mauve: 'dark',
  taupe: 'dark',
  olive: 'dark',
  black: 'dark',
  cream: 'light',
}

export const THEME_STORAGE_KEY = '0xdeck-theme'

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  const appearance = THEME_APPEARANCES[theme]

  root.dataset.theme = theme
  // Dark themes keep the `.dark` class for shadcn's `dark:` variants. Cream removes it so
  // inputs, tabs and badges use their light branches, and switching back restores it.
  root.classList.toggle('dark', appearance === 'dark')
  // Native widgets (scrollbars, form controls) follow the active palette too.
  root.style.colorScheme = appearance
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
