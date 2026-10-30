/**
 * Shared perf-benchmark workload + mocks (Issue #200).
 *
 * The harness must measure the *same* workload on two revisions, so everything that decides what
 * the app renders is defined exactly once here and imported by both the before/after benchmark
 * (`perf/compare.mjs`) and the Playwright regression spec (`e2e/chart-perf.spec.ts`):
 *
 * - the seeded `0xdeck-workspace` payload, in two variants: `single` — 6 panels (2 BTC perp
 *   charts, 2 Recharts charts, a data table and a KPI card, i.e. a realistic heavy workspace) — and
 *   `multi` — the same workspace plus 4 more chart workspaces (23 panels), which is the dimension
 *   the #199 envelope cost (parse + merge + serialize) scales with,
 * - the per-widget settings (dataset / interval / time range) seeded as localStorage,
 * - the `/api/*` mock responses (identical bytes in both runs),
 * - the in-page instrumentation (long tasks, frames, localStorage/JSON traffic, React commits).
 *
 * NOTE: the harness is not production code. It runs its own dev servers and never ships.
 */

/** Panels of the seeded workspace; ids follow the registry instance convention `<template>-<suffix>`. */
export const PANEL_IDS = {
  btcA: 'btc-perpetual-chart-aaa111',
  btcB: 'btc-perpetual-chart-bbb222',
  chartA: 'chart-aaa111',
  chartB: 'chart-bbb222',
  table: 'data-table-aaa111',
  kpi: 'kpi-card-aaa111',
}

export const PANEL_ORDER = [
  PANEL_IDS.btcA,
  PANEL_IDS.btcB,
  PANEL_IDS.chartA,
  PANEL_IDS.chartB,
  PANEL_IDS.table,
  PANEL_IDS.kpi,
]

/**
 * lg layout of the seeded workspace (36-column grid). Pre-#199 revisions store the layout under
 * `layout` (legacy single-workspace payload), post-#199 under `workspaces[].layout` inside the
 * `0xdeck-workspace` envelope. Both revisions can read the legacy payload, so the benchmark seeds
 * the *legacy* payload for both: the post-#199 app migrates it to Workspace 1 on load, which means
 * both runs start from byte-identical user data and render the identical 6-panel workspace.
 */
export const PANEL_LAYOUT = [
  { i: PANEL_IDS.btcA, x: 0, y: 0, w: 18, h: 24, minW: 9, minH: 10 },
  { i: PANEL_IDS.btcB, x: 18, y: 0, w: 18, h: 24, minW: 9, minH: 10 },
  { i: PANEL_IDS.chartA, x: 0, y: 24, w: 12, h: 14, minW: 4, minH: 8 },
  { i: PANEL_IDS.chartB, x: 12, y: 24, w: 12, h: 14, minW: 4, minH: 8 },
  { i: PANEL_IDS.table, x: 24, y: 24, w: 12, h: 14, minW: 4, minH: 8 },
  { i: PANEL_IDS.kpi, x: 0, y: 38, w: 8, h: 8, minW: 3, minH: 6 },
]

/** Legacy (pre-multi-workspace) `0xdeck-workspace` payload, readable by both revisions. */
export function legacyWorkspacePayload() {
  return { activePanels: PANEL_ORDER, layout: PANEL_LAYOUT, gridVersion: 3 }
}

/** `WORKSPACE_STORAGE_VERSION` of `src/lib/workspaceModel.ts` (the harness does not import app code). */
const ENVELOPE_VERSION = 2

/**
 * Workspaces 2–5 of the multi-workspace seed (#200 follow-up).
 *
 * Only Workspace 1 is ever rendered, so the mount and interaction workloads stay identical to the
 * single-workspace seed and the *only* variable is the size of the persisted `0xdeck-workspace`
 * envelope — which is exactly the dimension #199's parse + merge + re-serialize cost scales with
 * (envelope bytes × workspace count). A real multi-workspace deck looks like this: a heavy first
 * workspace plus a handful of chart workspaces kept for later.
 */
