/**
 * Microbenchmark of one layout save (`createWorkspaceStorage().save`) on a realistic
 * `0xdeck-workspace` envelope (#200 follow-up).
 *
 * The browser suite (`perf/compare.mjs`) can only resolve the envelope cost down to
 * "N `JSON.parse` calls per drag stop" and whole-scenario script time, where ~1.8 s of panel-tree
 * re-rendering dominates. This isolates the persistence work #199 added on the interaction path:
 * read + `JSON.parse` + merge + re-serialize of every stored workspace, measured against the same
 * envelope size the app writes for a multi-workspace deck.
 *
 * Usage (from the repo root, Node ≥ 22 for `--experimental-strip-types`):
 *
 *   node --experimental-strip-types perf/save-cost.mjs --dir /tmp/0xdeck-perf-bb42a75
 *   node --experimental-strip-types perf/save-cost.mjs --dir . --target-bytes 46840
 *
 * `--dir` is the checkout whose `src/lib/workspaceStorage.ts` is measured (they are pure modules with
 * an injected storage, so no browser is needed). `--target-bytes` grows the seeded 5-workspace
 * envelope by duplicating Workspace 1 until the serialized payload reaches that many bytes — by
 * default the 46 840 bytes the browser writes for the `--workload multi` seed.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { multiWorkspacePayload } from './workload.mjs'

function parseArgs(argv) {
  const args = { dir: '.', targetBytes: 46_840, iterations: 200 }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '--dir') args.dir = argv[++i]
    else if (key === '--target-bytes') args.targetBytes = Number(argv[++i])
    else if (key === '--iterations') args.iterations = Number(argv[++i])
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const dir = resolve(args.dir)
const storageCore = await import(
  pathToFileURL(resolve(dir, 'src/lib/workspaceStorage.ts')).href
)
const workspaceModel = await import(
  pathToFileURL(resolve(dir, 'src/lib/workspaceModel.ts')).href
)
const serialize = (store) =>
  workspaceModel.serializeWorkspaceCollection(storageCore.storeToStoredCollection(store))

/** Realistic catalog grids by instance-id prefix (`resolvePanelInstance` is not importable outside Vite). */
const GRIDS = [
  ['btc-perpetual-chart-', { w: 18, h: 14, minW: 9, minH: 10 }],
  ['data-table-', { w: 18, h: 12, minW: 9, minH: 7 }],
  ['kpi-card-', { w: 6, h: 4, minW: 4, minH: 3 }],
  ['chart-', { w: 12, h: 10, minW: 9, minH: 7 }],
]

function lookupPanelGrid(instanceId) {
  const match = GRIDS.find(([prefix]) => instanceId.startsWith(prefix))
  if (!match) return undefined
  return { x: 0, y: 0, ...match[1] }
}

/** `localStorage` stub: in-memory string, same synchronous cost class as the real thing. */
function createStorage(initial) {
  let raw = initial
  return {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value
    },
  }
}

const seed = JSON.stringify(multiWorkspacePayload())
const core = storageCore.createWorkspaceStorage({
  storage: createStorage(seed),
  lookupPanelGrid,
  defaultPanelIds: [],
})

/** Grow the seed to the target size by cloning Workspace 1, the way a real deck accumulates workspaces. */
function storeWithEnvelopeOfAtLeast(bytes) {
  const base = core.load()
  const template = base.workspaces[0]
  let count = base.workspaces.length
  let store = base
  for (;;) {
    store = {
      ...store,
      workspaces: [...store.workspaces, { id: `ws-copy-${count}`, state: template.state }],
    }
    count += 1
    if (serialize(store).length >= bytes) return store
  }
}

const store = storeWithEnvelopeOfAtLeast(args.targetBytes)
const storage = createStorage(seed)
// Re-create the core over the measured storage so `lastRaw`/cache state matches a real tab: one load,
// then the first save (which writes every workspace), then the timed saves.
const measured = storageCore.createWorkspaceStorage({
  storage,
  lookupPanelGrid,
  defaultPanelIds: [],
})
const loaded = measured.load()
const primed = { ...loaded, workspaces: store.workspaces }
measured.save(primed, new Set(['ws-1']))

const envelope = storage.getItem()
const envelopeBytes = serialize(store).length

function moveWorkspace(workspaceId, y) {
  return storageCore.updateWorkspaceState(store, workspaceId, (state) => ({
    ...state,
    layouts: { ...state.layouts, lg: (state.layouts.lg ?? []).map((item) => ({ ...item, y })) },
  }))
}

const times = []
for (let iteration = 0; iteration < args.iterations; iteration += 1) {
  const next = moveWorkspace('ws-1', iteration % 20)
  const startedAt = process.hrtime.bigint()
  measured.save(next, new Set(['ws-1']))
  times.push(Number(process.hrtime.bigint() - startedAt) / 1e6)
}

const parseTimes = []
for (let iteration = 0; iteration < args.iterations; iteration += 1) {
  const startedAt = process.hrtime.bigint()
  JSON.parse(envelope)
  parseTimes.push(Number(process.hrtime.bigint() - startedAt) / 1e6)
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
const p95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}
const round = (value) => Math.round(value * 1000) / 1000

console.log(
  JSON.stringify(
    {
      dir,
      workspaces: store.workspaces.length,
      envelopeBytes,
      saves: args.iterations,
      saveMedianMs: round(median(times)),
      saveP95Ms: round(p95(times)),
      envelopeParseMedianMs: round(median(parseTimes)),
    },
    null,
    2,
  ),
)
