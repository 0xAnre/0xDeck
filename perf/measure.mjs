/**
 * Measures the chart-interaction workload of one 0xDeck build (Issue #200).
 *
 * Usage: `node perf/measure.mjs --url http://localhost:57431 --label after [--out /tmp/after.json]`
 *
 * Runs in one Chromium instance against one dev server, with the shared workload/mocks from
 * `perf/workload.mjs`, and prints a JSON report with:
 *
 * - `mount`: first load → all 6 panels mounted and both chart stacks painted (in-page ms, long tasks,
 *   CDP task/script/layout/style deltas, React commits);
 * - `drag`: 2 s of scripted mouse moves on a panel header (frame pacing, dropped frames, long tasks,
 *   CDP deltas, React commits per component, localStorage/JSON traffic, JS CPU profile top functions);
 * - `dragStops`: 10 drag-stop cycles (wall time, commits, localStorage/JSON traffic);
 * - `resize`: 1.5 s scripted resize through the `se` handle (same metrics as `drag`).
 *
 * The `storage` block of every scenario is cumulative over that scenario. For the `0xdeck-workspace`
 * envelope it is also reported **per write** (`workspaceSetBytesPerSave`, the size one drag stop
 * actually stores) and **per read** (`workspaceGetBytesPerRead`), so a scenario total can never be
 * mistaken for the size of the stored envelope; `workspaceIoBytes` is the read + written aggregate.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { HANDLE_SELECTOR, PANEL_SELECTOR, VIEWPORT, mockApi, seedContext } from './workload.mjs'

function parseArgs(argv) {
  const args = { url: 'http://localhost:57431/', label: 'run', out: null, workload: 'single' }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '--url') args.url = argv[++i]
    else if (key === '--label') args.label = argv[++i]
    else if (key === '--out') args.out = argv[++i]
    else if (key === '--workload') args.workload = argv[++i]
  }
  return args
}

const readCounters = (page) =>
  page.evaluate(() => {
    const perf = window.__perf
    return {
      now: performance.now(),
      longTasks: perf.longTasks.slice(),
      frames: perf.frames.slice(),
      storage: { ...perf.storage },
      json: { ...perf.json },
      commits: { total: perf.commits.total, byName: { ...perf.commits.byName } },
    }
  })

function diffCounters(before, after) {
  const longTasks = after.longTasks.filter((task) => task.start >= before.now)
  const frames = after.frames.filter((frame) => frame >= before.now)
  const storage = {}
  for (const key of Object.keys(after.storage)) {
    storage[key] = after.storage[key] - before.storage[key]
  }
  const json = {}
  for (const key of Object.keys(after.json)) {
    json[key] = after.json[key] - before.json[key]
  }
  const commits = { total: after.commits.total - before.commits.total, byName: {} }
  for (const [name, count] of Object.entries(after.commits.byName)) {
    const delta = count - (before.commits.byName[name] ?? 0)
    if (delta !== 0) commits.byName[name] = delta
  }
  return { longTasks, frames, storage: envelopeByteMetrics(storage), json, commits }
}

/**
 * Turns the cumulative envelope byte counters into the per-operation size plus an explicit aggregate.
 *
 * `workspaceSetBytes` / `workspaceGetBytes` are sums over the whole scenario (a drag stop writes the
 * envelope once, so 10 stops write it 10 times), and reading one of them as "the envelope" is what
 * overstated the stored payload of this workload as 46 840 B instead of ~2.2 KB. The real stored
 * sizes are reported by `workspaceSetBytesPerSave` (bytes per `setItem`).
 */
function envelopeByteMetrics(storage) {
  const setBytes = storage.workspaceSetBytes ?? 0
  const getBytes = storage.workspaceGetBytes ?? 0
  const saves = storage.workspaceSet ?? 0
  const reads = storage.workspaceGet ?? 0
  return {
    ...storage,
    workspaceSetBytesPerSave: saves === 0 ? null : round(setBytes / saves),
    workspaceGetBytesPerRead: reads === 0 ? null : round(getBytes / reads),
    workspaceIoBytes: setBytes + getBytes,
  }
}