const EXTRA_WORKSPACES = {
  'ws-2': [
    'btc-perpetual-chart-w2a11',
    'btc-perpetual-chart-w2b22',
    'chart-w2a11',
    'data-table-w2a11',
  ],
  'ws-3': ['btc-perpetual-chart-w3a11', 'chart-w3a11', 'chart-w3b22', 'chart-w3c33', 'kpi-card-w3a11'],
  'ws-4': [
    'btc-perpetual-chart-w4a11',
    'btc-perpetual-chart-w4b22',
    'chart-w4a11',
    'data-table-w4a11',
  ],
  'ws-5': ['btc-perpetual-chart-w5a11', 'btc-perpetual-chart-w5b22', 'chart-w5a11', 'kpi-card-w5a11'],
}

/** Every panel of the multi-workspace seed, Workspace 1 included. */
const MULTI_WORKSPACE_PANEL_IDS = [
  ...PANEL_ORDER,
  ...Object.values(EXTRA_WORKSPACES).flat(),
]

function stackedWorkspaceLayout(panelIds) {
  return panelIds.map((id, index) => ({
    i: id,
    x: (index % 2) * 18,
    y: Math.floor(index / 2) * 18,
    w: 18,
    h: 16,
  }))
}

/**
 * Current-version `0xdeck-workspace` envelope with 5 workspaces (23 panels): **2 169 B** stored as
 * seeded, **2 342 B per write** once the app re-serializes it (single seed: 672 B / 845 B), i.e. 2.8×
 * the single payload. Workspace 1 is the single-workspace seed, Workspaces 2–5 add chart panels.
 * Pre-#199 revisions cannot read this payload (they only know the legacy single-workspace one), so
 * the multi-workspace table compares `bb42a75` and the fix; `9976989` is reported on the legacy
 * payload it actually had.
 */
export function multiWorkspacePayload() {
  return {
    version: ENVELOPE_VERSION,
    activeWorkspaceId: 'ws-1',
    workspaces: [
      { id: 'ws-1', activePanels: PANEL_ORDER, layout: PANEL_LAYOUT, gridVersion: 3 },
      ...Object.entries(EXTRA_WORKSPACES).map(([id, panelIds]) => ({
        id,
        activePanels: panelIds,
        layout: stackedWorkspaceLayout(panelIds),
        gridVersion: 3,
      })),
    ],
  }
}

/** Per-widget settings seeded in both runs (identical dataset + market interval everywhere). */
export function seededSettings() {
  const panelIds = MULTI_WORKSPACE_PANEL_IDS
  const datasetPanels = panelIds.filter(
    (id) => id.startsWith('chart-') || id.startsWith('data-table-') || id.startsWith('kpi-card-'),
  )
  const marketPanels = panelIds.filter((id) => id.startsWith('btc-perpetual-chart-'))

  return {
    '0xdeck-widget-datasets': Object.fromEntries(datasetPanels.map((id) => [id, 'trades'])),
    '0xdeck-widget-time-ranges': Object.fromEntries(datasetPanels.map((id) => [id, '1h'])),
    '0xdeck-widget-market-intervals': Object.fromEntries(marketPanels.map((id) => [id, '1m'])),
    '0xdeck-widget-market-exchanges': Object.fromEntries(marketPanels.map((id) => [id, 'binance'])),
    // Daily VWAP on: the initial candle request then goes through the context endpoint, which is
    // what a default BTC Perp panel does.
    '0xdeck-widget-market-indicators': Object.fromEntries(
      marketPanels.map((id) => [
        id,
        // The primary BTC panel is the one the single-workspace seed gives the full EMA stack.
        id === PANEL_IDS.btcA ? ['ema20', 'ema50', 'ema200', 'vwap-daily'] : ['ema20', 'vwap-daily'],
      ]),
    ),
  }
}

export const VIEWPORT = { width: 1600, height: 1000 }

