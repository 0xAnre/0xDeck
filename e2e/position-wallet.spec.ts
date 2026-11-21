import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * Browser regression for #246: one global Position Markers wallet in the app
 * header, shared by every BTC Perp panel in every workspace.
 *
 * The backend (candles, relay) and Lighter's public REST API are mocked, so the
 * assertions are about the browser's own behaviour: header keyboard access,
 * validation, persistence, cross-workspace propagation, explicit Lighter
 * account choice and a single shared Lighter session instead of one request per
 * widget. Marker pixels are covered by `src/market/lighterFills.test.ts`.
 */

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const PANEL_A = 'btc-perpetual-chart-aaa111'
const PANEL_B = 'btc-perpetual-chart-bbb222'
const PANEL_C = 'btc-perpetual-chart-ccc333'
const WALLET_STORAGE_KEY = '0xdeck-position-wallet'
const LIGHTER_ADDRESS = '0xaaaabbbbccccddddeeeeffff0000111122223333'
const HYPERLIQUID_ADDRESS = '0xe8c1a8c7a94ac89b138fc8b2bd8a09bfa2e1acde'

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

function seedWorkspace(twoWorkspaces: boolean) {
  const panels = (ids: string[]) => ({
    activePanels: ids,
    layout: ids.map((id, index) => ({ i: id, x: index * 12, y: 0, w: 18, h: 14 })),
    gridVersion: 3,
  })
  const payload = twoWorkspaces
    ? {
        version: 2,
        activeWorkspaceId: 'ws-1',
        workspaces: [
          { id: 'ws-1', ...panels([PANEL_A, PANEL_B]) },
          { id: 'ws-2', ...panels([PANEL_C]) },
        ],
      }
    : { activePanels: [PANEL_A, PANEL_B], layout: [], gridVersion: 3 }
  const markerSettings = Object.fromEntries(
    (twoWorkspaces ? [PANEL_A, PANEL_B, PANEL_C] : [PANEL_A, PANEL_B]).map((id) => [
      id,
      { enabled: true, size: 1 },
    ]),
  )
  return `(() => {
    localStorage.setItem('0xdeck-workspace', JSON.stringify(${JSON.stringify(payload)}))
    localStorage.setItem('0xdeck-widget-market-position-markers', JSON.stringify(${JSON.stringify(markerSettings)}))
    localStorage.setItem('0xdeck-widget-market-intervals', JSON.stringify(${JSON.stringify(
      Object.fromEntries(
        (twoWorkspaces ? [PANEL_A, PANEL_B, PANEL_C] : [PANEL_A, PANEL_B]).map((id) => [
          id,
          INTERVAL,
        ]),
      ),
    )}))
  })()`
}

async function mockBackend(page: Page) {
  await page.routeWebSocket(/\/api\/ws\//, () => {
    // One silent relay socket per channel: fills/klines are mocked through REST.
  })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/health') return json({ status: 'ok', parquet_folder: '/data' })
    if (path.endsWith('/klines/daily-context')) {
      return json({ exchange: 'binance', symbol: 'BTCUSDT', interval: INTERVAL, candles: candles(240) })
    }
    if (path.endsWith('/klines/history')) {
      const before = Number(url.searchParams.get('before') ?? NOW_SECONDS)
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: INTERVAL,
        candles: candles(240, before),
      })
    }
    if (path.endsWith('/klines')) {
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: INTERVAL,
        candles: candles(300),
        available_from: null,
      })
    }
    return route.fulfill({ status: 503, body: 'not mocked' })
  })
}

type LighterState = {
  accounts: Array<{ index: number; account_type?: number }>
  tradesByAccount: Record<string, string[]>
  requests: string[]
}

