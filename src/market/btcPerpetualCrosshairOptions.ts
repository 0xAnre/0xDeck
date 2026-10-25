import {
  CrosshairMode,
  LineStyle,
  type CrosshairLineOptions,
  type CrosshairOptions,
  type DeepPartial,
  type LineWidth,
} from 'lightweight-charts'
import { rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'

/**
 * Lightweight Charts clamps crosshair line width to a 1px minimum, so the visual
 * weight is lowered through alpha instead: ~50% of the previous opaque default.
 */
export const BTC_PERPETUAL_CROSSHAIR_LINE_OPACITY = 0.5
export const BTC_PERPETUAL_CROSSHAIR_LINE_WIDTH: LineWidth = 1
export const BTC_PERPETUAL_CROSSHAIR_LINE_STYLE = LineStyle.LargeDashed

/**
 * Crosshair options for the BTC Perpetual chart.
 *
 * `CrosshairMode.Normal` keeps the horizontal line and price label on the exact
 * pointer Y instead of magnet-snapping to the hovered candle's OHLC value.
 * Line colors are derived from the theme-resolved foreground so the widget does
 * not hardcode palette colors.
 */
export function btcPerpetualCrosshairOptions(
  resolvedThemeForeground: string,
): DeepPartial<CrosshairOptions> {
  const color = rgbaFromResolvedCssColor(
    resolvedThemeForeground,
    BTC_PERPETUAL_CROSSHAIR_LINE_OPACITY,
  )
  const line = (): DeepPartial<CrosshairLineOptions> => ({
    color,
    width: BTC_PERPETUAL_CROSSHAIR_LINE_WIDTH,
    style: BTC_PERPETUAL_CROSSHAIR_LINE_STYLE,
    visible: true,
    labelVisible: true,
  })

  return {
    mode: CrosshairMode.Normal,
    vertLine: line(),
    horzLine: line(),
  }
}