const CANDLE_COUNT = 720
const CANDLE_BASE_TIME = 1_700_000_000

/** Deterministic 1m candles + Recharts series; identical for every run and both revisions. */
export function marketCandles(interval = '1m') {
  const candles = []
  for (let i = 0; i < CANDLE_COUNT; i += 1) {
    const close = 30000 + Math.sin(i / 12) * 500 + (i % 7)
    candles.push({
      symbol: 'BTCUSDT',
      interval,
      time: CANDLE_BASE_TIME + i * 60,
      open: close - 20,
      high: close + 40,
      low: close - 40,
      close,
      volume: 10 + (i % 13),
      closed: i < CANDLE_COUNT - 1,
    })
  }
  return candles
}

const SERIES_POINTS = marketCandles().map((candle) => ({ x: candle.time, y: candle.close }))

const TABLES = [
  { name: 'trades', kind: 'file', file_count: 1, row_count: 5000 },
  { name: 'prediction_price', kind: 'file', file_count: 1, row_count: 5000 },
]

const PREVIEW = {
  name: 'trades',
  columns: ['time', 'symbol', 'price', 'size'],
  rows: Array.from({ length: 50 }, (_, i) => [CANDLE_BASE_TIME + i, 'BTCUSDT', 30000 + i, 1.5]),
}

const SCHEMA = {
  name: 'trades',
  schema: [
    { name: 'time', type: 'TIMESTAMP' },
    { name: 'symbol', type: 'VARCHAR' },
    { name: 'price', type: 'DOUBLE' },
    { name: 'size', type: 'DOUBLE' },
  ],
}

/**
 * Mock of every `/api/*` route the seeded workspace touches. Returns the response for one request
 * so both revisions receive identical bytes; `null` means "not mocked".
 */
export function mockApiResponse(pathname, search) {
  const params = new URLSearchParams(search)
  const interval = params.get('interval') ?? '1m'

  if (pathname === '/api/health') return { status: 'ok', parquet_folder: '/tmp/perf-mock.parquet' }
  if (pathname === '/api/datasets') return { datasets: TABLES }
  if (/^\/api\/datasets\/[^/]+\/preview$/.test(pathname)) return PREVIEW
  if (/^\/api\/datasets\/[^/]+\/series$/.test(pathname)) {
    return { name: 'trades', x_column: 'time', y_column: 'price', points: SERIES_POINTS }
  }
  if (/^\/api\/datasets\/[^/]+\/schema$/.test(pathname)) return SCHEMA
  if (/^\/api\/datasets\/[^/]+\/kpi$/.test(pathname)) {
    return {
      name: 'trades',
      metric_column: 'price',
      aggregation: 'last',
      range: '1h',
      value: 30500,
      row_count: 100,
      as_of: CANDLE_BASE_TIME,
    }
  }
  if (pathname === '/api/settings') return { parquet_folder: '/tmp/perf-mock.parquet', folder_ready: true }

  if (pathname.endsWith('/klines/history')) {
    return { symbol: 'BTCUSDT', interval, candles: [] }
  }
  if (/\/klines\/[a-z]+-context$/.test(pathname)) {
    return { exchange: 'binance', symbol: 'BTCUSDT', interval, candles: marketCandles(interval) }
  }
  if (pathname.endsWith('/klines')) {
    return { exchange: 'binance', symbol: 'BTCUSDT', interval, candles: marketCandles(interval) }
  }
  if (pathname.includes('/liquidations/history')) return { events: [] }
  if (pathname.includes('/account/')) return { address: '0xperf', fills: [], positions: [], btc_position: null }

  return null
}

