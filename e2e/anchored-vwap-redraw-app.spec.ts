import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'

/**
 * Real-app regression for #258: the Anchored VWAP band fill must not keep the
 * chart repainting on its own, while every real user action and live tick still
 * paints.
 *
 * The backend is mocked (silent relay + fixed klines), the workspace is seeded
 * into an isolated browser context, and the only measurements are in-page
 * counters over fixed windows: animation frames, canvas clears inside the chart
 * and real anchored band fill paths. No wall-clock budget is asserted.
 */

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const PANEL_ID = 'btc-perpetual-chart-anch258'
const STORAGE_KEY = '0xdeck-widget-anchored-vwap-instances'
const HISTORY_BARS = 240

type AppCounters = { frames: number; clears: number; anchoredFills: number }
type AnchoredInstance = {
  id: string
  anchorTime: number
  hidden?: boolean
  settings: { band1: { fillOpacity: number } }
}

declare global {
  interface Window {
    __anchoredAppCounters: AppCounters
  }
}

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

async function seedWorkspace(page: Page): Promise<void> {
  await page.addInitScript(
    ({ panelId, interval, historyBars }) => {
      window.localStorage.setItem(
        '0xdeck-workspace',
        JSON.stringify({
          version: 2,
          activeWorkspaceId: 'ws-anchored',
          workspaces: [
            {
              id: 'ws-anchored',
              activePanels: [panelId],
              layout: [{ i: panelId, x: 0, y: 0, w: 24, h: 20 }],
              gridVersion: 3,
            },
          ],
        }),
      )
      window.localStorage.setItem(
        '0xdeck-widget-market-intervals',
        JSON.stringify({ [panelId]: interval }),
      )
      window.localStorage.setItem(
        '0xdeck-widget-market-exchanges',
        JSON.stringify({ [panelId]: 'binance' }),
      )
      void historyBars
    },
    { panelId: PANEL_ID, interval: INTERVAL, historyBars: HISTORY_BARS },
  )

  await page.addInitScript(() => {
    const counters: AppCounters = { frames: 0, clears: 0, anchoredFills: 0 }
    window.__anchoredAppCounters = counters
    const requestFrame = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      counters.frames += 1
      return requestFrame(callback)
    }
    const chartRoot = (): Element | null => document.querySelector('[data-testid="btc-perp-chart"]')
    const proto = CanvasRenderingContext2D.prototype
    const clearRect = proto.clearRect
    proto.clearRect = function (this: CanvasRenderingContext2D, ...args: unknown[]): void {
      const root = chartRoot()
      if (root?.contains(this.canvas) === true) counters.clears += 1
      ;(clearRect as (...values: unknown[]) => void).apply(this, args)
    }
    const fill = proto.fill
    proto.fill = function (this: CanvasRenderingContext2D, ...args: unknown[]): void {
      if (
        typeof this.fillStyle === 'string' &&
        this.fillStyle.startsWith('rgba(163, 163, 163,') &&
        chartRoot()?.contains(this.canvas) === true
      ) {
        counters.anchoredFills += 1
      }
      ;(fill as (...values: unknown[]) => void).apply(this, args)
    }
  })
}

async function mockMarket(page: Page): Promise<{ sockets: WebSocketRoute[] }> {
  const sockets: WebSocketRoute[] = []
  await page.routeWebSocket(/\/api\/ws\//, (socket) => {
    sockets.push(socket)
  })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/health') return json({ status: 'ok', parquet_folder: '/data' })
    if (path.endsWith('/klines/daily-context')) {
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: INTERVAL,
        candles: candles(HISTORY_BARS),
        available_from: null,
      })
    }
    if (path.endsWith('/klines/history')) {
      const before = Number(url.searchParams.get('before') ?? NOW_SECONDS)
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: INTERVAL,
        candles: candles(HISTORY_BARS, before),
        available_from: null,
      })
    }
    if (path.includes('/liquidations/')) {
      return json({ exchange: 'binance', symbol: 'BTCUSDT', events: [], next_before: null })
    }
    return json({ status: 'ok' })
  })
  return { sockets }
}

async function openApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('[data-testid="btc-perp-chart"]')).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(() => page.locator('[data-testid="btc-perp-chart"] canvas').count(), { timeout: 30_000 })
    .toBeGreaterThan(1)
  await expect
    .poll(() => page.locator('[candle-rising-color], [data-candle-rising-color]').count(), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0)
  await settle(page)
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
  await page.waitForTimeout(50)
}

