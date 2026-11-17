import { expect, test } from '@playwright/test'

/**
 * Network hygiene for the BTC Perp chart (Issue #238).
 *
 * Measured on `main` before this spec existed: two panels on the same symbol +
 * interval opened two `kline` and two `liquidations` sockets, requested the same
 * `daily-context` twice, and every pan/zoom restarted the
 * `liquidations/history` walk from the newest cursor (38 requests for one page
 * load with a handful of pans, with the real 12-page cap; the three-page fixture
 * below produces proportionally fewer).
 *
 * The backend is mocked so the assertions are about the browser's request
 * behaviour, never about collected data.
 */
const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
/** Fixed, bar-aligned "now" so the fixture never depends on the wall clock. */
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const PANEL_A = 'btc-perpetual-chart-aaa111'
const PANEL_B = 'btc-perpetual-chart-bbb222'

function candles(count: number, beforeSeconds?: number) {
  const lastOpen = beforeSeconds === undefined ? NOW_SECONDS : beforeSeconds - BAR_SECONDS
  return Array.from({ length: count }, (_, index) => {
    const time = lastOpen - (count - 1 - index) * BAR_SECONDS
    const close = 80_000 + (index % 50)
    return {
      symbol: 'BTCUSDT',
      interval: INTERVAL,
      time,
      open: close - 10,
      high: close + 20,
      low: close - 30,
      close,
      volume: 12.5,
      closed: true,
    }
  })
}

function liquidationEvent(index: number, tradeTimeMs: number) {
  return {
    id: `evt-${index}`,
    exchange: 'binance',
    symbol: 'BTCUSDT',
    side: index % 2 === 0 ? 'long' : 'short',
    price: 80_000,
    quantity: 0.5,
    notional: 40_000,
    time: tradeTimeMs,
    trade_time: tradeTimeMs,
  }
}

const seedWorkspace = `(() => {
  localStorage.setItem('0xdeck-workspace', JSON.stringify({
    version: 2,
    activeWorkspaceId: 'ws-hygiene',
    workspaces: [{
      id: 'ws-hygiene',
      activePanels: ['${PANEL_A}', '${PANEL_B}'],
      layout: [
        { i: '${PANEL_A}', x: 0, y: 0, w: 18, h: 14, minW: 9, minH: 10 },
        { i: '${PANEL_B}', x: 18, y: 0, w: 18, h: 14, minW: 9, minH: 10 },
      ],
      gridVersion: 3,
    }],
  }))
  localStorage.setItem('0xdeck-widget-market-intervals', JSON.stringify({
    '${PANEL_A}': '${INTERVAL}',
    '${PANEL_B}': '${INTERVAL}',
  }))
  const indicators = ['aggregated-liquidations']
  localStorage.setItem('0xdeck-widget-market-indicators', JSON.stringify({
    '${PANEL_A}': indicators,
    '${PANEL_B}': indicators,
  }))
})()`

test('one subscription and one history walk per page', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(seedWorkspace)

  const marketRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/market/')) {
      marketRequests.push(url.replace(/^https?:\/\/[^/]+/, ''))
    }
  })

  // Count relay dials from the route itself: a mocked socket does not emit
  // `page.on('websocket')`. The route stays open and stays silent.
  const sockets: string[] = []
  await page.routeWebSocket(/\/api\/ws\//, (socket) => {
    sockets.push(socket.url().replace(/^ws:\/\/[^/]+/, ''))
  })

  // Match the API origin path only: a URL glob would also swallow
  //  module requests from the dev server.
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })

    if (path === '/api/health') {
      return json({ status: 'ok', parquet_folder: '/data' })
    }
    if (path.endsWith('/klines/daily-context')) {
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: INTERVAL,
        candles: candles(240),
        available_from: null,
      })
    }
    if (path.endsWith('/klines/history')) {
      const before = Number(url.searchParams.get('before') ?? NOW_SECONDS)
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: INTERVAL,
        candles: candles(240, before),
        available_from: null,
      })
    }
    if (path.endsWith('/liquidations/history')) {
      const beforeId = url.searchParams.get('before_id')
      // Three newest-first pages: the newest one has no cursor.
      if (beforeId === null) {
        return json({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          events: [liquidationEvent(1, NOW_SECONDS * 1000 - 60_000)],
          has_more: true,
          next_before: (NOW_SECONDS - 6 * 3600) * 1000,
          next_before_id: 'cursor-1',
        })
      }
      if (beforeId === 'cursor-1') {
        return json({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          events: [liquidationEvent(2, (NOW_SECONDS - 8 * 3600) * 1000)],
          has_more: true,
          next_before: (NOW_SECONDS - 20 * 3600) * 1000,
          next_before_id: 'cursor-2',
        })
      }
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        events: [liquidationEvent(3, (NOW_SECONDS - 30 * 3600) * 1000)],
        has_more: false,
        next_before: null,
        next_before_id: null,
      })
    }
    if (path.endsWith('/liquidations/buckets')) {
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: INTERVAL,
        buckets: [],
        truncated: false,
      })
    }
    return route.fulfill({ status: 503, body: 'not mocked' })
  })

  await page.goto('/')
  const charts = page.getByTestId('btc-perp-chart')
  await expect(charts.first()).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
  await expect(charts.nth(1)).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
  await page.waitForTimeout(1_500)

  const socketsPerChannel = (channel: string) =>
    sockets.filter((url) => url.endsWith(channel)).length

  // One subscription per relay channel, however many panels render it.
  expect(socketsPerChannel(`kline.${INTERVAL}`)).toBe(1)
  expect(socketsPerChannel('liquidations')).toBe(1)

  // One daily context read for the interval (both panels share it).
  expect(
    marketRequests.filter((url) => url.includes('/klines/daily-context')),
  ).toHaveLength(1)

  const requestCount = () => marketRequests.length

  // Pan and zoom both charts: the loaded range grows, the walk must not restart.
  for (const chart of [charts.first(), charts.nth(1)]) {
    const box = await chart.boundingBox()
    expect(box).not.toBeNull()
    if (!box) continue
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    for (let index = 0; index < 4; index += 1) {
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + 280, cy, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(400)
    }
    for (let index = 0; index < 2; index += 1) {
      await page.mouse.move(cx, cy)
      await page.mouse.wheel(0, 320)
      await page.waitForTimeout(500)
    }
  }
  await page.waitForTimeout(1_500)

  const historyUrls = marketRequests.filter((url) =>
    url.includes('/liquidations/history'),
  )
  const cursored = historyUrls.filter((url) => url.includes('before_id='))
  const uniqueCursored = new Set(cursored)
  // A restarted walk re-requests the identical cursor pages; a resumed one does
  // not. That holds inside the page cache TTL only
  // (`AGGREGATED_LIQUIDATIONS_PAGE_CACHE_TTL_MS` in
  // `src/market/aggregatedLiquidationsHistory.ts`, 30 s): the pans above have to
  // finish well within it, so a machine slow enough to stretch this block past
  // 30 s can legitimately re-read a cursor page and fail here.
  expect(cursored.length).toBe(uniqueCursored.size)

  // Nothing above multiplied the request rate while the user panned.
  expect(requestCount()).toBeLessThan(40)

  // Printed so a local run (and the PR) carries the measured numbers.
  console.log(
    `[network hygiene] sockets=${sockets.length} ` +
      `liquidations/history=${historyUrls.length} ` +
      `cursored=${cursored.length} market requests=${requestCount()}`,
  )
})
