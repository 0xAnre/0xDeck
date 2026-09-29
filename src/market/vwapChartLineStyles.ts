export type VwapChartLineStyle = {
  color: string
  lineWidth: 1
}

export const VWAP_CHART_LINE_STYLE: VwapChartLineStyle = {
  color: '#9e9e9e',
  lineWidth: 1,
}

export const VWAP_PREVIOUS_VWAP_LINE_STYLE: VwapChartLineStyle = {
  color: 'rgba(158, 158, 158, 0.5)',
  lineWidth: 1,
}

export type VwapChartSeriesKey =
  | 'vwap'
  | 'upper1'
  | 'lower1'
  | 'previousVwap'
  | 'previousUpper1'
  | 'previousLower1'

export const VWAP_CHART_SERIES_KEYS: readonly VwapChartSeriesKey[] = [
  'previousLower1',
  'previousUpper1',
  'previousVwap',
  'lower1',
  'upper1',
  'vwap',
]

export const VWAP_CHART_SERIES_STYLES: Record<VwapChartSeriesKey, VwapChartLineStyle> = {
  previousLower1: VWAP_CHART_LINE_STYLE,
  previousUpper1: VWAP_CHART_LINE_STYLE,
  previousVwap: VWAP_PREVIOUS_VWAP_LINE_STYLE,
  lower1: VWAP_CHART_LINE_STYLE,
  upper1: VWAP_CHART_LINE_STYLE,
  vwap: VWAP_CHART_LINE_STYLE,
}
