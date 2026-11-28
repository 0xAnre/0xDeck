import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Browser coverage for the live liquidation-level profile on the real BTC Perp
 * chart.
 *
 * Candles are mocked (deterministic klines over a wide price band) so the exact
 * price-scale assertions are reproducible; the liquidation feed is the **real**
 * public MarketLens Hyperliquid L4 stream, because it is the feature's actual
 * data source. Candle colours stay at their defaults, so a green/red pixel in
 * the right column can only come from the profile (or position markers, which
 * the before/after delta cancels out).
 */

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const PANEL_A = 'btc-perpetual-chart-liq280a'
const PANEL_B = 'btc-perpetual-chart-liq280b'
const INDICATORS_KEY = '0xdeck-widget-market-indicators'
const SETTINGS_KEY = '0xdeck-widget-liquidation-levels-settings'

type Seed = {
  panels: string[]
  exchanges: Record<string, 'binance' | 'hyperliquid'>
}

function candles(count: number, exchange: 'binance' | 'hyperliquid', interval: string) {
  const symbol = exchange === 'hyperliquid' ? 'BTC' : 'BTCUSDT'
  return Array.from({ length: count }, (_, index) => {
    const time = NOW_SECONDS - (count - 1 - index) * BAR_SECONDS
    // A deliberately wide band: the current profile then covers the real
    // liquidation-price book instead of a few dollars around one price.
    const centre = 100_000 + Math.sin(index / 6) * 2_000
    return {
      symbol,
      interval,
      time,
      open: centre - 300,
      // A wide band so the current profile covers the whole real book instead
      // of a few dollars around one mocked price.
      high: 200_000,
      low: 20_000,
      close: centre + 200,
      volume: 12.5,
      closed: true,
    }
  })
}

async function seedWorkspace(page: Page, seed: Seed) {
  await page.addInitScript(
    ({ panels, exchanges, interval }) => {
      window.localStorage.setItem(
        '0xdeck-workspace',
        JSON.stringify({
          version: 2,
          activeWorkspaceId: 'ws-main',
          workspaces: [
            {
              id: 'ws-main',
              activePanels: panels,
              layout: panels.map((panelId, index) => ({
                i: panelId,
                x: index * 18,
                y: 0,
                w: 18,
                h: 26,
              })),
              gridVersion: 3,
            },
          ],
        }),
      )
      window.localStorage.setItem('0xdeck-widget-market-exchanges', JSON.stringify(exchanges))
      window.localStorage.setItem(
        '0xdeck-widget-market-intervals',
        JSON.stringify(Object.fromEntries(panels.map((panelId) => [panelId, interval]))),
      )
    },
    { panels: seed.panels, exchanges: seed.exchanges, interval: INTERVAL },
  )
}

async function mockMarket(page: Page) {
  await page.routeWebSocket(/\/api\/ws\//, () => {
    // Silent relay sockets: candles come from the mocked REST klines below.
  })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const exchange = path.includes('/hyperliquid/') ? 'hyperliquid' : 'binance'
    const symbol = exchange === 'hyperliquid' ? 'BTC' : 'BTCUSDT'
    const responseInterval = url.searchParams.get('interval') ?? INTERVAL
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/health') return json({ status: 'ok', parquet_folder: '/data' })
    if (path.endsWith('/klines/daily-context')) {
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(48, exchange, responseInterval),
        available_from: null,
      })
    }
    if (path.endsWith('/klines/history')) {
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(48, exchange, responseInterval),
        available_from: null,
      })
    }
    if (path.endsWith('/klines')) {
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(160, exchange, responseInterval),
        available_from: null,
      })
    }
    return route.fulfill({ status: 503, body: 'not mocked' })
  })
}

function chartBody(page: Page, panelId: string): Locator {
  return page.locator(`[data-panel-id="${panelId}"]`)
}

async function waitForChart(page: Page, panelId: string) {
  await expect(chartBody(page, panelId)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(`[data-panel-id="${panelId}"] canvas`).first()).toBeVisible({
    timeout: 30_000,
  })
}

async function openIndicators(page: Page, panelId: string) {
  await page.locator(`#${panelId}-indicators`).click()
}

function indicatorRow(page: Page, label: string): Locator {
  return page
    .getByRole('menu')
    .getByText(label, { exact: true })
    .locator('xpath=../..')
}

