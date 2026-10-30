/**
 * Before/after benchmark for Issue #200: measures the same chart workload on two revisions and
 * prints the comparison table.
 *
 * One command (from the repo root):
 *
 *   npm run perf:compare -- --before /tmp/0xdeck-perf-baseline [--after .] [--repeats 3]
 *
 * `--before`/`--after` are checkout directories. For each one the harness builds it (production
 * mode, `--skip-build` to reuse an existing `dist/`), starts `vite preview` on its own port, runs the
 * full measurement suite in headless Chromium (`perf/measure.mjs`) `--repeats` times and reports the
 * median of every metric — so a single noisy run cannot decide the result.
 *
 * `--mode dev` runs the dev servers instead: React's per-component commit attribution only works
 * there (production names are minified), so the `dev` table is the one that names which components
 * re-render during a drag/resize.
 *
 * Both runs get the identical seeded workspace, identical widget settings and identical mocked
 * `/api/*` bytes (see `perf/workload.mjs`), so the only variable is the revision under test.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { measure } from './measure.mjs'

function parseArgs(argv) {
  const args = {
    before: null,
    after: '.',
    mode: 'prod',
    repeats: 3,
    out: null,
    skipBuild: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '--before') args.before = argv[++i]
    else if (key === '--after') args.after = argv[++i]
    else if (key === '--mode') args.mode = argv[++i]
    else if (key === '--repeats') args.repeats = Number(argv[++i])
    else if (key === '--out') args.out = argv[++i]
    else if (key === '--skip-build') args.skipBuild = true
  }
  if (!args.before) throw new Error('--before <checkout-dir> is required')
  return args
}

const round = (value) => Math.round(value * 100) / 100

function run(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(`${command} ${args.join(' ')} failed (${code})\n${stderr}`))
    })
  })
}

async function waitForServer(url, timeoutMs = 120_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  throw new Error(`server at ${url} did not start`)
}

const servers = []

function startServer(cwd, port, mode) {
  const command = mode === 'dev' ? 'npm' : 'npx'
  const args =
    mode === 'dev' ? ['run', 'dev', '--', '--port', String(port)] : ['vite', 'preview', '--port', String(port), '--strictPort']
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] })
  servers.push(child)
  return child
}

function stopServers() {
  for (const child of servers.splice(0)) {
    try {
      child.kill('SIGTERM')
    } catch {
      // already gone
    }
  }
}

process.on('exit', stopServers)
process.on('SIGINT', () => {
  stopServers()
  process.exit(130)
})

function medianOfNumbers(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return round(value)
}

/** Median of every numeric leaf of same-shaped reports; non-numeric leaves come from the middle run. */
function medianTree(nodes) {
  const first = nodes[0]
  if (typeof first === 'number') {
    return medianOfNumbers(nodes.filter((node) => typeof node === 'number'))
  }
  if (Array.isArray(first)) return nodes[Math.floor(nodes.length / 2)]
  if (first && typeof first === 'object') {
    return Object.fromEntries(
      Object.keys(first).map((key) => [key, medianTree(nodes.map((node) => node?.[key]))]),
    )
  }
  return first
}

function medianReport(reports, profileKey) {
  const byProfile = [...reports].sort((a, b) => profileKey(a) - profileKey(b))
  const base = byProfile[Math.floor(byProfile.length / 2)]
  const merged = medianTree(
    reports.map((report) => ({
      label: report.label,
      url: report.url,
      scenarios: report.scenarios,
      requestLog: report.requestLog,
    })),
  )
  // Function-level profiles are not medians: show the ones of the run with the median drag script
  // time, so the attribution matches the table.
  merged.topFunctionsByScenario = Object.fromEntries(
    Object.entries(base.scenarios).map(([scenario, value]) => [scenario, value.topFunctions ?? []]),
  )
  return merged
}

function formatTable(before, after, rows, devMode) {
  const lines = [`| metric | before | after | delta |`, `| --- | --- | --- | --- |`]
  for (const [label, path, devOnly] of rows) {
    // Per-component commit names survive only in dev builds (production names are minified).
    if (devOnly && !devMode) continue
    // A missing per-component commit counter means "this component did not render": show 0.
    const readCounter = (report) => {
      const value = readPath(report, path)
      return value === undefined && path.includes('.byName.') ? 0 : value
    }
    const beforeValue = readCounter(before)
    const afterValue = readCounter(after)
    const delta =
      typeof beforeValue === 'number' && typeof afterValue === 'number' && beforeValue !== 0
        ? `${Math.round(((afterValue - beforeValue) / beforeValue) * 1000) / 10}%`
        : '—'
    lines.push(`| ${label} | ${formatValue(beforeValue)} | ${formatValue(afterValue)} | ${delta} |`)
  }
  return lines.join('\n')
}