async function mockLighter(page: Page, state: LighterState) {
  await page.route('https://mainnet.zklighter.elliot.ai/**', async (route: Route) => {
    const url = new URL(route.request().url())
    state.requests.push(url.pathname + url.search)
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.pathname === '/api/v1/account' && url.searchParams.get('by') === 'l1_address') {
      return json({
        code: 200,
        total: state.accounts.length,
        accounts: state.accounts.map((account) => ({
          code: 0,
          index: account.index,
          account_type: account.account_type ?? 0,
          l1_address: LIGHTER_ADDRESS,
          positions: [],
        })),
      })
    }
    if (url.pathname === '/api/v1/account' && url.searchParams.get('by') === 'index') {
      return json({
        code: 200,
        accounts: [
          {
            code: 0,
            index: Number(url.searchParams.get('value')),
            l1_address: LIGHTER_ADDRESS,
            positions: [{ symbol: 'BTC', sign: 1, position: '0.5', avg_entry_price: '56000' }],
          },
        ],
      })
    }
    if (url.pathname === '/api/v1/trades') {
      const accountIndex = url.searchParams.get('account_index') ?? ''
      const tradeIds = state.tradesByAccount[accountIndex] ?? []
      return json({
        code: 200,
        next_cursor: null,
        trades: tradeIds.map((tradeId, index) => ({
          trade_id_str: tradeId,
          type: 'trade',
          market_id: 1,
          size: '0.01',
          price: '56000',
          ask_account_id: Number(accountIndex),
          bid_account_id: 990000 + index,
          is_maker_ask: true,
          maker_position_size_before: '-0.01',
          taker_position_size_before: '0',
          timestamp: NOW_SECONDS * 1000 - 60_000 + index,
        })),
      })
    }
    return route.fulfill({ status: 404, body: 'not mocked' })
  })
}

function walletTrigger(page: Page) {
  return page.getByTestId('position-wallet-trigger')
}

function walletPopover(page: Page) {
  return page.locator('[data-slot="popover-content"]')
}

async function readStoredWallet(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as unknown)
  }, WALLET_STORAGE_KEY)
}

async function openWallet(page: Page) {
  await walletTrigger(page).click()
  const popover = walletPopover(page)
  await expect(popover).toBeVisible()
  return popover
}