function frameStats(frames) {
  if (frames.length < 2) return { frames: frames.length, meanMs: null, p95Ms: null, maxMs: null, dropped: 0, droppedSevere: 0, fps: null }
  const deltas = []
  for (let i = 1; i < frames.length; i += 1) deltas.push(frames[i] - frames[i - 1])
  const sorted = [...deltas].sort((a, b) => a - b)
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length
  return {
    frames: frames.length,
    meanMs: round(mean),
    p50Ms: round(sorted[Math.floor(sorted.length * 0.5)]),
    p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
    maxMs: round(sorted[sorted.length - 1]),
    dropped: deltas.filter((value) => value > 25).length,
    droppedSevere: deltas.filter((value) => value > 50).length,
    fps: round(1000 / mean),
  }
}

const round = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value)

function longTaskStats(longTasks) {
  const total = longTasks.reduce((sum, task) => sum + task.duration, 0)
  const sorted = longTasks.map((task) => task.duration).sort((a, b) => b - a)
  return {
    count: longTasks.length,
    totalMs: round(total),
    maxMs: round(sorted[0] ?? 0),
    // main-thread work beyond the 50 ms long-task threshold
    blockingMs: round(longTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0)),
  }
}

async function cdpMetrics(session) {
  const { metrics } = await session.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]))
}

const CDP_KEYS = [
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
  'LayoutCount',
  'RecalcStyleCount',
]

function cdpDelta(before, after) {
  const out = {}
  for (const key of CDP_KEYS) {
    out[key] = round(((after[key] ?? 0) - (before[key] ?? 0)) * 1000)
  }
  return out
}

function topFunctions(profile, limit = 12) {
  if (!profile) return []
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
  const selfTime = new Map()
  const samples = profile.samples ?? []
  const deltas = profile.timeDeltas ?? []
  for (let i = 0; i < samples.length; i += 1) {
    const node = nodes.get(samples[i])
    if (!node) continue
    const frame = node.callFrame
    const name = frame.functionName || '(anonymous)'
    const key = `${name} @ ${frame.url?.replace(/^https?:\/\/[^/]+/, '') ?? ''}:${
      (frame.lineNumber ?? 0) + 1
    }`
    selfTime.set(key, (selfTime.get(key) ?? 0) + (deltas[i] ?? 0))
  }
  return [...selfTime.entries()]
    .map(([key, micros]) => ({ function: key, selfMs: round(micros / 1000) }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, limit)
}

async function panelBox(page, index) {
  const item = page.locator(`${PANEL_SELECTOR}`).nth(index)
  const handle = item.locator(HANDLE_SELECTOR)
  const box = await handle.boundingBox()
  if (!box) throw new Error(`panel ${index} has no drag handle box`)
  return { item, handle, box }
}

async function runDrag(page, index) {
  const { box } = await panelBox(page, index)
  const startX = box.x + Math.min(box.width - 8, box.width / 2)
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  const steps = 40
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(startX + step * 2.4, startY + step * 1.2)
    await page.waitForTimeout(48)
  }
  await page.mouse.up()
}

async function runResize(page, index) {
  const item = page.locator(`${PANEL_SELECTOR}`).nth(index)
  const handle = item.locator('.react-resizable-handle-se')
  const box = await handle.boundingBox()
  if (!box) throw new Error(`panel ${index} has no resize handle box`)
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  const steps = 30
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(startX + step * 2.5, startY + step * 2.5)
    await page.waitForTimeout(48)
  }
  await page.mouse.up()
}

async function runDragStops(page, index, cycles = 10) {
  const { box } = await panelBox(page, index)
  const startX = box.x + Math.min(box.width - 8, box.width / 2)
  const startY = box.y + box.height / 2
  const startedAt = Date.now()
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 12, startY + 6, { steps: 4 })
    await page.mouse.up()
    await page.mouse.move(startX - 12, startY - 6)
  }
  return Date.now() - startedAt
}