/**
 * In-page instrumentation, installed as an init script before any app code runs.
 *
 * Everything it collects is a counter or a timestamp produced by the browser itself:
 * - `longTasks` via PerformanceObserver('longtask') — main-thread blocking;
 * - `frames` via requestAnimationFrame — frame pacing / dropped frames;
 * - `storage`/`json` counters by wrapping `Storage.prototype.getItem/setItem` and
 *   `JSON.parse/stringify`, split by key/payload size so the `0xdeck-workspace` envelope traffic is
 *   separable from the per-widget keys. The envelope counters are kept **per direction**
 *   (`workspaceGetBytes` = bytes returned by `getItem`, `workspaceSetBytes` = bytes passed to
 *   `setItem`) and are cumulative over the scenario, so `perf/measure.mjs` can report bytes per
 *   write (one drag stop) instead of a sum that also contains the reads;
 * - `commits` from the React DevTools global hook: every commit walks the fiber tree and counts a
 *   fiber as "rendered" when its `memoizedProps` object differs from its alternate's (or it mounted),
 *   aggregated per component name. No production code is touched.
 *
 * It also stubs `WebSocket` so the market stream never opens a real socket: without that, a failed
 * connection plus reconnect backoff would add nondeterministic timers that differ between runs.
 */
export function instrumentationScript() {
  const state = {
    longTasks: [],
    frames: [],
    storage: {
      getItem: 0,
      setItem: 0,
      getBytes: 0,
      setBytes: 0,
      workspaceGet: 0,
      workspaceSet: 0,
      workspaceGetBytes: 0,
      workspaceSetBytes: 0,
    },
    json: { parse: 0, parseBytes: 0, largeParse: 0, largeParseBytes: 0, stringify: 0, stringifyBytes: 0, largeStringify: 0, largeStringifyBytes: 0 },
    commits: { total: 0, byName: {} },
    recording: true,
    framesSampling: false,
  }
  window.__perf = state

  // React's dev build enables its own DevTools "Components" user-timing track as soon as
  // `console.timeStamp` exists, which walks and diffs the props of every rendered fiber per commit
  // (`addObjectDiffToProperties`) and would dominate the drag window. Removing it keeps the dev-mode
  // numbers comparable to the production build and identical for both revisions.
  try {
    Object.defineProperty(console, 'timeStamp', { value: undefined, configurable: true })
  } catch {
    // ignore: the timing track then stays enabled, which only adds equal overhead to both runs.
  }

  const LARGE = 1024
  const originalGetItem = Storage.prototype.getItem
  const originalSetItem = Storage.prototype.setItem
  Storage.prototype.getItem = function getItem(key) {
    const value = originalGetItem.call(this, key)
    state.storage.getItem += 1
    const bytes = value === null ? 0 : value.length
    state.storage.getBytes += bytes
    if (key === '0xdeck-workspace') {
      state.storage.workspaceGet += 1
      state.storage.workspaceGetBytes += bytes
    }
    return value
  }
  Storage.prototype.setItem = function setItem(key, value) {
    state.storage.setItem += 1
    const bytes = typeof value === 'string' ? value.length : 0
    state.storage.setBytes += bytes
    if (key === '0xdeck-workspace') {
      state.storage.workspaceSet += 1
      state.storage.workspaceSetBytes += bytes
    }
    return originalSetItem.call(this, key, value)
  }

  const originalParse = JSON.parse
  JSON.parse = function parse(text, reviver) {
    const bytes = typeof text === 'string' ? text.length : 0
    state.json.parse += 1
    state.json.parseBytes += bytes
    if (bytes >= LARGE) {
      state.json.largeParse += 1
      state.json.largeParseBytes += bytes
    }
    return originalParse.call(this, text, reviver)
  }
  const originalStringify = JSON.stringify
  JSON.stringify = function stringify(value, replacer, space) {
    const text = originalStringify.call(this, value, replacer, space)
    const bytes = typeof text === 'string' ? text.length : 0
    state.json.stringify += 1
    state.json.stringifyBytes += bytes
    if (bytes >= LARGE) {
      state.json.largeStringify += 1
      state.json.largeStringifyBytes += bytes
    }
    return text
  }

  if (typeof PerformanceObserver === 'function') {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({ start: entry.startTime, duration: entry.duration })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // longtask unsupported: the harness reports 0 long tasks instead of failing.
    }
  }

  const sampleFrame = (time) => {
    if (state.framesSampling) state.frames.push(time)
    requestAnimationFrame(sampleFrame)
  }
  requestAnimationFrame(sampleFrame)

  // --- React commit counter (DevTools global hook) -------------------------------------------
  const TARGETS = new Set([
    'App',
    'BtcPerpetualChartPanel',
    'ChartPanel',
    'DataTablePanel',
    'KpiCardPanel',
    'PanelHeaderControls',
    'WorkspaceSwitcher',
    'ResponsiveGridLayout',
  ])

  function fiberName(fiber) {
    const type = fiber.type
    if (typeof type === 'function') return type.displayName || type.name || null
    if (typeof type === 'string') return null
    return null
  }

  function walk(fiber, visit) {
    let node = fiber
    while (node) {
      visit(node)
      if (node.child) walk(node.child, visit)
      node = node.sibling
    }
  }

  const hook = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject(renderer) {
      const id = this.renderers.size + 1
      this.renderers.set(id, renderer)
      return id
    },
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
    onCommitFiberRoot(_rendererId, root) {
      if (!state.recording) return
      state.commits.total += 1
      walk(root.current, (fiber) => {
        const name = fiberName(fiber)
        if (!name || !TARGETS.has(name)) return
        const previous = fiber.alternate
        const rendered = previous === null || previous.memoizedProps !== fiber.memoizedProps
        if (!rendered) return
        state.commits.byName[name] = (state.commits.byName[name] ?? 0) + 1
      })
    },
  }
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    value: hook,
    configurable: true,
    writable: false,
  })

  // --- WebSocket stub ------------------------------------------------------------------------
  class PerfWebSocket extends EventTarget {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    constructor(url) {
      super()
      this.url = url
      this.readyState = PerfWebSocket.CONNECTING
      this.binaryType = 'blob'
      setTimeout(() => {
        this.readyState = PerfWebSocket.OPEN
        this.dispatchEvent(new Event('open'))
      }, 0)
    }
    send() {}
    close() {
      this.readyState = PerfWebSocket.CLOSED
      this.dispatchEvent(new Event('close'))
    }
    addEventListener(type, listener, options) {
      super.addEventListener(type, listener, options)
    }
    removeEventListener(type, listener, options) {
      super.removeEventListener(type, listener, options)
    }
  }
  Object.defineProperty(window, 'WebSocket', { value: PerfWebSocket, configurable: true, writable: true })
}