function readPath(report, path) {
  return path.split('.').reduce((value, key) => (value === undefined ? undefined : value[key]), report)
}

function formatValue(value) {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, child]) => typeof child === 'number')
      .map(([key, child]) => `${key}=${child}`)
      .join(', ')
  }
  return String(value)
}

const ROWS = [
  ['mount → 6 panels + charts painted (ms)', 'scenarios.mount.ms'],
  ['mount long-task total (ms)', 'scenarios.mount.longTasks.totalMs'],
  ['mount script time (ms)', 'scenarios.mount.cdp.ScriptDuration'],
  ['drag: scripted wall time (ms)', 'scenarios.drag.wallMs'],
  ['drag: frames per second', 'scenarios.drag.frames.fps'],
  ['drag: dropped frames > 25 ms', 'scenarios.drag.frames.dropped'],
  ['drag: worst frame (ms)', 'scenarios.drag.frames.maxMs'],
  ['drag: long-task total (ms)', 'scenarios.drag.longTasks.totalMs'],
  ['drag: script time (ms)', 'scenarios.drag.cdp.ScriptDuration'],
  ['drag: React commits (all components)', 'scenarios.drag.commits.total'],
  ['drag: chart-panel commits', 'scenarios.drag.commits.byName.BtcPerpetualChartPanel', true],
  ['drag: envelope reads (getItem)', 'scenarios.drag.storage.workspaceGet'],
  ['drag: envelope JSON.parse calls', 'scenarios.drag.json.parse'],
  ['10 drag stops: wall time (ms)', 'scenarios.dragStops.wallMs'],
  ['10 drag stops: long-task total (ms)', 'scenarios.dragStops.longTasks.totalMs'],
  ['10 drag stops: script time (ms)', 'scenarios.dragStops.cdp.ScriptDuration'],
  ['10 drag stops: React commits', 'scenarios.dragStops.commits.total'],
  ['10 drag stops: chart-panel commits', 'scenarios.dragStops.commits.byName.BtcPerpetualChartPanel', true],
  ['10 drag stops: envelope reads (getItem)', 'scenarios.dragStops.storage.workspaceGet'],
  ['10 drag stops: envelope JSON.parse calls', 'scenarios.dragStops.json.parse'],
  ['10 drag stops: envelope bytes written', 'scenarios.dragStops.storage.workspaceBytes'],
  ['resize: frames per second', 'scenarios.resize.frames.fps'],
  ['resize: long-task total (ms)', 'scenarios.resize.longTasks.totalMs'],
  ['resize: script time (ms)', 'scenarios.resize.cdp.ScriptDuration'],
  ['resize: React commits', 'scenarios.resize.commits.total'],
  ['resize: chart-panel commits', 'scenarios.resize.commits.byName.BtcPerpetualChartPanel', true],
]

async function measureRevision(dir, port, mode, repeats, skipBuild) {
  const cwd = resolve(dir)
  if (!existsSync(cwd)) throw new Error(`no such directory: ${cwd}`)
  if (mode === 'prod' && !skipBuild) {
    process.stderr.write(`building ${cwd} …\n`)
    await run('npm', ['run', 'build'], cwd)
  }

  startServer(cwd, port, mode)
  const url = `http://localhost:${port}/`
  await waitForServer(url)
  process.stderr.write(`measuring ${cwd} (${mode}) …\n`)

  const reports = []
  try {
    for (let i = 0; i < repeats; i += 1) {
      reports.push(await measure({ url, label: `${cwd}#${i + 1}` }))
      process.stderr.write(`  run ${i + 1}/${repeats}\n`)
    }
  } finally {
    stopServers()
  }

  return medianReport(reports, (report) => report.scenarios.drag.cdp.ScriptDuration)
}

const args = parseArgs(process.argv.slice(2))
const before = await measureRevision(args.before, 57471, args.mode, args.repeats, args.skipBuild)
const after = await measureRevision(args.after, 57472, args.mode, args.repeats, args.skipBuild)

const table = [
  `### 0xDeck issue #200 — ${args.mode === 'dev' ? 'dev server' : 'production build'} (median of ${args.repeats} runs)`,
  '',
  formatTable(before, after, ROWS, args.mode === 'dev'),
  '',
  'Chart-panel commit counters (dev mode only; production function names are minified):',
  '',
  '```',
  `before drag commits: ${JSON.stringify(before.scenarios.drag.commits)}`,
  `after  drag commits: ${JSON.stringify(after.scenarios.drag.commits)}`,
  '```',
].join('\n')

console.log(table)

if (args.out) {
  mkdirSync(args.out, { recursive: true })
  writeFileSync(join(args.out, `compare-${args.mode}.md`), `${table}\n`)
  writeFileSync(
    join(args.out, `compare-${args.mode}.json`),
    `${JSON.stringify({ mode: args.mode, before, after }, null, 2)}\n`,
  )
}