async function zeroCounters(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__anchoredAppCounters.frames = 0
    window.__anchoredAppCounters.clears = 0
    window.__anchoredAppCounters.anchoredFills = 0
  })
}

async function idleWindow(page: Page, windowMs = 400): Promise<AppCounters> {
  await settle(page)
  await page.evaluate(() => {
    window.__anchoredAppCounters.frames = 0
    window.__anchoredAppCounters.clears = 0
    window.__anchoredAppCounters.anchoredFills = 0
  })
  await page.waitForTimeout(windowMs)
  return page.evaluate(() => ({ ...window.__anchoredAppCounters }))
}

async function chartBox(page: Page) {
  const chart = page.locator('[data-testid="btc-perp-chart"]')
  const box = await chart.boundingBox()
  if (!box) throw new Error('chart is not laid out')
  return box
}

async function createAnchoredVwap(page: Page): Promise<{ x: number; y: number }> {
  await page.getByRole('button', { name: 'Tools' }).click()
  await page.getByRole('menuitem', { name: 'Anchored VWAP', exact: true }).click()
  const box = await chartBox(page)
  const x = box.x + box.width * 0.55
  const y = box.y + box.height * 0.5
  await page.mouse.click(x, y)
  await expect
    .poll(
      () =>
        page.evaluate(
          ([key, panelId]) => {
            const map = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<
              string,
              unknown[]
            >
            return (map[panelId] ?? []).length
          },
          [STORAGE_KEY, PANEL_ID] as const,
        ),
      { timeout: 15_000 },
    )
    .toBe(1)
  return { x, y }
}

async function anchoredInstances(page: Page): Promise<AnchoredInstance[]> {
  return page.evaluate(
    ([key, panelId]) => {
      const map = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<
        string,
        AnchoredInstance[]
      >
      return map[panelId] ?? []
    },
    [STORAGE_KEY, PANEL_ID] as const,
  )
}

async function cursorAt(page: Page, x: number, y: number): Promise<string> {
  await page.mouse.move(x, y)
  return page.evaluate(
    ([clientX, clientY]) => {
      let node = document.elementFromPoint(clientX, clientY)
      while (node) {
        const cursor = (node as HTMLElement).style?.cursor
        if (cursor) return cursor
        node = node.parentElement
      }
      return ''
    },
    [x, y] as const,
  )
}

/** The anchor handle is the only `grab` target; probe the anchor column for it. */
async function findAnchorHandle(page: Page, x: number): Promise<number | null> {
  const box = await chartBox(page)
  for (let y = box.y + 40; y <= box.y + box.height - 40; y += 6) {
    const cursor = await cursorAt(page, x, y)
    if (cursor === 'grab') return y
  }
  return null
}