export async function measure({ url, label, workload = 'single' }) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: VIEWPORT })
  const seed = await seedContext(context, { workload })
  const page = await context.newPage()
  const requestLog = new Map()
  await mockApi(page, requestLog)

  page.on('pageerror', (error) => {
    console.error(`[${label}] pageerror: ${error.message}`)
  })

  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')
  await session.send('Profiler.enable')
  await session.send('Profiler.setSamplingInterval', { interval: 200 })

  const report = { label, url, workload, seed, scenarios: {}, requestLog: {} }

  // ---- mount (fresh context: the counters start at zero) ------------------------------------
  const cdpBeforeMount = await cdpMetrics(session)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => {
      const items = document.querySelectorAll('.react-grid-item').length
      const canvases = document.querySelectorAll('.react-grid-item canvas').length
      return items >= 6 && canvases >= 8
    },
    undefined,
    { timeout: 60_000 },
  )
  const mountDone = await readCounters(page)
  const cdpAfterMount = await cdpMetrics(session)
  report.scenarios.mount = {
    ms: round(mountDone.now),
    longTasks: longTaskStats(mountDone.longTasks),
    cdp: cdpDelta(cdpBeforeMount, cdpAfterMount),
    commits: mountDone.commits,
    canvases: await page.locator('.react-grid-item canvas').count(),
  }
  await page.waitForTimeout(1000)

  // ---- drag (2 s) ---------------------------------------------------------------------------
  await page.evaluate(() => {
    window.__perf.frames = []
    window.__perf.framesSampling = true
  })
  const cdpBeforeDrag = await cdpMetrics(session)
  const beforeDrag = await readCounters(page)
  await session.send('Profiler.start')
  const dragStartedAt = Date.now()
  await runDrag(page, 2)
  const dragWallMs = Date.now() - dragStartedAt
  const { profile: dragProfile } = await session.send('Profiler.stop')
  const afterDrag = await readCounters(page)
  const cdpAfterDrag = await cdpMetrics(session)
  await page.evaluate(() => {
    window.__perf.framesSampling = false
  })
  const dragStats = diffCounters(beforeDrag, afterDrag)
  report.scenarios.drag = {
    wallMs: dragWallMs,
    frames: frameStats(dragStats.frames),
    longTasks: longTaskStats(dragStats.longTasks),
    cdp: cdpDelta(cdpBeforeDrag, cdpAfterDrag),
    commits: dragStats.commits,
    storage: dragStats.storage,
    json: dragStats.json,
    topFunctions: topFunctions(dragProfile),
  }
  await page.waitForTimeout(500)

  // ---- 10 drag-stop cycles ------------------------------------------------------------------
  const cdpBeforeStops = await cdpMetrics(session)
  const beforeStops = await readCounters(page)
  const stopsWallMs = await runDragStops(page, 1)
  const afterStops = await readCounters(page)
  const cdpAfterStops = await cdpMetrics(session)
  const stopStats = diffCounters(beforeStops, afterStops)
  report.scenarios.dragStops = {
    wallMs: stopsWallMs,
    perCycleMs: round(stopsWallMs / 10),
    longTasks: longTaskStats(stopStats.longTasks),
    cdp: cdpDelta(cdpBeforeStops, cdpAfterStops),
    commits: stopStats.commits,
    storage: stopStats.storage,
    json: stopStats.json,
  }
  await page.waitForTimeout(500)

  // ---- resize (1.5 s) -----------------------------------------------------------------------
  await page.evaluate(() => {
    window.__perf.frames = []
    window.__perf.framesSampling = true
  })
  const cdpBeforeResize = await cdpMetrics(session)
  const beforeResize = await readCounters(page)
  await session.send('Profiler.start')
  const resizeStartedAt = Date.now()
  await runResize(page, 0)
  const resizeWallMs = Date.now() - resizeStartedAt
  const { profile: resizeProfile } = await session.send('Profiler.stop')
  const afterResize = await readCounters(page)
  const cdpAfterResize = await cdpMetrics(session)
  await page.evaluate(() => {
    window.__perf.framesSampling = false
  })
  const resizeStats = diffCounters(beforeResize, afterResize)
  report.scenarios.resize = {
    wallMs: resizeWallMs,
    frames: frameStats(resizeStats.frames),
    longTasks: longTaskStats(resizeStats.longTasks),
    cdp: cdpDelta(cdpBeforeResize, cdpAfterResize),
    commits: resizeStats.commits,
    storage: resizeStats.storage,
    json: resizeStats.json,
    topFunctions: topFunctions(resizeProfile),
  }

  report.requestLog = Object.fromEntries([...requestLog.entries()].sort())
  await browser.close()
  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  const report = await measure(args)
  const text = JSON.stringify(report, null, 2)
  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true })
    writeFileSync(args.out, `${text}\n`)
  }
  console.log(text)
}
