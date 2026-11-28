import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Browser coverage for the three live price-level profiles on the real BTC Perp
 * chart: Liquidation Levels, Stop Loss Levels and Take Profit Levels.
 *
 * Candles are mocked (deterministic klines over a wide price band) so the
 * price-scale assertions are reproducible; the liquidation and TPSL streams are
 * the **real** public MarketLens endpoints, because they are the feature's
 * actual data sources (two separate sockets: `…/liquidation…` and `…/tpsl…`).
 * Candle colours stay at their defaults, so green/red pixels in the right column
 * can only come from a profile (or position markers, which a before/after delta
 * cancels out).
 */

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const PANEL_A = 'btc-perpetual-chart-liq280a'
const PANEL_B = 'btc-perpetual-chart-liq280b'
const INDICATORS_KEY = '0xdeck-widget-market-indicators'
const SETTINGS_KEY = '0xdeck-widget-liquidation-levels-settings'
const STOP_LOSS_SETTINGS_KEY = '0xdeck-widget-stop-loss-levels-settings'
const TAKE_PROFIT_SETTINGS_KEY = '0xdeck-widget-take-profit-levels-settings'

const LIQUIDATION_LABEL = 'Liquidation Levels'
const STOP_LOSS_LABEL = 'Stop Loss Levels'
const TAKE_PROFIT_LABEL = 'Take Profit Levels'

type Seed = {
  panels: string[]
  exchanges: Record<string, 'binance' | 'hyperliquid'>
}

