/** Resolve a CSS color value to `rgb(...)` for canvas use (non-oklch inputs). */
export function resolveCssColor(value: string, fallback: string): string {
  const input = value.trim() || fallback
  if (input.includes('oklch(') || input.includes('oklab(')) {
    return fallback
  }

  if (typeof document === 'undefined') {
    return input
  }

  const probe = document.createElement('span')
  probe.style.color = input
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

  if (!resolved || resolved.includes('oklch(') || resolved.includes('oklab(')) {
    return fallback
  }
  return resolved
}

/** Resolve theme token values (including oklch) to `rgb(...)` for canvas strokes. */
export function resolveThemeCssColor(value: string, fallback: string): string {
  const input = value.trim() || fallback

  if (typeof document === 'undefined') {
    if (input.includes('oklch(') || input.includes('oklab(')) {
      return fallback
    }
    return input
  }

  const probe = document.createElement('span')
  probe.style.color = input
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

  if (!resolved || resolved.includes('oklch(') || resolved.includes('oklab(')) {
    return fallback
  }
  return resolved
}

export function rgbaFromResolvedCssColor(color: string, opacity: number): string {
  const trimmed = color.trim()
  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(trimmed)
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${opacity})`
  }

  const hex = trimmed.replace('#', '')
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    const r = Number.parseInt(normalized.slice(0, 2), 16)
    const g = Number.parseInt(normalized.slice(2, 4), 16)
    const b = Number.parseInt(normalized.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  return trimmed
}
