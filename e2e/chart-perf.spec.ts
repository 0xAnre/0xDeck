import { expect, test } from '@playwright/test'
import {
  HANDLE_SELECTOR,
  PANEL_SELECTOR,
  VIEWPORT,
  mockApi,
  seedContext,
} from '../perf/workload.mjs'

/**
 * Chart-interaction performance regression test (Issue #200, regression from #199 `bb42a75`).
 *
 * It pins the hot path the benchmark identified, using **counters, not wall-clock budgets**, so it
 * cannot flake on a slow CI machine:
 *
 * 1. A react-grid-layout drag emits a layout change per frame and `App` stores it per frame, so
 *    `App` re-renders during the whole drag. A widget body must **not** re-render with it: its props
 *    (`panelId`, `headerSettings`) are stable, and re-rendering the lightweight-charts and Recharts
 *    bodies per mouse move is what made the deck janky. Budget: at most one render of a chart body
 *    over a 24-step drag (the fix renders 0; `bb42a75` rendered ~2 per step, ~48).
 * 2. Persisting a layout must not re-read + `JSON.parse` + merge the whole `0xdeck-workspace`
 *    envelope when this tab is the only writer. Budget: zero full-envelope parses for the drag.
 *    (`bb42a75`: one `JSON.parse` per drag stop; before #199: zero, but no multi-tab merge.)
 *
 * Both counters come from `perf/workload.mjs`, which instruments the page from an init script
 * (PerformanceObserver, Storage/JSON wrappers, React DevTools commit hook). No production code is
 * touched. Run with `npm run test:perf`, or as part of `npm run test:e2e`.
 */
test.use({ viewport: VIEWPORT })

/**
 * Shape of the in-page counters that `perf/workload.mjs` installs (`instrumentationScript`).
 * Declared here, next to the only consumer that reads them from a `.ts` file, so type-checking
 * `e2e/` sees the hook; nothing in `src/` or `dist/` knows about it.
 */
type PerfCounters = {
  longTasks: Array<{ start: number; duration: number }>
  frames: number[]
  storage: {
    getItem: number
    setItem: number
    getBytes: number
    setBytes: number
    workspaceGet: number
    workspaceSet: number
    workspaceGetBytes: number
    workspaceSetBytes: number
  }
  json: {
    parse: number
    parseBytes: number
    largeParse: number
    largeParseBytes: number
    stringify: number
    stringifyBytes: number
    largeStringify: number
    largeStringifyBytes: number
  }
  commits: { total: number; byName: Record<string, number> }
  recording: boolean
  framesSampling: boolean
}

declare global {
  interface Window {
    /** Test-only instrumentation of the perf harness (issue #200); never present in the app. */
    __perf: PerfCounters
  }
}

const CHART_BODY_RENDER_BUDGET = 1
const ENVELOPE_PARSE_BUDGET = 0

test('dragging a panel does not re-render chart bodies or merge the workspace envelope', async ({
  page,
}) => {
  await seedContext(page.context())
  await mockApi(page, new Map())

  await page.goto('/')
  // Six seeded panels, both chart stacks painted.
  await page.waitForFunction(
    () => {
      const items = document.querySelectorAll('.react-grid-item').length
      const canvases = document.querySelectorAll('.react-grid-item canvas').length
      return items >= 6 && canvases >= 8
    },
    undefined,
    { timeout: 60_000 },
  )
  await page.waitForTimeout(1_000)

  const handle = page.locator(PANEL_SELECTOR).nth(2).locator(HANDLE_SELECTOR)
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  const startX = box.x + Math.min(box.width - 8, box.width / 2)
  const startY = box.y + box.height / 2

  const before = await page.evaluate(() => ({
    commits: { ...window.__perf.commits.byName },
    parse: window.__perf.json.parse,
    workspaceGet: window.__perf.storage.workspaceGet,
  }))

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= 24; step += 1) {
    await page.mouse.move(startX + step * 3, startY + step * 1.5)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()

  const after = await page.evaluate(() => ({
    commits: { ...window.__perf.commits.byName },
    parse: window.__perf.json.parse,
    workspaceGet: window.__perf.storage.workspaceGet,
  }))

  const chartBodyRenders = (name: string) => (after.commits[name] ?? 0) - (before.commits[name] ?? 0)
  const parsedEnvelopes = after.parse - before.parse
  const envelopeReads = after.workspaceGet - before.workspaceGet

  console.log(
    `chart body renders — BtcPerpetualChartPanel: ${chartBodyRenders(
      'BtcPerpetualChartPanel',
    )}, ChartPanel: ${chartBodyRenders('ChartPanel')}, DataTablePanel: ${chartBodyRenders(
      'DataTablePanel',
    )}; envelope reads: ${envelopeReads}, envelope JSON.parse: ${parsedEnvelopes}`,
  )

  expect(
    chartBodyRenders('BtcPerpetualChartPanel'),
    'lightweight-charts bodies must not re-render per drag frame',
  ).toBeLessThanOrEqual(CHART_BODY_RENDER_BUDGET)
  expect(
    chartBodyRenders('ChartPanel'),
    'Recharts bodies must not re-render per drag frame',
  ).toBeLessThanOrEqual(CHART_BODY_RENDER_BUDGET)
  expect(
    chartBodyRenders('DataTablePanel'),
    'the data table body must not re-render per drag frame',
  ).toBeLessThanOrEqual(CHART_BODY_RENDER_BUDGET)
  expect(
    parsedEnvelopes,
    'a drag must not JSON.parse the whole 0xdeck-workspace envelope',
  ).toBeLessThanOrEqual(ENVELOPE_PARSE_BUDGET)
})
