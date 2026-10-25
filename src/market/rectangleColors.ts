import {
  MARKET_STYLE_DEFAULTS,
  MARKET_STYLE_OPACITY_PERCENT,
  MARKET_STYLE_PALETTE,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'
import {
  DEFAULT_RECTANGLE_FILL_HEX,
  DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT,
  isRectangleFillOpacityPercent,
  isRectangleHexColor,
  type RectangleInstance,
} from './rectangleInstances.ts'

/** Rectangle fill / handle alpha defaults (fractions, canvas `fillStyle`). */
export const RECTANGLE_FILL_OPACITY = MARKET_STYLE_OPACITY_PERCENT.fill / 100
export const RECTANGLE_HANDLE_FILL_OPACITY = 0.85

/** Hex value for the shared color picker: instance color, else the palette fill color. */
export function rectangleInstancePickerFillHex(instance: RectangleInstance): string {
  if (isRectangleHexColor(instance.fillColor)) {
    return instance.fillColor.toLowerCase()
  }
  return DEFAULT_RECTANGLE_FILL_HEX
}

/** Persisted hex + opacity percent → CSS color (shared palette conversion). */
export function rectangleFillRgbaFromHex(hexColor: string, opacityPercent: number): string {
  return marketStyleColorWithOpacity(hexColor, opacityPercent)
}

export function resolveRectangleInstanceFillStyle(instance: RectangleInstance): string {
  const hasCustomColor = isRectangleHexColor(instance.fillColor)
  const hasCustomOpacity = isRectangleFillOpacityPercent(instance.fillOpacity)
  if (!hasCustomColor && !hasCustomOpacity) {
    return readRectangleFillStyle()
  }

  const color = hasCustomColor ? instance.fillColor! : DEFAULT_RECTANGLE_FILL_HEX
  const opacityPercent = hasCustomOpacity
    ? instance.fillOpacity!
    : DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT
  return marketStyleColorWithOpacity(color, opacityPercent)
}

/** Palette fill default (medium @ 25%). */
export function readRectangleFillStyle(): string {
  return marketStyleColorWithOpacity(
    MARKET_STYLE_DEFAULTS.fill.color,
    MARKET_STYLE_DEFAULTS.fill.opacityPercent,
  )
}

/** Selection-handle chrome stays crisp regardless of the fill opacity. */
export function readRectangleHandleFillStyle(): string {
  return marketStyleColorWithOpacity(
    MARKET_STYLE_PALETTE.dark,
    RECTANGLE_HANDLE_FILL_OPACITY * 100,
  )
}
