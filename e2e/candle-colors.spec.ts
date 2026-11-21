import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Browser regression for #249: one global Appearance menu with candle colors.
 *
 * The backend is mocked so the assertions are about the browser's own
 * behaviour: the shared dialog contract (Save vs Cancel/X/Esc/outside), the
 * palette + HEX picker, reset-without-save, global persistence, propagation to
 * both candle exchanges/workspaces/new panels, no history refetch or viewport
 * reset on Save, no click-through to an armed drawing tool, and a narrow
 * header. Candle series options are observed through the `data-candle-*`
 * attributes the chart publishes from `series.options()` — not through storage
 * alone, because the chart body is canvas-only.
 */

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const PANEL_BINANCE = 'btc-perpetual-chart-binance249'
const PANEL_HYPERLIQUID = 'btc-perpetual-chart-hyper249'
const PANEL_WORKSPACE_2 = 'btc-perpetual-chart-ws2249'
const CANDLE_COLORS_STORAGE_KEY = '0xdeck-candle-colors'
const RECTANGLE_STORAGE_KEY = '0xdeck-widget-rectangle-instances'

function candles(
  count: number,
  exchange: 'binance' | 'hyperliquid',
  interval: string,
  beforeSeconds?: number,
) {
  const symbol = exchange === 'hyperliquid' ? 'BTC' : 'BTCUSDT'
  const lastOpen = beforeSeconds === undefined ? NOW_SECONDS : beforeSeconds - BAR_SECONDS
  return Array.from({ length: count }, (_, index) => {
    const time = lastOpen - (count - 1 - index) * BAR_SECONDS
    const close = 80_000 + (index % 50)
    return {
      symbol,
      interval,
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

type SeedWorkspaces = {
  activeWorkspaceId: string
  workspaces: Array<{ id: string; panelIds: string[]; panelHeight?: number }>
  exchanges: Record<string, 'binance' | 'hyperliquid'>
}

function workspacePayload(seed: SeedWorkspaces) {
  return {
    version: 2,
    activeWorkspaceId: seed.activeWorkspaceId,
    workspaces: seed.workspaces.map((workspace) => ({
      id: workspace.id,
      activePanels: workspace.panelIds,
      layout: workspace.panelIds.map((panelId, index) => ({
        i: panelId,
        x: index * 18,
        y: 0,
        w: 18,
        h: workspace.panelHeight ?? 16,
      })),
      gridVersion: 3,
    })),
  }
}

async function seedWorkspace(page: Page, seed: SeedWorkspaces) {
  await page.addInitScript(
    ({ workspace, exchanges, interval }) => {
      window.localStorage.setItem('0xdeck-workspace', JSON.stringify(workspace))
      window.localStorage.setItem(
        '0xdeck-widget-market-exchanges',
        JSON.stringify(exchanges),
      )
      window.localStorage.setItem(
        '0xdeck-widget-market-intervals',
        JSON.stringify(
          Object.fromEntries(Object.keys(exchanges).map((panelId) => [panelId, interval])),
        ),
      )
    },
    { workspace: workspacePayload(seed), exchanges: seed.exchanges, interval: INTERVAL },
  )
}

async function mockMarket(page: Page, marketRequests: string[]) {
  await page.routeWebSocket(/\/api\/ws\//, () => {
    // Silent relay sockets: candles come from the mocked REST history below.
  })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const exchange = path.includes('/hyperliquid/') ? 'hyperliquid' : 'binance'
    const symbol = exchange === 'hyperliquid' ? 'BTC' : 'BTCUSDT'
    // A panel created from the Widgets menu starts on the default 1m interval.
    const responseInterval = url.searchParams.get('interval') ?? INTERVAL
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/api/health') return json({ status: 'ok', parquet_folder: '/data' })
    if (path.endsWith('/klines/daily-context')) {
      marketRequests.push(path)
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(300, exchange, responseInterval),
        available_from: null,
      })
    }
    if (path.endsWith('/klines/history')) {
      marketRequests.push(path)
      const before = Number(url.searchParams.get('before') ?? NOW_SECONDS)
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(240, exchange, responseInterval, before),
        available_from: null,
      })
    }
    if (path.endsWith('/klines')) {
      marketRequests.push(path)
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(300, exchange, responseInterval),
        available_from: null,
      })
    }
    return route.fulfill({ status: 503, body: 'not mocked' })
  })
}

function chart(page: Page, panelId: string): Locator {
  return page.locator(`[data-panel-id="${panelId}"]`)
}

