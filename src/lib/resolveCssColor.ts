function isModernColorSerialization(value: string): boolean {
  return value.includes('oklch(') || value.includes('oklab(')
}

function hexColorToRgbString(hex: string): string {
  const normalized = hex.replace('#', '')
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return hex
  }
  const r = Number.parseInt(expanded.slice(0, 2), 16)
  const g = Number.parseInt(expanded.slice(2, 4), 16)
  const b = Number.parseInt(expanded.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

function parseOklchComponent(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const percent = Number.parseFloat(trimmed)
    return Number.isFinite(percent) ? percent / 100 : null
  }
  const number = Number.parseFloat(trimmed)
  return Number.isFinite(number) ? number : null
}

function linearSrgbChannelToByte(channel: number): number {
  const abs = Math.abs(channel)
  const srgb =
    abs > 0.0031308 ? Math.sign(channel) * (1.055 * abs ** (1 / 2.4) - 0.055) : 12.92 * channel
  return Math.round(Math.min(255, Math.max(0, srgb * 255)))
}

function oklchTripletToRgb(l: number, c: number, hDegrees: number): [number, number, number] {
  const hRad = (hDegrees / 180) * Math.PI
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const l3 = l_ * l_ * l_
  const m3 = m_ * m_ * m_
  const s3 = s_ * s_ * s_

  const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  return [linearSrgbChannelToByte(r), linearSrgbChannelToByte(g), linearSrgbChannelToByte(bl)]
}

/** Convert `oklch(...)` CSS syntax to `rgb(r, g, b)` for canvas use. */
export function oklchCssColorToRgbString(value: string): string | null {
  const trimmed = value.trim()
  const match =
    /^oklch\(\s*([^/\s)]+)\s+([^/\s)]+)\s+([^/\s)]+)(?:\s*\/\s*[^)]+)?\s*\)$/i.exec(trimmed)
  if (!match) return null

  const l = parseOklchComponent(match[1])
  const c = parseOklchComponent(match[2])
  const hRaw = match[3].trim()
  const hDegrees = Number.parseFloat(hRaw.replace(/deg$/i, ''))
  if (l === null || c === null || !Number.isFinite(hDegrees)) return null

  const [r, g, b] = oklchTripletToRgb(l, c, hDegrees)
  return `rgb(${r}, ${g}, ${b})`
}

function resolveCssColorWithCanvas(color: string): string | null {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null

  try {
    context.fillStyle = '#000000'
    context.fillStyle = color
  } catch {
    return null
  }

  const resolved = context.fillStyle
  if (typeof resolved !== 'string' || !resolved) return null
  if (resolved.startsWith('#')) {
    return hexColorToRgbString(resolved)
  }
  if (/^rgba?\(/i.test(resolved) && !isModernColorSerialization(resolved)) {
    return resolved
  }
  if (isModernColorSerialization(resolved)) {
    return oklchCssColorToRgbString(resolved) ?? oklchCssColorToRgbString(color)
  }
  return null
}

function convertThemeColorInput(input: string): string | null {
  return oklchCssColorToRgbString(input) ?? resolveCssColorWithCanvas(input)
}

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
  const input = value.trim() || fallback.trim()

  const converted = convertThemeColorInput(input)
  if (converted) return converted

  if (typeof document !== 'undefined') {
    const probe = document.createElement('span')
    probe.style.color = input
    document.body.appendChild(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()

    if (resolved && !isModernColorSerialization(resolved)) {
      return resolved
    }
    if (resolved && isModernColorSerialization(resolved)) {
      const fromResolved = oklchCssColorToRgbString(resolved)
      if (fromResolved) return fromResolved
    }
  }

  if (!isModernColorSerialization(input)) {
    return input
  }

  return fallback
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