async function chooseExchange(page: Page, label: 'Hyperliquid' | 'Lighter') {
  const popover = walletPopover(page)
  await popover.getByRole('combobox', { name: 'Wallet exchange' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

async function saveWallet(page: Page) {
  await walletPopover(page).getByRole('button', { name: 'Save' }).click()
}

test.describe('global position-markers wallet', () => {
  test('is keyboard reachable, validates, persists and survives a reload', async ({ page }) => {
    await page.addInitScript(seedWorkspace(false))
    await mockBackend(page)
    await page.goto('/')

    const trigger = walletTrigger(page)
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-label', /Position Markers wallet: Hyperliquid/)

    // Keyboard: focus + Enter opens the popover, Escape closes it (Radix contract).
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(walletPopover(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(walletPopover(page)).toHaveCount(0)

    const popover = await openWallet(page)
    const address = popover.getByLabel('Wallet address')
    await expect(address).toHaveValue(HYPERLIQUID_ADDRESS)

    // Invalid address: a readable error, nothing persisted.
    await address.fill('0xnot-an-address')
    await saveWallet(page)
    await expect(popover.getByText('Wallet address must be 0x followed by 40 hexadecimal characters')).toBeVisible()
    expect(await readStoredWallet(page)).toBeNull()

    // Valid address: saved, popover closes and every panel reads the new label.
    await address.fill('0x1111222233334444555566667777888899990000')
    await saveWallet(page)
    await expect(walletPopover(page)).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-label', /0x1111…0000/)
    expect(await readStoredWallet(page)).toEqual({
      exchange: 'hyperliquid',
      address: '0x1111222233334444555566667777888899990000',
      lighterAccountIndex: null,
    })

    // Reload: the selection is restored and no panel exposes its own wallet input.
    await page.reload()
    await expect(trigger).toHaveAttribute('aria-label', /0x1111…0000/)
    await expect(page.locator('input[placeholder="0x…"]')).toHaveCount(0)
  })

  test('requires an explicit Lighter account and shares one session across panels and workspaces', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.addInitScript(seedWorkspace(true))
    await mockBackend(page)
    const lighter: LighterState = {
      accounts: [
        { index: 7 },
        { index: 42, account_type: 1 },
      ],
      tradesByAccount: { '7': ['7001', '7002'], '42': ['4201'] },
      requests: [],
    }
    await mockLighter(page, lighter)
    await page.goto('/')

    const trigger = walletTrigger(page)
    await expect(trigger).toBeVisible()
    const popover = await openWallet(page)
    await chooseExchange(page, 'Lighter')
    await popover.getByLabel('Wallet address').fill(LIGHTER_ADDRESS)
    await saveWallet(page)

    // Multiple accounts: no silent pick, the popover stays open for a choice.
    await expect(popover.getByText(/This wallet owns 2 Lighter accounts/)).toBeVisible()
    expect(await readStoredWallet(page)).toBeNull()
    await expect(popover.getByRole('combobox', { name: 'Lighter account' })).toBeVisible()

    await popover.getByRole('combobox', { name: 'Lighter account' }).click()
    await page.getByRole('option', { name: 'Sub-account · #42' }).click()
    await saveWallet(page)
    await expect(walletPopover(page)).toHaveCount(0)
    expect(await readStoredWallet(page)).toEqual({
      exchange: 'lighter',
      address: LIGHTER_ADDRESS,
      lighterAccountIndex: 42,
    })

    // One shared Lighter session: two panels on this workspace request one page.
    await expect
      .poll(() => lighter.requests.filter((url) => url.includes('/trades?')).length)
      .toBe(1)
    expect(lighter.requests.filter((url) => url.includes('account_index=42')).length).toBe(1)

    // Switching workspace unmounts the only panels, so the shared session stops
    // and restarts once for the new workspace's panel — never per panel, and
    // never for another account. Extra panels on one workspace add no request.
    await page.getByRole('button', { name: 'Workspace 2' }).click()
    await expect(page.getByTestId('btc-perp-chart')).toHaveCount(1)
    await expect
      .poll(() => lighter.requests.filter((url) => url.includes('/trades?')).length)
      .toBe(2)
    expect(lighter.requests.every((url) => !url.includes('/trades?') || url.includes('account_index=42'))).toBe(true)
    expect(lighter.requests.filter((url) => url.includes('account_index=42')).length).toBe(2)

    // Switching to the other account fetches the new account only, once.
    // Reopening the menu re-reads the wallet's accounts so the other one is selectable.
    await openWallet(page)
    await expect(
      walletPopover(page).getByRole('combobox', { name: 'Lighter account' }),
    ).toBeVisible()
    await walletPopover(page).getByRole('combobox', { name: 'Lighter account' }).click()
    await page.getByRole('option', { name: 'Master account · #7' }).click()
    await saveWallet(page)
    await expect(walletPopover(page)).toHaveCount(0)
    await expect
      .poll(() => lighter.requests.filter((url) => url.includes('account_index=7')).length)
      .toBe(1)
    expect(lighter.requests.filter((url) => url.includes('account_index=42')).length).toBe(2)

    // The selection survives a reload, and the restored panel resolves it once.
    await page.reload()
    await expect(trigger).toHaveAttribute('aria-label', /Lighter · 0xaaaa…3333 · #7/)
    await expect
      .poll(() => lighter.requests.filter((url) => url.includes('account_index=7')).length)
      .toBe(2)
  })

  test('keeps the wallet control reachable at a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.addInitScript(seedWorkspace(false))
    await mockBackend(page)
    await page.goto('/')

    const trigger = walletTrigger(page)
    await expect(trigger).toBeVisible()
    const box = await trigger.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375)
    await trigger.click()
    await expect(walletPopover(page)).toBeVisible()
    const popoverBox = await walletPopover(page).boundingBox()
    expect(popoverBox).not.toBeNull()
    expect((popoverBox?.x ?? 0) >= 0).toBe(true)
    expect((popoverBox?.y ?? 0) >= 0).toBe(true)
  })
})
