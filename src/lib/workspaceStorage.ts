/**
 * Pure workspace persistence core: grid-version migration, restore/patch of one workspace,
 * the stored payload mapping and load/save with an injected `localStorage`-like store.
 *
 * Deliberately free of React and `@/` aliases so `node --experimental-strip-types` can execute
 * `workspaceStorage.test.ts` directly (`npm run test:ui`); `layoutStorage.ts` is the thin app
 * adapter that plugs in the widget catalog (`resolvePanelInstance`) and the browser storage.
 *
 * Two data-preservation rules decide the shape below:
 *
 * - The persisted snapshot is never pruned at load time. Panel ids the current widget catalog
 *   cannot resolve stay in `activePanels` and their stored lg items stay in `preservedLayout`;
 *   both are written back untouched. Only `layouts` (what the grid renders) is filtered.
 * - A failed write-back (quota, private mode) never discards a successfully restored store.
 */
import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout'
import { BREAKPOINT_KEYS, COLS, type BreakpointKey } from '../breakpoints.ts'
import {
  MIGRATED_WORKSPACE_ID,
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_VERSION,
  activateWorkspace as activateWorkspaceInCollection,
  addWorkspace as addWorkspaceToCollection,
  createWorkspaceId,
  parseWorkspaceCollection,
  serializeWorkspaceCollection,
  updateWorkspace as updateWorkspaceInCollection,
  type WorkspaceCollection,
  type WorkspaceSnapshot,
} from './workspaceModel.ts'

export { WORKSPACE_STORAGE_KEY }

/** Column count of the pre-multi-workspace layout format. */
const LEGACY_LG_COLS = 12
const GRID_SCALE = COLS.lg / LEGACY_LG_COLS

const FALLBACK_GRID = { w: 12, h: 12 } as const

/** Grid-version stamp written for every workspace. */
export const CURRENT_GRID_VERSION = 3

