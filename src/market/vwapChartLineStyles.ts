import { MARKET_STYLE_DEFAULTS, marketStyleColorWithOpacity } from './marketStylePalette.ts'

export type VwapChartLineStyle = {
  color: string
  lineWidth: 1
}

const PRIMARY_LINE_DEFAULT = MARKET_STYLE_DEFAULTS.primaryLine
const SECONDARY_LINE_DEFAULT = MARKET_STYLE_DEFAULTS.secondaryLine

/** Session / daily / weekly / … VWAP center line: palette primary line at 100%. */
export const VWAP_CHART_LINE_STYLE: VwapChartLineStyle = {
  color: marketStyleColorWithOpacity(
    PRIMARY_LINE_DEFAULT.color,
    PRIMARY_LINE_DEFAULT.opacityPercent,
  ),
  lineWidth: 1,
}

/** Previous-session upper/lower band lines: palette secondary line at 70%. */
export const VWAP_CHART_BAND_LINE_STYLE: VwapChartLineStyle = {
  color: marketStyleColorWithOpacity(
    SECONDARY_LINE_DEFAULT.color,
    SECONDARY_LINE_DEFAULT.opacityPercent,
  ),
  lineWidth: 1,
}

export type VwapChartSeriesKey = 'vwap' | 'previousUpper1' | 'previousLower1'

export const VWAP_CHART_SERIES_KEYS: readonly VwapChartSeriesKey[] = [
  'previousLower1',
  'previousUpper1',
  'vwap',
]

export const VWAP_CHART_SERIES_STYLES: Record<VwapChartSeriesKey, VwapChartLineStyle> = {
  previousLower1: VWAP_CHART_BAND_LINE_STYLE,
  previousUpper1: VWAP_CHART_BAND_LINE_STYLE,
  vwap: VWAP_CHART_LINE_STYLE,
}