function appearanceTrigger(page: Page): Locator {
  return page.getByRole('button', { name: 'Appearance' })
}

function colorPopover(page: Page): Locator {
  return page.locator('[data-slot="popover-content"]')
}

async function expectAppliedCandleColors(
  page: Page,
  panelId: string,
  rising: string,
  falling: string,
) {
  const locator = chart(page, panelId)
  await expect(locator).toHaveAttribute('data-candle-rising-color', rising)
  await expect(locator).toHaveAttribute('data-candle-falling-color', falling)
  await expect(locator).toHaveAttribute('data-candle-rising-wick-color', rising)
  await expect(locator).toHaveAttribute('data-candle-falling-wick-color', falling)
  await expect(locator).toHaveAttribute('data-candle-rising-border-color', rising)
  await expect(locator).toHaveAttribute('data-candle-falling-border-color', falling)
  await expect(locator).toHaveAttribute('data-candle-border-visible', 'false')
}

async function waitForChart(page: Page, panelId: string) {
  await expect(chart(page, panelId)).toHaveAttribute('aria-hidden', 'false', {
    timeout: 60_000,
  })
}

async function openCandleColorsDialog(page: Page) {
  await appearanceTrigger(page).click()
  await expect(page.getByRole('menuitem', { name: 'Candle colors' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Candle colors' }).click()
  const dialog = page.getByRole('dialog', { name: 'Candle colors' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function readStoredCandleColors(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as unknown)
  }, CANDLE_COLORS_STORAGE_KEY)
}

/** The time-axis strip is unaffected by candle colors; a viewport reset changes it. */
async function timeAxisScreenshot(page: Page, panelId: string): Promise<Buffer> {
  const box = await chart(page, panelId).boundingBox()
  if (!box) throw new Error('chart has no bounding box')
  await page.mouse.move(2, 2)
  await page.waitForTimeout(150)
  return page.screenshot({
    clip: {
      x: Math.round(box.x),
      y: Math.round(box.y + box.height - 24),
      width: Math.round(box.width),
      height: 24,
    },
  })
}

test.describe('global candle colors (#249)', () => {
  test('saves palette and HEX colors globally, applies them in place and survives reload', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const marketRequests: string[] = []
    await seedWorkspace(page, {
      activeWorkspaceId: 'ws-main',
      workspaces: [{ id: 'ws-main', panelIds: [PANEL_BINANCE, PANEL_HYPERLIQUID] }],
      exchanges: { [PANEL_BINANCE]: 'binance', [PANEL_HYPERLIQUID]: 'hyperliquid' },
    })
    await mockMarket(page, marketRequests)
    await page.goto('/')
    await waitForChart(page, PANEL_BINANCE)
    await waitForChart(page, PANEL_HYPERLIQUID)

    // Defaults are still the existing pair on both exchanges, with the border hidden.
    await expectAppliedCandleColors(page, PANEL_BINANCE, '#DBDBDB', '#808080')
    await expectAppliedCandleColors(page, PANEL_HYPERLIQUID, '#DBDBDB', '#808080')

    // Zoom one panel so a recreated chart/reset viewport is observable in the time axis.
    const binanceBox = await chart(page, PANEL_BINANCE).boundingBox()
    if (!binanceBox) throw new Error('chart has no bounding box')
    await page.mouse.move(
      binanceBox.x + binanceBox.width / 2,
      binanceBox.y + binanceBox.height / 2,
    )
    await page.mouse.wheel(0, -320)
    await page.waitForTimeout(500)
    const axisBeforeSave = await timeAxisScreenshot(page, PANEL_BINANCE)
    const requestsBeforeSave = marketRequests.length

    const dialog = await openCandleColorsDialog(page)
    // The shared dialog shell, but a color-only surface: no opacity slider.
    await expect(dialog.getByRole('slider')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Reset' })).toBeVisible()

    // Rising uses the shared palette (Blue base = #2563EB).
    await page.locator('#candle-color-rising').click()
    await expect(colorPopover(page)).toBeVisible()
    await expect(colorPopover(page).getByRole('gridcell', { name: 'Gray 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await colorPopover(page).getByRole('gridcell', { name: 'Blue base' }).click()
    await page.keyboard.press('Escape')
    await expect(colorPopover(page)).toHaveCount(0)

    // Falling uses the same picker's custom HEX input.
    await page.locator('#candle-color-falling').click()
    await expect(colorPopover(page)).toBeVisible()
    await colorPopover(page).getByRole('button', { name: 'Custom HEX' }).click()
    await page.locator('#candle-color-falling-custom').fill('#0a0b0c')
    await page.locator('#candle-color-falling-custom').press('Enter')
    await page.keyboard.press('Escape')
    await expect(colorPopover(page)).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(appearanceTrigger(page)).toBeFocused()

    // The global record is written once; both panels update without a reload.
    expect(await readStoredCandleColors(page)).toEqual({
      rising: '#2563EB',
      falling: '#0A0B0C',
    })
    await expectAppliedCandleColors(page, PANEL_BINANCE, '#2563EB', '#0A0B0C')
    await expectAppliedCandleColors(page, PANEL_HYPERLIQUID, '#2563EB', '#0A0B0C')

    // Save is an in-place series update: no history/context refetch and the zoomed viewport stays.
    await page.waitForTimeout(600)
    expect(marketRequests.length).toBe(requestsBeforeSave)
    expect((await timeAxisScreenshot(page, PANEL_BINANCE)).equals(axisBeforeSave)).toBe(true)

    // Reload restores the global preference for both candle exchanges.
    await page.reload()
    await waitForChart(page, PANEL_BINANCE)
    await waitForChart(page, PANEL_HYPERLIQUID)
    await expectAppliedCandleColors(page, PANEL_BINANCE, '#2563EB', '#0A0B0C')
    await expectAppliedCandleColors(page, PANEL_HYPERLIQUID, '#2563EB', '#0A0B0C')

    // A theme switch never resets or rewrites the global candle preference.
    await page.getByRole('button', { name: 'Tema seç' }).click()
    await page.getByRole('menuitemradio', { name: 'Black' }).click()
    await expectAppliedCandleColors(page, PANEL_BINANCE, '#2563EB', '#0A0B0C')
    await expectAppliedCandleColors(page, PANEL_HYPERLIQUID, '#2563EB', '#0A0B0C')
    expect(await readStoredCandleColors(page)).toEqual({
      rising: '#2563EB',
      falling: '#0A0B0C',
    })

    // Cancel, Esc and outside click all discard; Reset only edits the draft.
    let reopened = await openCandleColorsDialog(page)
    await page.locator('#candle-color-rising').click()
    await expect(colorPopover(page)).toBeVisible()
    await colorPopover(page).getByRole('gridcell', { name: 'Red base' }).click()
    await page.keyboard.press('Escape')
    await reopened.getByRole('button', { name: 'Cancel' }).click()
    await expect(reopened).toHaveCount(0)
    expect(await readStoredCandleColors(page)).toEqual({
      rising: '#2563EB',
      falling: '#0A0B0C',
    })
    await expectAppliedCandleColors(page, PANEL_BINANCE, '#2563EB', '#0A0B0C')

    reopened = await openCandleColorsDialog(page)
    await page.keyboard.press('Escape')
    await expect(reopened).toHaveCount(0)
    await expect(appearanceTrigger(page)).toBeFocused()
    expect(await readStoredCandleColors(page)).toEqual({
      rising: '#2563EB',
      falling: '#0A0B0C',
    })

    reopened = await openCandleColorsDialog(page)
    await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 20, y: 20 } })
    await expect(reopened).toHaveCount(0)
    expect(await readStoredCandleColors(page)).toEqual({
      rising: '#2563EB',
      falling: '#0A0B0C',
    })

    // Reset shows the built-in pair in the draft but needs Save.
    reopened = await openCandleColorsDialog(page)
    await reopened.getByRole('button', { name: 'Reset' }).click()
    await page.locator('#candle-color-rising').click()
    await expect(colorPopover(page).getByRole('gridcell', { name: 'Gray 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.keyboard.press('Escape')
    await page.locator('#candle-color-falling').click()
    await expect(colorPopover(page).getByRole('gridcell', { name: 'Gray 5' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.keyboard.press('Escape')
    await reopened.getByRole('button', { name: 'Cancel' }).click()
    expect(await readStoredCandleColors(page)).toEqual({
      rising: '#2563EB',
      falling: '#0A0B0C',
    })

    reopened = await openCandleColorsDialog(page)
    await reopened.getByRole('button', { name: 'Reset' }).click()
    await reopened.getByRole('button', { name: 'Save' }).click()
    await expect(reopened).toHaveCount(0)
    expect(await readStoredCandleColors(page)).toEqual({
      rising: '#DBDBDB',
      falling: '#808080',
    })
    await expectAppliedCandleColors(page, PANEL_BINANCE, '#DBDBDB', '#808080')
    await expectAppliedCandleColors(page, PANEL_HYPERLIQUID, '#DBDBDB', '#808080')
  })

  test('reaches every workspace and a newly added panel', async ({ page }) => {
    test.setTimeout(120_000)
    await seedWorkspace(page, {
      activeWorkspaceId: 'ws-1',
      workspaces: [
        { id: 'ws-1', panelIds: [PANEL_BINANCE] },
        { id: 'ws-2', panelIds: [PANEL_WORKSPACE_2] },
      ],
      exchanges: { [PANEL_BINANCE]: 'binance', [PANEL_WORKSPACE_2]: 'hyperliquid' },
    })
    await mockMarket(page, [])
    await page.goto('/')
    await waitForChart(page, PANEL_BINANCE)

    const dialog = await openCandleColorsDialog(page)
    await page.locator('#candle-color-rising').click()
    await colorPopover(page).getByRole('gridcell', { name: 'Blue base' }).click()
    await page.keyboard.press('Escape')
    await page.locator('#candle-color-falling').click()
    await colorPopover(page).getByRole('gridcell', { name: 'Red base' }).click()
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    // The other workspace's panel applies the same global preference after a switch.
    await page.getByRole('button', { name: 'Workspace 2', exact: true }).click()
    await waitForChart(page, PANEL_WORKSPACE_2)
    await expectAppliedCandleColors(page, PANEL_WORKSPACE_2, '#2563EB', '#D15F5B')

    // A new panel starts with the same global preference, no per-panel setup.
    await page.getByRole('button', { name: 'Widget ekle' }).click()
    await page.getByRole('menuitem', { name: 'BTC Perp' }).click()
    await expect(page.getByTestId('btc-perp-chart')).toHaveCount(2)
    const newChart = page.getByTestId('btc-perp-chart').nth(1)
    await expect(newChart).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
    await expect(newChart).toHaveAttribute('data-candle-rising-color', '#2563EB')
    await expect(newChart).toHaveAttribute('data-candle-falling-color', '#D15F5B')

    // Switching back shows the original panel with the same colors.
    await page.getByRole('button', { name: 'Workspace 1', exact: true }).click()
    await waitForChart(page, PANEL_BINANCE)
    await expectAppliedCandleColors(page, PANEL_BINANCE, '#2563EB', '#D15F5B')
  })

  test('an outside press cannot click through to an armed drawing tool', async ({ page }) => {
    test.setTimeout(120_000)
    await seedWorkspace(page, {
      activeWorkspaceId: 'ws-clickthrough',
      workspaces: [{ id: 'ws-clickthrough', panelIds: [PANEL_BINANCE], panelHeight: 40 }],
      exchanges: { [PANEL_BINANCE]: 'binance' },
    })
    await mockMarket(page, [])
    await page.goto('/')
    await waitForChart(page, PANEL_BINANCE)

    // Arm a rectangle, then dismiss the Appearance dialog on the transparent overlay
    // over the chart. The press must never reach the candle pane and create geometry.
    await page.locator(`#${PANEL_BINANCE}-tools`).click()
    await page.getByRole('menuitem', { name: 'Rectangle / Box' }).click()
    const dialog = await openCandleColorsDialog(page)
    await page.mouse.move(100, 350)
    await page.mouse.down()
    await page.mouse.move(260, 430, { steps: 8 })
    await page.mouse.up()
    await expect(dialog).toHaveCount(0)

    const rectangles = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      RECTANGLE_STORAGE_KEY,
    )
    expect(rectangles).toBeNull()
  })

  test('the Appearance control stays reachable at a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.addInitScript(() => {
      window.localStorage.setItem(
        '0xdeck-workspace',
        JSON.stringify({
          version: 2,
          activeWorkspaceId: 'ws-notes',
          workspaces: [
            { id: 'ws-notes', activePanels: ['notes-candle'], layout: [], gridVersion: 3 },
          ],
        }),
      )
    })
    await page.goto('/')

    const trigger = appearanceTrigger(page)
    await expect(trigger).toBeVisible()
    const box = await trigger.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.x ?? 0) >= 0).toBe(true)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375)
    await trigger.click()
    await expect(page.getByRole('menuitem', { name: 'Candle colors' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Candle colors' }).click()
    const dialog = page.getByRole('dialog', { name: 'Candle colors' })
    await expect(dialog).toBeVisible()
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect((dialogBox?.x ?? 0) >= 0).toBe(true)
    expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(375)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})