async function toggleIndicator(page: Page, panelId: string, label: string) {
  await openIndicators(page, panelId)
  const row = indicatorRow(page, label)
  await expect(row).toBeVisible()
  await row.getByRole('menuitem', { name: /Show object|Hide object/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
}

async function liquidationLevelsEnabled(page: Page, panelId: string): Promise<boolean> {
  return (await chartBody(page, panelId).getAttribute('data-liquidation-levels-phase')) !== null
}

async function waitForLiveProfile(page: Page, panelId: string) {
  const body = chartBody(page, panelId)
  await expect
    .poll(() => body.getAttribute('data-liquidation-levels-phase'), { timeout: 60_000 })
    .toBe('live')
  await expect
    .poll(() => body.getAttribute('data-liquidation-levels-positions'), { timeout: 60_000 })
    .not.toBeNull()
}

async function readSeq(page: Page, panelId: string): Promise<number | null> {
  const raw = await chartBody(page, panelId).getAttribute('data-liquidation-levels-seq')
  return raw === null ? null : Number(raw)
}

/** Green/red pixel counts in the right-hand profile column of the candle pane. */
async function profilePixels(page: Page, panelId: string) {
  return page.evaluate((id) => {
    const panel = document.querySelector(`[data-panel-id="${id}"]`)
    if (!panel) return { green: 0, red: 0 }
    let green = 0
    let red = 0
    for (const canvas of Array.from(panel.querySelectorAll('canvas'))) {
      const context = canvas.getContext('2d')
      if (!context || canvas.width < 200) continue
      const width = Math.min(260, Math.floor(canvas.width / 3))
      const data = context.getImageData(canvas.width - width, 0, width, canvas.height).data
      for (let index = 0; index < data.length; index += 4) {
        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]
        const a = data[index + 3]
        if (a < 40) continue
        if (g > 90 && g - r > 25 && g - b > 25) green += 1
        if (r > 90 && r - g > 25 && r - b > 25) red += 1
      }
    }
    return { green, red }
  }, panelId)
}

async function hoverProfile(page: Page, panelId: string): Promise<boolean> {
  // The pane element includes the right price scale, so probe inside the plot
  // canvas itself (the widest canvas of the chart).
  const plot = await page.evaluate((id) => {
    const panel = document.querySelector(`[data-panel-id="${id}"]`)
    if (!panel) return null
    const widest = Array.from(panel.querySelectorAll('canvas'))
      .map((canvas) => canvas.getBoundingClientRect())
      .filter((rect) => rect.width > 200 && rect.height > 100)
      .sort((a, b) => b.width - a.width)[0]
    return widest
      ? { left: widest.left, right: widest.right, top: widest.top, bottom: widest.bottom }
      : null
  }, panelId)
  if (!plot) return false
  const readout = page.getByTestId('liquidation-levels-readout')
  // Bars are anchored to the plot's right edge and reach 25% left by default.
  for (const inset of [6, 18, 30, 42, 54, 66, 78, 90, 102, 114]) {
    const x = plot.right - inset
    for (let y = plot.top + 6; y < plot.bottom - 6; y += 4) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(25)
      if (await readout.isVisible().catch(() => false)) return true
    }
  }
  return false
}