/** Catalog grid of one panel instance; `undefined` means "this id is not in the catalog". */
export type PanelGrid = {
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

export type PanelGridLookup = (instanceId: string) => PanelGrid | undefined

export type WorkspaceState = {
  /**
   * Persisted panel ids in stored order. Ids the catalog cannot resolve stay here (they are
   * filtered when rendering) so a later save never deletes them.
   */
  activePanels: string[]
  /** Derived responsive layout for the resolvable panels only — never contains orphans. */
  layouts: ResponsiveLayouts
  /** Persisted lg items without a renderable panel, kept verbatim for the next save. */
  preservedLayout: LayoutItem[]
}

/** One workspace in memory: its stable id plus the derived responsive layout state. */
export type WorkspaceEntry = {
  id: string
  state: WorkspaceState
}

/**
 * All workspaces plus the last active one. `workspaces` always holds at least one entry
 * (`load` and every mutation keep that invariant).
 */
export type WorkspaceStore = WorkspaceCollection<WorkspaceEntry>

/** Minimal `localStorage` surface; a stub with the same shape is enough for the unit tests. */
export type WorkspaceStorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type WorkspaceStorageOptions = {
  storage: WorkspaceStorageLike
  lookupPanelGrid: PanelGridLookup
  defaultPanelIds: readonly string[]
  storageKey?: string
}

export type WorkspaceStorage = {
  /** Restores every workspace; a failed write-back keeps the restored result. */
  load(): WorkspaceStore
  /**
   * Writes `store`, merged with the envelope that is stored right now.
   *
   * `changedWorkspaceIds` names the workspaces this tab changed: only those override the stored
   * entry, every other stored workspace (including ones this tab has never seen) is kept. Omitted
   * means "every entry of `store` overrides the stored one, unknown stored entries are adopted"
   * (used by the load write-back, which must persist its migration).
   */
  save(store: WorkspaceStore, changedWorkspaceIds?: ReadonlySet<string>): void
  /** Derives one workspace state from its persisted ids + lg layout. */
  patch(activePanels: string[], layout: Layout): WorkspaceState
  /** Empty workspace state (new workspace, no panels, nothing preserved). */
  emptyState(): WorkspaceState
  /** Default workspace for a first run or an unreadable payload. */
  createDefaultStore(): WorkspaceStore
}

function emptyLayouts(): ResponsiveLayouts {
  return Object.fromEntries(BREAKPOINT_KEYS.map((bp) => [bp, []])) as ResponsiveLayouts
}

function emptyWorkspaceState(): WorkspaceState {
  return { activePanels: [], layouts: emptyLayouts(), preservedLayout: [] }
}

function migrateFromLegacyCols(layout: Layout): Layout {
  if (layout.length === 0) return layout

  return layout.map((item) => ({
    ...item,
    x: item.x * GRID_SCALE,
    y: item.y * GRID_SCALE,
    w: item.w * GRID_SCALE,
    h: item.h * GRID_SCALE,
    minW: item.minW != null ? item.minW * GRID_SCALE : undefined,
    minH: item.minH != null ? item.minH * GRID_SCALE : undefined,
    maxW: item.maxW != null ? item.maxW * GRID_SCALE : undefined,
    maxH: item.maxH != null ? item.maxH * GRID_SCALE : undefined,
  }))
}

/**
 * A layout needs the 12→36 column scaling when it was written for the legacy 12-column grid and
 * has not been stamped as current yet.
 *
 * `gridVersion === undefined` is a pre-version payload (12 columns by definition), so it is
 * scaled exactly once: the caller stamps `gridVersion: CURRENT_GRID_VERSION` when it persists the
 * result. Current-version layouts and already-wide (36-column) ones are left alone, which keeps a
 * second load a no-op.
 */
export function needsLegacyColMigration(layout: Layout, gridVersion?: number): boolean {
  if (gridVersion === CURRENT_GRID_VERSION) return false
  if (layout.length === 0) return false
  const maxW = Math.max(...layout.map((item) => item.w))
  return maxW <= LEGACY_LG_COLS
}

export function prepareStoredLayout(layout: Layout, gridVersion?: number): Layout {
  if (!needsLegacyColMigration(layout, gridVersion)) return layout
  return migrateFromLegacyCols(layout)
}

function attachCatalogConstraints(item: LayoutItem, lookup: PanelGridLookup): LayoutItem {
  const grid = lookup(item.i)
  if (!grid) return item

  const cols = COLS.lg
  const minW = Math.min(grid.minW ?? 1, cols)
  const minH = grid.minH ?? 1
  const w = Math.min(Math.max(item.w, minW), cols)

  return {
    ...item,
    w,
    x: Math.min(item.x, Math.max(0, cols - w)),
    minW,
    minH,
    maxW: item.maxW ?? grid.maxW,
    maxH: item.maxH ?? grid.maxH,
  }
}

function lgLayoutForPanels(
  activePanels: string[],
  lgLayout: Layout,
  lookup: PanelGridLookup,
): Layout {
  const cols = COLS.lg

  return activePanels.map((id) => {
    const savedItem = lgLayout.find((entry) => entry.i === id)
    if (savedItem) return attachCatalogConstraints(savedItem, lookup)

    const grid = lookup(id)
    if (!grid) return { i: id, x: 0, y: 0, ...FALLBACK_GRID }
    return { i: id, ...grid, minW: Math.min(grid.minW ?? 1, cols) }
  })
}

/** Stack panels on md/sm using lg visual order (top-to-bottom, left-to-right). */
function buildStackedLayout(
  activePanels: string[],
  lgLayout: Layout,
  breakpoint: BreakpointKey,
  lookup: PanelGridLookup,
): Layout {
  const cols = COLS[breakpoint]
  const ordered = [...activePanels].sort((a, b) => {
    const ia = lgLayout.find((item) => item.i === a)
    const ib = lgLayout.find((item) => item.i === b)
    const ya = ia?.y ?? 0
    const yb = ib?.y ?? 0
    if (ya !== yb) return ya - yb
    return (ia?.x ?? 0) - (ib?.x ?? 0)
  })

  let y = 0
  return ordered.map((id) => {
    const lgItem = lgLayout.find((item) => item.i === id)
    const grid = lookup(id)
    const h = lgItem?.h ?? grid?.h ?? FALLBACK_GRID.h
    const item: LayoutItem = {
      i: id,
      x: 0,
      y,
      w: cols,
      h,
      minW: Math.min(grid?.minW ?? 1, cols),
      minH: grid?.minH ?? 1,
    }
    y += h
    return item
  })
}

/**
 * Derives one workspace state. `activePanels` keeps every stored id (unknown ids included) and
 * every lg item that has no renderable panel is preserved verbatim, so persisting the result can
 * never drop stored data; only `layouts` — what react-grid-layout renders — is filtered.
 */
export function patchWorkspaceState(
  activePanels: string[],
  lgLayout: Layout,
  lookup: PanelGridLookup,
): WorkspaceState {
  const renderablePanels = activePanels.filter((id) => lookup(id) !== undefined)
  const renderable = new Set(renderablePanels)
  const preservedLayout = lgLayout.filter((item) => !renderable.has(item.i))

  if (renderablePanels.length === 0) {
    return { activePanels: [...activePanels], layouts: emptyLayouts(), preservedLayout }
  }

  const lg = lgLayoutForPanels(renderablePanels, lgLayout, lookup)
  return {
    activePanels: [...activePanels],
    layouts: {
      lg,
      md: buildStackedLayout(renderablePanels, lg, 'md', lookup),
      sm: buildStackedLayout(renderablePanels, lg, 'sm', lookup),
    },
    preservedLayout,
  }
}

/** Persisted shape of one workspace: the ids plus one lg layout (`md`/`sm` are derived on load). */
export function storeToStoredCollection(
  store: WorkspaceStore,
): WorkspaceCollection<WorkspaceSnapshot> {
  return {
    version: WORKSPACE_STORAGE_VERSION,
    activeWorkspaceId: store.activeWorkspaceId,
    workspaces: store.workspaces.map((entry) => ({
      id: entry.id,
      activePanels: [...entry.state.activePanels],
      // Catalog constraints are re-attached on load, so stored items stay as they were.
      layout: [...(entry.state.layouts.lg ?? []), ...entry.state.preservedLayout],
      gridVersion: CURRENT_GRID_VERSION,
    })),
  }
}

type RestoredWorkspace = {
  entry: WorkspaceEntry
  /** The stored payload still needs the grid-version / envelope migration written back. */
  needsPersist: boolean
}

function restoreWorkspace(
  stored: WorkspaceSnapshot,
  lookup: PanelGridLookup,
): RestoredWorkspace {
  // The model keeps grid payloads opaque; `prepareStoredLayout` owns the grid migration.
  const layout = stored.layout as readonly LayoutItem[] as Layout

  return {
    entry: {
      id: stored.id,
      state: patchWorkspaceState(stored.activePanels, prepareStoredLayout(layout, stored.gridVersion), lookup),
    },
    needsPersist:
      stored.gridVersion === undefined || needsLegacyColMigration(layout, stored.gridVersion),
  }
}

/**
 * Two-tab conflict policy for the shared `0xdeck-workspace` envelope.
 *
 * Every tab writes the whole envelope, so a naive `setItem` lets a stale tab delete workspaces the
 * other tab created (and revert their layouts). The policy is deliberately local and small:
 *
 * - a workspace this tab **changed** (`changedWorkspaceIds`) overrides the stored entry — this tab
 *   is the author of that change;
 * - every other stored workspace wins over this tab's copy, so a workspace created or edited in
 *   another tab is adopted instead of overwritten (this is what keeps a stale tab from deleting it);
 * - a workspace this tab has but storage does not is appended (a workspace created here).
 *
 * Order follows the stored envelope first, so another tab's workspace ordering is preserved.
 * Deletion is not a feature, so a stored workspace is never dropped by a merge.
 *
 * `activeWorkspaceId` is resolved by `resolveMergedActiveId`: the writer's own active id wins
 * whenever it exists in the merged set, and only then does the stored id apply (then the first
 * merged workspace). Because merging keeps every workspace this tab holds, the writer's id is in
 * practice always present, so the persisted value is the active workspace of whichever tab wrote
 * the envelope last — not "the workspace activated most recently" and not a global source of truth:
 * every tab keeps and renders its own active workspace, and any later write (a drag, a panel add)
 * from another tab replaces the persisted id with that tab's.
 */
export function mergeWorkspaceCollections(
  stored: WorkspaceCollection<WorkspaceSnapshot>,
  next: WorkspaceCollection<WorkspaceSnapshot>,
  changedWorkspaceIds: ReadonlySet<string>,
): WorkspaceCollection<WorkspaceSnapshot> {
  const nextById = new Map(next.workspaces.map((entry) => [entry.id, entry]))
  const merged: WorkspaceSnapshot[] = []
  const seen = new Set<string>()

  for (const entry of stored.workspaces) {
    seen.add(entry.id)
    const mine = nextById.get(entry.id)
    merged.push(mine && changedWorkspaceIds.has(entry.id) ? mine : entry)
  }

  for (const entry of next.workspaces) {
    if (seen.has(entry.id)) continue
    merged.push(entry)
  }

  return {
    version: WORKSPACE_STORAGE_VERSION,
    activeWorkspaceId: resolveMergedActiveId(merged, next.activeWorkspaceId, stored.activeWorkspaceId),
    workspaces: merged,
  }
}

function resolveMergedActiveId(
  workspaces: readonly { id: string }[],
  preferredId: string,
  fallbackId: string,
): string {
  if (workspaces.some((entry) => entry.id === preferredId)) return preferredId
  if (workspaces.some((entry) => entry.id === fallbackId)) return fallbackId
  return workspaces[0]?.id ?? preferredId
}

/**
 * Merge for a `storage` event: adopt the envelope another tab just wrote while keeping this tab's
 * active workspace (a switch in another tab is not a switch here) and its not-yet-saved edits.
 *
 * `pendingWorkspaceIds` are the workspaces this tab changed since it last read/wrote storage; their
 * local state wins so an in-flight drag or note edit is not thrown away by an unrelated external
 * change. Everything else follows storage, which owns the workspace list.
 */
export function adoptExternalWorkspaces(
  reloaded: WorkspaceStore,
  current: WorkspaceStore,
  pendingWorkspaceIds: ReadonlySet<string>,
): WorkspaceStore {
  const currentById = new Map(current.workspaces.map((entry) => [entry.id, entry]))
  const workspaces = reloaded.workspaces.map((entry) => {
    const local = currentById.get(entry.id)
    return local && pendingWorkspaceIds.has(entry.id) ? local : entry
  })

  return {
    version: WORKSPACE_STORAGE_VERSION,
    activeWorkspaceId: resolveMergedActiveId(
      workspaces,
      current.activeWorkspaceId,
      reloaded.activeWorkspaceId,
    ),
    workspaces,
  }
}

export function createWorkspaceStorage(options: WorkspaceStorageOptions): WorkspaceStorage {
  const { storage, lookupPanelGrid, defaultPanelIds } = options
  const storageKey = options.storageKey ?? WORKSPACE_STORAGE_KEY
  /**
   * Raw `storageKey` value this instance last read or wrote, plus the collection it parsed to.
   *
   * Every write merges the whole envelope, so a save has to know what is stored right now to see
   * whether another tab wrote it. Comparing the raw strings first keeps that read (a cheap
   * synchronous `getItem`) but skips the `JSON.parse` of the envelope whenever the stored payload is
   * still the one this tab produced itself — which is the normal case on the interaction path (a
   * drag or resize stop saves on every stop).
   *
   * The cached **collection** — not just the string — is what the merge runs against, and that is a
   * correctness requirement rather than an optimisation: a save that merged adopts the other tab's
   * workspaces into storage but not into this tab's in-memory store, so the next save still has to
   * merge against everything that is stored (dropping the merge here would silently delete a
   * workspace another tab created). A differing payload is parsed and merged exactly as before.
   */
  let lastRaw: string | null = null
  let lastCollection: WorkspaceCollection<WorkspaceSnapshot> | null = null

  function createDefaultState(): WorkspaceState {
    const activePanels = [...defaultPanelIds]
    const catalogLayout = activePanels.map((id) => {
      const grid = lookupPanelGrid(id)
      return grid ? { i: id, ...grid } : { i: id, x: 0, y: 0, ...FALLBACK_GRID }
    })
    return patchWorkspaceState(activePanels, catalogLayout, lookupPanelGrid)
  }

  function createDefaultStore(): WorkspaceStore {
    return {
      version: WORKSPACE_STORAGE_VERSION,
      activeWorkspaceId: MIGRATED_WORKSPACE_ID,
      workspaces: [{ id: MIGRATED_WORKSPACE_ID, state: createDefaultState() }],
    }
  }

  function save(store: WorkspaceStore, changedWorkspaceIds?: ReadonlySet<string>) {
    const next = storeToStoredCollection(store)
    let raw: string | null
    try {
      raw = storage.getItem(storageKey)
    } catch {
      // Storage unreadable (e.g. blocked): write this tab's envelope without a merge.
      raw = null
    }

    // Unchanged raw means the stored envelope is exactly the collection this tab last read or
    // wrote, so there is nothing new to parse — but it still has to be merged: it can hold
    // workspaces another tab created that this tab's store never adopted.
    const stored =
      raw === lastRaw ? lastCollection : (parseWorkspaceCollection(raw)?.collection ?? null)
    const merged = stored
      ? mergeWorkspaceCollections(
          stored,
          next,
          changedWorkspaceIds ?? new Set(next.workspaces.map((entry) => entry.id)),
        )
      : next
    const serialized = serializeWorkspaceCollection(merged)
    // Cache only after a successful write: a throwing `setItem` must leave the cache pointing at
    // what is actually stored, so the next save re-reads and re-merges.
    storage.setItem(storageKey, serialized)
    lastRaw = serialized
    lastCollection = merged
  }

  function load(): WorkspaceStore {
    let raw: string | null
    try {
      raw = storage.getItem(storageKey)
    } catch {
      // Storage unreadable (e.g. blocked): fall back to the default workspace.
      return createDefaultStore()
    }

    const parsed = parseWorkspaceCollection(raw)
    // Remember what this tab has seen, so the next save can merge from the parsed cache instead of
    // parsing the envelope again. An unreadable payload caches `null` (nothing to merge).
    lastRaw = raw
    lastCollection = parsed?.collection ?? null

    if (!parsed) return createDefaultStore()

    const restored = parsed.collection.workspaces.map((stored) =>
      restoreWorkspace(stored, lookupPanelGrid),
    )
    const store: WorkspaceStore = {
      version: WORKSPACE_STORAGE_VERSION,
      activeWorkspaceId: parsed.collection.activeWorkspaceId,
      workspaces: restored.map((item) => item.entry),
    }

    if (parsed.migrated || restored.some((item) => item.needsPersist)) {
      try {
        save(store)
      } catch {
        // Quota exceeded / private mode: keep the restored store and stay usable unsaved.
      }
    }
    return store
  }

  return {
    load,
    save,
    patch: (activePanels, layout) => patchWorkspaceState(activePanels, layout, lookupPanelGrid),
    emptyState: emptyWorkspaceState,
    createDefaultStore,
  }
}

/** Activates an existing workspace without touching any workspace's stored state. */
export function selectWorkspace(store: WorkspaceStore, workspaceId: string): WorkspaceStore {
  return activateWorkspaceInCollection(store, workspaceId)
}

/** Creates a new empty workspace and activates it immediately. */
export function createWorkspace(
  store: WorkspaceStore,
  emptyState: () => WorkspaceState,
  workspaceId?: string,
): WorkspaceStore {
  const id = workspaceId ?? createWorkspaceId(store.workspaces.map((entry) => entry.id))
  return addWorkspaceToCollection(store, { id, state: emptyState() })
}

/** Applies a state change to exactly one workspace; other workspaces keep their identity. */
export function updateWorkspaceState(
  store: WorkspaceStore,
  workspaceId: string,
  update: (state: WorkspaceState) => WorkspaceState,
): WorkspaceStore {
  return updateWorkspaceInCollection(store, workspaceId, (entry) => {
    const next = update(entry.state)
    return next === entry.state ? entry : { id: entry.id, state: next }
  })
}

/**
 * Persists `next` and returns it — or keeps `prev` when the write throws.
 *
 * Mounted widgets take their workspace id from React (`WorkspaceScopeContext`) and pass it
 * explicitly to `notesStorage` / `datasetStorage`, so a failed write cannot retarget them;
 * `resolveActiveWorkspaceId()` (`lib/workspaceScope.ts`) is only the fallback for unmounted and test
 * callers, and it reads the persisted envelope. Keeping `prev` therefore keeps memory and the
 * persisted per-tab active id — and therefore any fallback-scoped write — on the same workspace:
 * applying `next` unsaved would render a workspace the stored envelope does not name, and letting
 * the failure escape the click handler would leave the switch half-applied.
 */
export function saveWorkspaceChange(
  prev: WorkspaceStore,
  next: WorkspaceStore,
  save: (store: WorkspaceStore) => void,
): WorkspaceStore {
  if (next === prev) return prev

  try {
    save(next)
    return next
  } catch {
    return prev
  }
}