/** Seeds localStorage and installs the instrumentation before the app boots. */
export async function seedContext(context, { workload = 'single' } = {}) {
  const source = workload === 'multi' ? multiWorkspacePayload() : legacyWorkspacePayload()
  const payload = JSON.stringify(source)
  const settings = seededSettings()
  const seedFlag = `perf-seeded-${workload}`

  await context.addInitScript(instrumentationScript)
  await context.addInitScript(
    ({ workspace, settings: seeded, flag }) => {
      if (sessionStorage.getItem(flag) === '1') return
      localStorage.clear()
      localStorage.setItem('0xdeck-workspace', workspace)
      for (const [key, value] of Object.entries(seeded)) {
        localStorage.setItem(key, JSON.stringify(value))
      }
      sessionStorage.setItem(flag, '1')
    },
    { workspace: payload, settings, flag: seedFlag },
  )
  return { workload, bytes: payload.length }
}

/** Routes every `/api/*` request through `mockApiResponse` and records what was requested. */
export async function mockApi(page, requestLog) {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      const body = mockApiResponse(url.pathname, url.search)
      requestLog.set(url.pathname, (requestLog.get(url.pathname) ?? 0) + 1)
      if (body === null) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"unmocked"}' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify(body),
      })
    },
  )
}

export const PANEL_SELECTOR = '.react-grid-item'
export const HANDLE_SELECTOR = '.panel-drag-handle'