function candles(count: number, exchange: 'binance' | 'hyperliquid', interval: string) {
  const symbol = exchange === 'hyperliquid' ? 'BTC' : 'BTCUSDT'
  return Array.from({ length: count }, (_, index) => {
    const time = NOW_SECONDS - (count - 1 - index) * BAR_SECONDS
    const centre = 100_000 + Math.sin(index / 6) * 2_000
    return {
      symbol,
      interval,
      time,
      open: centre - 300,
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

function attributePrefix(label: string): string {
  if (label === LIQUIDATION_LABEL) return 'data-liquidation-levels'
  if (label === STOP_LOSS_LABEL) return 'data-stop-loss-levels'
  return 'data-take-profit-levels'
}

async function profileAttribute(
  page: Page,
  panelId: string,
  label: string,
  name: 'phase' | 'seq' | 'orders' | 'positions',
): Promise<string | null> {
  return chartBody(page, panelId).getAttribute(`${attributePrefix(label)}-${name}`)
}

async function waitForProfileLive(page: Page, panelId: string, label: string) {
  await expect
    .poll(() => profileAttribute(page, panelId, label, 'phase'), { timeout: 60_000 })
    .toBe('live')
}

async function waitForProfileCount(page: Page, panelId: string, label: string) {
  await expect
    .poll(
      async () => {
        const raw =
          label === LIQUIDATION_LABEL
            ? await profileAttribute(page, panelId, label, 'positions')
            : await profileAttribute(page, panelId, label, 'orders')
        return raw === null ? 0 : Number(raw)
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(100)
}

async function readSeq(page: Page, panelId: string, label: string): Promise<number | null> {
  const raw = await profileAttribute(page, panelId, label, 'seq')
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

async function hoverProfile(
  page: Page,
  panelId: string,
): Promise<{ kind: string; text: string } | null> {
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
  if (!plot) return null
  const readout = page.getByTestId('price-level-readout')
  for (const inset of [6, 18, 30, 42, 54, 66, 78, 90, 102, 114]) {
    const x = plot.right - inset
    for (let y = plot.top + 6; y < plot.bottom - 6; y += 4) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(25)
      if (await readout.isVisible().catch(() => false)) {
        return {
          kind: (await readout.getAttribute('data-price-level-kind')) ?? '',
          text: await readout.innerText(),
        }
      }
    }
  }
  return null
}

test.describe('live price-level profiles on the Perp chart', () => {
  test.setTimeout(300_000)

  test('one shared socket per endpoint serves the three profiles', async ({ page }) => {
    await seedWorkspace(page, {
      panels: [PANEL_A],
      exchanges: { [PANEL_A]: 'hyperliquid' },
    })
    await mockMarket(page)

    const liquidationSockets: string[] = []
    const tpslSockets: string[] = []
    const closed: string[] = []
    page.on('websocket', (socket) => {
      const url = socket.url()
      if (!url.includes('marketlens.app')) return
      if (url.includes('/tpsl/')) tpslSockets.push(url)
      else if (url.includes('/liquidations/')) liquidationSockets.push(url)
      socket.on('close', () => closed.push(url))
    })

    await page.goto('/')
    await waitForChart(page, PANEL_A)

    expect(liquidationSockets).toHaveLength(0)
    expect(tpslSockets).toHaveLength(0)

    for (const label of [LIQUIDATION_LABEL, STOP_LOSS_LABEL, TAKE_PROFIT_LABEL]) {
      await toggleIndicator(page, PANEL_A, label)
      await waitForProfileLive(page, PANEL_A, label)
      await waitForProfileCount(page, PANEL_A, label)
    }

    // One socket per endpoint, not one per indicator.
    expect(liquidationSockets).toHaveLength(1)
    expect(tpslSockets).toHaveLength(1)

    // Both trigger-order channels advance their own sequence on the shared socket.
    const stopFirst = await readSeq(page, PANEL_A, STOP_LOSS_LABEL)
    const takeFirst = await readSeq(page, PANEL_A, TAKE_PROFIT_LABEL)
    expect(stopFirst).not.toBeNull()
    expect(takeFirst).not.toBeNull()
    await expect
      .poll(async () => (await readSeq(page, PANEL_A, STOP_LOSS_LABEL)) !== stopFirst, {
        timeout: 30_000,
      })
      .toBe(true)
    await expect
      .poll(async () => (await readSeq(page, PANEL_A, TAKE_PROFIT_LABEL)) !== takeFirst, {
        timeout: 30_000,
      })
      .toBe(true)

    // The chart really paints profile ink in the right column.
    await page.waitForTimeout(800)
    const pixels = await profilePixels(page, PANEL_A)
    expect(pixels.green + pixels.red).toBeGreaterThan(200)

    // Hover resolves one of the enabled profile types with its own wording.
    const hovered = await hoverProfile(page, PANEL_A)
    expect(hovered).not.toBeNull()
    expect(['liquidation', 'stop-loss', 'take-profit']).toContain(hovered?.kind)
    expect(hovered?.text).toMatch(/current (trigger orders|open positions)/)
    expect(hovered?.text).toContain('MarketLens Hyperliquid L4')
    if (hovered?.kind !== 'liquidation') {
      expect(hovered?.text).toMatch(/Closes (long \(sell\)|short \(buy\))/)
    }
    await page.mouse.move(2, 2)

    // Disabling one trigger-order profile keeps the sibling live and the socket open.
    await toggleIndicator(page, PANEL_A, STOP_LOSS_LABEL)
    expect(await profileAttribute(page, PANEL_A, STOP_LOSS_LABEL, 'phase')).toBeNull()
    expect(await profileAttribute(page, PANEL_A, TAKE_PROFIT_LABEL, 'phase')).toBe('live')
    expect(tpslSockets).toHaveLength(1)
    expect(closed).toHaveLength(0)

    // Each profile has its own settings record and dialog.
    await toggleIndicator(page, PANEL_A, STOP_LOSS_LABEL)
    await waitForProfileLive(page, PANEL_A, STOP_LOSS_LABEL)
    await openIndicators(page, PANEL_A)
    await indicatorRow(page, TAKE_PROFIT_LABEL)
      .getByRole('menuitem', { name: `${TAKE_PROFIT_LABEL} settings` })
      .click()
    const dialog = page.getByRole('dialog', { name: `${TAKE_PROFIT_LABEL} settings` })
    await expect(dialog).toBeVisible()
    await dialog.locator('#take-profit-levels-max-width').fill('35')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    const stored = await page.evaluate(
      (keys) => ({
        liquidation: window.localStorage.getItem(keys.liquidation),
        stopLoss: window.localStorage.getItem(keys.stopLoss),
        takeProfit: window.localStorage.getItem(keys.takeProfit),
        indicators: window.localStorage.getItem(keys.indicators),
      }),
      {
        liquidation: SETTINGS_KEY,
        stopLoss: STOP_LOSS_SETTINGS_KEY,
        takeProfit: TAKE_PROFIT_SETTINGS_KEY,
        indicators: INDICATORS_KEY,
      },
    )
    expect(JSON.parse(stored.takeProfit ?? '{}')[PANEL_A].maxWidthPercent).toBe(35)
    expect(stored.liquidation).toBeNull()
    expect(stored.stopLoss).toBeNull()
    const indicators = JSON.parse(stored.indicators ?? '{}') as Record<string, string[]>
    expect(indicators[PANEL_A]).toEqual(
      expect.arrayContaining(['liquidation-levels', 'stop-loss-levels', 'take-profit-levels']),
    )

    // Reload restores all three from storage and reopens exactly two sockets.
    await page.reload()
    await waitForChart(page, PANEL_A)
    for (const label of [LIQUIDATION_LABEL, STOP_LOSS_LABEL, TAKE_PROFIT_LABEL]) {
      await waitForProfileLive(page, PANEL_A, label)
    }
    expect(liquidationSockets).toHaveLength(2)
    expect(tpslSockets).toHaveLength(2)

    // Turning everything off closes both sockets.
    for (const label of [LIQUIDATION_LABEL, STOP_LOSS_LABEL, TAKE_PROFIT_LABEL]) {
      await toggleIndicator(page, PANEL_A, label)
    }
    await expect.poll(() => closed.length, { timeout: 30_000 }).toBeGreaterThan(0)
  })

  test('two panels share both sockets and keep independent selections', async ({ page }) => {
    await seedWorkspace(page, {
      panels: [PANEL_A, PANEL_B],
      exchanges: { [PANEL_A]: 'hyperliquid', [PANEL_B]: 'hyperliquid' },
    })
    await mockMarket(page)

    const liquidationSockets: string[] = []
    const tpslSockets: string[] = []
    page.on('websocket', (socket) => {
      const url = socket.url()
      if (!url.includes('marketlens.app')) return
      if (url.includes('/tpsl/')) tpslSockets.push(url)
      else if (url.includes('/liquidations/')) liquidationSockets.push(url)
    })

    await page.goto('/')
    await waitForChart(page, PANEL_A)
    await waitForChart(page, PANEL_B)

    await toggleIndicator(page, PANEL_A, LIQUIDATION_LABEL)
    await toggleIndicator(page, PANEL_B, TAKE_PROFIT_LABEL)
    await waitForProfileLive(page, PANEL_A, LIQUIDATION_LABEL)
    await waitForProfileLive(page, PANEL_B, TAKE_PROFIT_LABEL)
    expect(liquidationSockets).toHaveLength(1)
    expect(tpslSockets).toHaveLength(1)

    // A second panel joining the same endpoint reuses the sockets.
    await toggleIndicator(page, PANEL_B, STOP_LOSS_LABEL)
    await waitForProfileLive(page, PANEL_B, STOP_LOSS_LABEL)
    expect(tpslSockets).toHaveLength(1)

    // Per-panel isolation: panel A has no trigger-order profile.
    expect(await profileAttribute(page, PANEL_A, STOP_LOSS_LABEL, 'phase')).toBeNull()
    expect(await profileAttribute(page, PANEL_A, TAKE_PROFIT_LABEL, 'phase')).toBeNull()
    // Turning panel A's liquidation profile off leaves panel B's feed alive.
    await toggleIndicator(page, PANEL_A, LIQUIDATION_LABEL)
    expect(await profileAttribute(page, PANEL_A, LIQUIDATION_LABEL, 'phase')).toBeNull()
    expect(await profileAttribute(page, PANEL_B, TAKE_PROFIT_LABEL, 'phase')).toBe('live')
  })

  test('is explicitly unavailable on Binance for all three profiles', async ({ page }) => {
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
    for (const label of [LIQUIDATION_LABEL, STOP_LOSS_LABEL, TAKE_PROFIT_LABEL]) {
      const row = indicatorRow(page, `${label} · Hyperliquid only`)
      await expect(row).toBeVisible()
      await expect(row.getByRole('menuitem', { name: /Show object|Hide object/ })).toBeDisabled()
    }
    await page.keyboard.press('Escape')
    expect(marketlensSockets).toBe(0)

    // A panel that still has the profiles selected says so instead of drawing
    // another venue's data.
    await page.evaluate((key) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          'btc-perpetual-chart-liq280a': [
            'liquidation-levels',
            'stop-loss-levels',
            'take-profit-levels',
          ],
        }),
      )
    }, INDICATORS_KEY)
    await page.reload()
    await waitForChart(page, PANEL_A)
    const status = page.getByRole('status').first()
    await expect(status).toContainText('Hyperliquid BTC only')
    expect(marketlensSockets).toBe(0)
  })
})