test.describe('live liquidation levels on the Perp chart', () => {
  test.setTimeout(240_000)

  test('opts in on Hyperliquid with one real shared socket, and cleans up', async ({
    page,
  }) => {
    await seedWorkspace(page, {
      panels: [PANEL_A, PANEL_B],
      exchanges: { [PANEL_A]: 'hyperliquid', [PANEL_B]: 'hyperliquid' },
    })
    await mockMarket(page)

    const marketlensSockets: string[] = []
    const closed: string[] = []
    page.on('websocket', (socket) => {
      if (socket.url().includes('marketlens.app')) {
        marketlensSockets.push(socket.url())
        socket.on('close', () => closed.push(socket.url()))
      }
    })

    await page.goto('/')
    await waitForChart(page, PANEL_A)
    await waitForChart(page, PANEL_B)

    // Default off: no feed and no subscription state.
    expect(marketlensSockets).toHaveLength(0)
    expect(await liquidationLevelsEnabled(page, PANEL_A)).toBe(false)

    const before = await profilePixels(page, PANEL_A)

    await toggleIndicator(page, PANEL_A, 'Liquidation Levels')
    await waitForLiveProfile(page, PANEL_A)

    // Snapshot + deltas from the real public stream: the server sequence moves.
    const firstSeq = await readSeq(page, PANEL_A)
    expect(firstSeq).not.toBeNull()
    await expect
      .poll(async () => (await readSeq(page, PANEL_A)) !== firstSeq, { timeout: 30_000 })
      .toBe(true)
    const positions = Number(
      await chartBody(page, PANEL_A).getAttribute('data-liquidation-levels-positions'),
    )
    expect(positions).toBeGreaterThan(1000)

    // The chart really paints the profile: green and red ink in the right column.
    await page.waitForTimeout(500)
    const after = await profilePixels(page, PANEL_A)
    expect(after.green + after.red).toBeGreaterThan(before.green + before.red + 200)

    // Hover details come from the same live geometry.
    expect(await hoverProfile(page, PANEL_A)).toBe(true)
    const readout = page.getByTestId('liquidation-levels-readout')
    await expect(readout).toContainText('current open positions')
    await expect(readout).toContainText('Long')
    await expect(readout).toContainText('Short')
    await expect(readout).toContainText('MarketLens Hyperliquid L4')
    await page.mouse.move(2, 2)

    // A second enabled panel joins the same socket instead of dialing another.
    await toggleIndicator(page, PANEL_B, 'Liquidation Levels')
    await waitForLiveProfile(page, PANEL_B)
    expect(marketlensSockets).toHaveLength(1)

    // Panel settings are per panel and persist through the shared storage.
    await openIndicators(page, PANEL_A)
    await indicatorRow(page, 'Liquidation Levels')
      .getByRole('menuitem', { name: 'Liquidation Levels settings' })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Liquidation Levels settings' })
    await expect(dialog).toBeVisible()
    await dialog.locator('#liquidation-levels-max-width').fill('45')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    const storedSettings = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>)
    }, SETTINGS_KEY)
    expect(storedSettings).not.toBeNull()
    expect((storedSettings as Record<string, { maxWidthPercent: number }>)[PANEL_A].maxWidthPercent).toBe(45)
    expect((storedSettings as Record<string, { maxWidthPercent: number }>)[PANEL_B]).toBeUndefined()

    const storedIndicators = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw === null ? null : (JSON.parse(raw) as Record<string, string[]>)
    }, INDICATORS_KEY)
    expect(storedIndicators?.[PANEL_A]).toContain('liquidation-levels')
    expect(storedIndicators?.[PANEL_B]).toContain('liquidation-levels')

    // Reload: both panels restore the opt-in, one socket again, settings kept.
    await page.reload()
    await waitForChart(page, PANEL_A)
    await waitForChart(page, PANEL_B)
    await waitForLiveProfile(page, PANEL_A)
    await waitForLiveProfile(page, PANEL_B)
    expect(marketlensSockets).toHaveLength(2)
    expect(await readSeq(page, PANEL_A)).not.toBeNull()

    // Disabling one panel keeps the shared feed alive for the other.
    await toggleIndicator(page, PANEL_B, 'Liquidation Levels')
    expect(await liquidationLevelsEnabled(page, PANEL_B)).toBe(false)
    expect(await liquidationLevelsEnabled(page, PANEL_A)).toBe(true)
    expect(closed).toHaveLength(0)

    // Disabling the last consumer closes the socket.
    await toggleIndicator(page, PANEL_A, 'Liquidation Levels')
    await expect.poll(() => closed.length, { timeout: 30_000 }).toBeGreaterThan(0)
    expect(await liquidationLevelsEnabled(page, PANEL_A)).toBe(false)
  })

  test('is explicitly unavailable on Binance and never borrows its data', async ({ page }) => {
    await seedWorkspace(page, {
      panels: [PANEL_A],
      exchanges: { [PANEL_A]: 'binance' },
    })
    await mockMarket(page)

    let marketlensSockets = 0
    page.on('websocket', (socket) => {
      if (socket.url().includes('marketlens.app')) marketlensSockets += 1
    })

    await page.goto('/')
    await waitForChart(page, PANEL_A)

    await openIndicators(page, PANEL_A)
    const row = indicatorRow(page, 'Liquidation Levels · Hyperliquid only')
    await expect(row).toBeVisible()
    const toggle = row.getByRole('menuitem', { name: /Show object|Hide object/ })
    await expect(toggle).toBeDisabled()
    await page.keyboard.press('Escape')

    expect(marketlensSockets).toBe(0)

    // A panel moved off Hyperliquid while the indicator is on says so instead
    // of drawing a profile that belongs to another exchange.
    await page.evaluate((key) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ 'btc-perpetual-chart-liq280a': ['liquidation-levels'] }),
      )
    }, INDICATORS_KEY)
    await page.reload()
    await waitForChart(page, PANEL_A)
    await expect(page.getByRole('status').first()).toContainText('Hyperliquid BTC only')
    expect(marketlensSockets).toBe(0)
  })
})
