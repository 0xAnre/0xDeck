import type { MarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'
import {
  MARKET_STYLE_DEFAULTS,
  isMarketStyleOpacityPercent,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'
import { isLineChartHexColor } from './lineChartStroke.ts'
import { readRectangleFillStyle } from './rectangleColors.ts'

/**
 * Session (time-based) VWAP band fill resolution.
 *
 * The band fill is independent from the VWAP line styling: a presentation
 * without fill fields keeps the shared palette fill default (medium @ 25%),
 * and a partial record falls back per field.
 */
export function resolveSessionVwapBandFillStyle(
  presentation: MarketIndicatorPresentation,
): string {
  const hasCustomColor = isLineChartHexColor(presentation.fillColor)
  const hasCustomOpacity = isMarketStyleOpacityPercent(presentation.fillOpacity)
  if (!hasCustomColor && !hasCustomOpacity) return readRectangleFillStyle()

  const color = hasCustomColor
    ? presentation.fillColor!
    : MARKET_STYLE_DEFAULTS.fill.color
  const opacityPercent = hasCustomOpacity
    ? presentation.fillOpacity!
    : MARKET_STYLE_DEFAULTS.fill.opacityPercent
  return marketStyleColorWithOpacity(color, opacityPercent)
}

/** Color picker value for the dialog: stored fill color, else the palette fill color. */
export function sessionVwapBandFillColorInputValue(
  presentationFillColor: string | undefined,
): string {
  return isLineChartHexColor(presentationFillColor)
    ? presentationFillColor
    : MARKET_STYLE_DEFAULTS.fill.color
}

/** Opacity picker value for the dialog: stored fill opacity, else the palette fill opacity. */
export function sessionVwapBandFillOpacityInputValue(
  presentationFillOpacity: number | undefined,
): number {
  return isMarketStyleOpacityPercent(presentationFillOpacity)
    ? presentationFillOpacity
    : MARKET_STYLE_DEFAULTS.fill.opacityPercent
}