test.describe('anchored VWAP real app redraw', () => {
  test('creation settles, the anchor drag repaints and live ticks still paint', async ({ page }) => {
    test.setTimeout(180_000)
    await seedWorkspace(page)
    const { sockets } = await mockMarket(page)
    await openApp(page)

    const baseline = await idleWindow(page)
    expect(baseline.frames, 'idle app without an anchored tool').toBe(0)
    expect(baseline.clears).toBe(0)

    const anchor = await createAnchoredVwap(page)
    const createdIdle = await idleWindow(page)
    expect(createdIdle.frames, 'anchored fill must settle when input stops').toBe(0)
    expect(createdIdle.clears, 'no continuous canvas repaint').toBe(0)

    // A live relay tick must still paint without any user input.
    expect(sockets.length).toBeGreaterThan(0)
    await page.evaluate(() => {
      window.__anchoredAppCounters.frames = 0
    })
    const liveClose = 80_000 + 900
    const channel = decodeURIComponent(sockets[0].url().split('/api/ws/')[1] ?? '')
    expect(channel).toContain('kline')
    await sockets[0].send(
      JSON.stringify({
        type: 'event',
        channel,
        timestamp: new Date().toISOString(),
        payload: {
          symbol: 'BTCUSDT',
          interval: INTERVAL,
          time: NOW_SECONDS,
          open: liveClose - 12,
          high: liveClose + 30,
          low: liveClose - 30,
          close: liveClose,
          volume: 33.5,
          closed: false,
        },
      }),
    )
    await page.waitForTimeout(250)
    const afterTick = await page.evaluate(() => ({ ...window.__anchoredAppCounters }))
    expect(afterTick.frames, 'a live tick must repaint the chart').toBeGreaterThan(0)
    const afterTickIdle = await idleWindow(page)
    expect(afterTickIdle.frames, 'the tick must not start a loop').toBe(0)

    // Drag the anchor; the persisted anchor time must move and the drag paints.
    const anchorY = await findAnchorHandle(page, anchor.x)
    expect(anchorY, 'anchor handle must be hoverable on the anchor column').not.toBeNull()
    if (anchorY === null) return
    const beforeDrag = await anchoredInstances(page)
    expect(beforeDrag[0].anchorTime).toBeGreaterThan(0)
    await page.evaluate(() => {
      window.__anchoredAppCounters.frames = 0
    })
    await page.mouse.move(anchor.x, anchorY)
    await page.mouse.down()
    await page.mouse.move(anchor.x + 48, anchorY, { steps: 6 })
    await page.mouse.up()
    const dragged = await page.evaluate(() => ({ ...window.__anchoredAppCounters }))
    expect(dragged.frames, 'the anchor drag must repaint').toBeGreaterThan(0)
    await expect
      .poll(async () => (await anchoredInstances(page))[0]?.anchorTime, { timeout: 15_000 })
      .not.toBe(beforeDrag[0].anchorTime)
    const dragIdle = await idleWindow(page)
    expect(dragIdle.frames, 'the chart settles after the drag').toBe(0)
  })

  test('settings, hide/show, delete and reload settle and persist', async ({ page }) => {
    test.setTimeout(180_000)
    await seedWorkspace(page)
    await mockMarket(page)
    await openApp(page)
    await createAnchoredVwap(page)

    // Edit the band fill through the shared dialog: Fill opacity > 0.
    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Anchored VWAP 1 settings' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Fill color', exact: true }).first().click()
    const fillPicker = page.getByRole('dialog', { name: 'Fill color picker' })
    await expect(fillPicker).toBeVisible()
    const slider = fillPicker.getByRole('slider', { name: 'Fill opacity' })
    await slider.focus()
    for (let step = 0; step < 25; step += 1) await slider.press('ArrowRight')
    // The first Esc closes only the color popover (documented dismissal contract).
    await page.keyboard.press('Escape')
    await expect(fillPicker).toBeHidden()
    await zeroCounters(page)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()

    await expect
      .poll(async () => (await anchoredInstances(page))[0]?.settings.band1.fillOpacity, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0)

    await settle(page)
    const styled = await page.evaluate(() => ({ ...window.__anchoredAppCounters }))
    expect(styled.anchoredFills, 'the edited fill is rendered').toBeGreaterThan(0)
    const styledIdle = await idleWindow(page)
    expect(styledIdle.frames, 'a style edit must not start a loop').toBe(0)

    // Hide / show through the header object list.
    await zeroCounters(page)
    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Hide object' }).click()
    await page.keyboard.press('Escape')
    await expect
      .poll(async () => (await anchoredInstances(page))[0]?.hidden ?? false, { timeout: 15_000 })
      .toBe(true)
    await settle(page)
    const hidden = await page.evaluate(() => ({ ...window.__anchoredAppCounters }))
    expect(hidden.anchoredFills, 'a hidden tool paints no fill').toBe(0)
    const hiddenIdle = await idleWindow(page)
    expect(hiddenIdle.frames).toBe(0)

    await zeroCounters(page)
    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Show object' }).click()
    await page.keyboard.press('Escape')
    await settle(page)
    const shown = await page.evaluate(() => ({ ...window.__anchoredAppCounters }))
    expect(shown.anchoredFills, 'showing the tool repaints its fill').toBeGreaterThan(0)
    const shownIdle = await idleWindow(page)
    expect(shownIdle.frames).toBe(0)

    // Reload: the stored object comes back and still settles.
    const persisted = await anchoredInstances(page)
    await page.reload()
    await openApp(page)
    expect(await anchoredInstances(page)).toEqual(persisted)
    await settle(page)
    const reloaded = await page.evaluate(() => ({ ...window.__anchoredAppCounters }))
    expect(reloaded.anchoredFills, 'the restored fill renders after reload').toBeGreaterThan(0)
    const reloadedIdle = await idleWindow(page)
    expect(reloadedIdle.frames, 'the restored tool must settle after reload').toBe(0)

    // Delete through the header object list: no tool, no scheduling.
    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Delete Anchored VWAP 1' }).click()
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await anchoredInstances(page)).length, { timeout: 15_000 }).toBe(0)
    const deleted = await idleWindow(page)
    expect(deleted.frames).toBe(0)
    expect(deleted.anchoredFills).toBe(0)
    await expect(page.locator('[data-testid="btc-perp-chart"] canvas').first()).toBeVisible()
  })
})
