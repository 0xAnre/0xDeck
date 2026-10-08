import { resolveThemeCssColor, rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'
import {
  DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT,
  isRectangleFillOpacityPercent,
  isRectangleHexColor,
  type RectangleInstance,
} from './rectangleInstances.ts'

export const RECTANGLE_FILL_SEMANTIC_CSS_VAR = '--muted-foreground'
export const RECTANGLE_FILL_OPACITY = 0.20
export const RECTANGLE_HANDLE_FILL_OPACITY = 0.85

const RECTANGLE_FILL_FALLBACK_RGB = 'rgb(115, 115, 115)'

export function readRectangleThemeBaseRgb(): string {
  if (typeof document === 'undefined') {
    return RECTANGLE_FILL_FALLBACK_RGB
  }

  const token = getComputedStyle(document.documentElement).getPropertyValue(RECTANGLE_FILL_SEMANTIC_CSS_VAR)
  return resolveThemeCssColor(token, RECTANGLE_FILL_FALLBACK_RGB)
}

export function rectangleFillRgbaFromHex(hexColor: string, opacityPercent: number): string {
  const clampedOpacity = Math.min(100, Math.max(0, opacityPercent))
  const r = Number.parseInt(hexColor.slice(1, 3), 16)
  const g = Number.parseInt(hexColor.slice(3, 5), 16)
  const b = Number.parseInt(hexColor.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${clampedOpacity / 100})`
}

export function resolveRectangleInstanceFillStyle(instance: RectangleInstance): string {
  const hasCustomColor = isRectangleHexColor(instance.fillColor)
  const hasCustomOpacity = isRectangleFillOpacityPercent(instance.fillOpacity)
  if (!hasCustomColor && !hasCustomOpacity) {
    return readRectangleFillStyle()
  }

  const opacityPercent = hasCustomOpacity
    ? instance.fillOpacity!
    : DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT
  if (hasCustomColor) {
    return rectangleFillRgbaFromHex(instance.fillColor!, opacityPercent)
  }

  return rgbaFromResolvedCssColor(readRectangleThemeBaseRgb(), opacityPercent / 100)
}

export function readRectangleFillStyle(): string {
  return rgbaFromResolvedCssColor(readRectangleThemeBaseRgb(), RECTANGLE_FILL_OPACITY)
}

export function readRectangleHandleFillStyle(): string {
  return rgbaFromResolvedCssColor(readRectangleThemeBaseRgb(), RECTANGLE_HANDLE_FILL_OPACITY)
}
