import {
  LineStyle,
  type CandlestickSeriesPartialOptions,
  type LineWidth,
} from 'lightweight-charts'
import { rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'

/**
 * Lightweight Charts clamps price-line width to a 1px minimum, so the visual
 * weight is lowered through alpha instead: ~50% of the previous opaque default.
 * The library strips alpha when it derives the price-axis label background and
 * auto-contrast text from the line color, so the current-price label stays
 * opaque and readable.
 */
export const BTC_PERPETUAL_CURRENT_PRICE_LINE_OPACITY = 0.5
export const BTC_PERPETUAL_CURRENT_PRICE_LINE_WIDTH: LineWidth = 1
/**
 * The Lightweight Charts default for `priceLineStyle` is `LineStyle.Dashed`.
 * Setting it explicitly preserves the line's pre-existing pattern so only the
 * opacity is lowered.
 */
export const BTC_PERPETUAL_CURRENT_PRICE_LINE_STYLE = LineStyle.Dashed

/**
 * Current-price line options for the BTC Perpetual candlestick series.
 *
 * The color is derived from the theme-resolved foreground so the widget does
 * not hardcode palette colors; the pre-existing dashed pattern and 1px width
 * are kept unchanged while the alpha halves the line's visual weight.
 */
export function btcPerpetualCurrentPriceLineOptions(
  resolvedThemeForeground: string,
): CandlestickSeriesPartialOptions {
  return {
    priceLineVisible: true,
    priceLineStyle: BTC_PERPETUAL_CURRENT_PRICE_LINE_STYLE,
    priceLineWidth: BTC_PERPETUAL_CURRENT_PRICE_LINE_WIDTH,
    priceLineColor: rgbaFromResolvedCssColor(
      resolvedThemeForeground,
      BTC_PERPETUAL_CURRENT_PRICE_LINE_OPACITY,
    ),
  }
}
