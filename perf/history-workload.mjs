/**
 * Market history workload for the Issue #264 browser regression spec.
 *
 * The chart history contract is the real one: a 750-bar daily-context initial
 * window and 500-bar `/klines/history` pages, so the app's own viewport
 * backfill and indicator preload paths run unmodified. Everything else (the
 * Parquet shell calls) stays on the shared `perf/workload.mjs` mock.
 *
 * Not application code and not shipped; only the Playwright spec imports it.
 */
export const HISTORY_PANEL = 'btc-perpetual-chart-h26401'
export const HISTORY_STEP_SECONDS = 60
export const HISTORY_INITIAL_BARS = 750
export const HISTORY_PAGE_BARS = 500
export const HISTORY_EDGE_TIME = 1_700_000_000
export const HISTORY_AVAILABLE_FROM = HISTORY_EDGE_TIME - 21_000 * HISTORY_STEP_SECONDS

/** Deterministic continuous 1m candles; the index derives the price. */
export function historyCandleAt(index) {
  const close = 30_000 + Math.sin(index / 17) * 400 + (index % 7) * 1.5
  const time = HISTORY_EDGE_TIME + index * HISTORY_STEP_SECONDS
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time,
    open: close - 12,
    high: close + 34,
    low: close - 34,
    close,
    volume: 10 + (index % 13),
    closed: index < 0,
  }
}

export function historyContextCandles() {
  const candles = []
  for (let index = -HISTORY_INITIAL_BARS; index < 0; index += 1) {
    candles.push(historyCandleAt(index))
  }
  return candles
}

export function historyPageCandles(before) {
  const beforeIndex = Math.round((before - HISTORY_EDGE_TIME) / HISTORY_STEP_SECONDS)
  const candles = []
  for (let index = beforeIndex - HISTORY_PAGE_BARS; index < beforeIndex; index += 1) {
    candles.push(historyCandleAt(index))
  }
  return candles
}

export function historyMarketResponse(interval, candles) {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval,
    candles,
    available_from: HISTORY_AVAILABLE_FROM,
  }
}

/** Single BTC panel, no indicators, in the legacy workspace payload shape. */
export function seedHistoryWorkspace(context, { indicators = [] } = {}) {
  return context.addInitScript(
    ({ panel, indicators: seededIndicators }) => {
      if (sessionStorage.getItem('history-264-seeded') === '1') return
      localStorage.clear()
      localStorage.setItem(
        '0xdeck-workspace',
        JSON.stringify({
          activePanels: [panel],
          layout: [{ i: panel, x: 0, y: 0, w: 36, h: 46, minW: 9, minH: 10 }],
          gridVersion: 3,
        }),
      )
      localStorage.setItem('0xdeck-widget-market-intervals', JSON.stringify({ [panel]: '1m' }))
      localStorage.setItem('0xdeck-widget-market-exchanges', JSON.stringify({ [panel]: 'binance' }))
      localStorage.setItem(
        '0xdeck-widget-market-indicators',
        JSON.stringify({ [panel]: seededIndicators }),
      )
      sessionStorage.setItem('history-264-seeded', '1')
    },
    { panel: HISTORY_PANEL, indicators },
  )
}

/**
 * Replaces the shared mock's market routes (register after `mockApi`): the same
 * 750-bar context and 500-bar history pages the backend serves. Records every
 * requested page cursor in `requestLog` as `history:<before>`.
 */
export async function mockHistoryMarket(page, requestLog) {
  await page.route(
    (url) => url.pathname.includes('/klines/'),
    async (route) => {
      const url = new URL(route.request().url())
      const interval = url.searchParams.get('interval') ?? '1m'
      let candles = historyContextCandles()
      if (url.pathname.endsWith('/history')) {
        const before = Number(url.searchParams.get('before'))
        requestLog.set(`history:${before}`, (requestLog.get(`history:${before}`) ?? 0) + 1)
        candles = historyPageCandles(before)
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify(historyMarketResponse(interval, candles)),
      })
    },
  )
}
