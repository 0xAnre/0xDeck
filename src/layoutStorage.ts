import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout'
import { BREAKPOINT_KEYS, COLS, type BreakpointKey } from './breakpoints'
import {
  DEFAULT_ACTIVE_PANELS,
  createLayoutItem,
  createPanelInstance,
  getPanelTemplate,
  isPanelInstanceId,
  resolvePanelInstance,
} from './panels'
import {
  MIGRATED_WORKSPACE_ID,
  WORKSPACE_STORAGE_VERSION,
  activateWorkspace as activateWorkspaceInCollection,
  addWorkspace as addWorkspaceToCollection,
  createWorkspaceId,
  parseWorkspaceCollection,
  serializeWorkspaceCollection,
  updateWorkspace as updateWorkspaceInCollection,
  type WorkspaceCollection,
  type WorkspaceSnapshot,
} from './lib/workspaceModel'

export const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'
const LEGACY_LG_COLS = 12
const GRID_SCALE = COLS.lg / LEGACY_LG_COLS

const FALLBACK_GRID = { w: 12, h: 12 } as const

export type WorkspaceState = {
  activePanels: string[]
  layouts: ResponsiveLayouts
}

/** One workspace in memory: its stable id plus the derived responsive layout state. */
export type WorkspaceEntry = {
  id: string
  state: WorkspaceState
}

/**
 * All workspaces plus the last active one. `workspaces` always holds at least one entry
 * (`loadWorkspaces` and every mutation below keep that invariant).
 */
export type WorkspaceStore = WorkspaceCollection<WorkspaceEntry>

/** Persisted per-workspace shape — only lg layout is stored; md/sm are derived on load. */
type StoredWorkspace = WorkspaceSnapshot

const CURRENT_GRID_VERSION = 3

function emptyLayouts(): ResponsiveLayouts {
  return Object.fromEntries(
    BREAKPOINT_KEYS.map((bp) => [bp, []]),
  ) as ResponsiveLayouts
}

function emptyWorkspaceState(): WorkspaceState {
  return { activePanels: [], layouts: emptyLayouts() }
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

function needsLegacyColMigration(
  layout: Layout,
  gridVersion?: number,
): boolean {
  if (gridVersion === CURRENT_GRID_VERSION) return false
  if (layout.length === 0) return false
  if (gridVersion === undefined) return false
  const maxW = Math.max(...layout.map((item) => item.w))
  return maxW <= LEGACY_LG_COLS
}

function prepareStoredLayout(
  layout: Layout,
  gridVersion?: number,
): Layout {
  if (!needsLegacyColMigration(layout, gridVersion)) return layout
  return migrateFromLegacyCols(layout)
}

function attachCatalogConstraints(item: LayoutItem): LayoutItem {
  const panel = resolvePanelInstance(item.i)
  if (!panel) return item

  const cols = COLS.lg
  const minW = Math.min(panel.grid.minW ?? 1, cols)
  const minH = panel.grid.minH ?? 1
  const w = Math.min(Math.max(item.w, minW), cols)

  return {
    ...item,
    w,
    x: Math.min(item.x, Math.max(0, cols - w)),
    minW,
    minH,
    maxW: item.maxW ?? panel.grid.maxW,
    maxH: item.maxH ?? panel.grid.maxH,
  }
}

function lgLayoutForPanels(activePanels: string[], lgLayout: Layout): Layout {
  const cols = COLS.lg

  return activePanels.map((id) => {
    const savedItem = lgLayout.find((entry) => entry.i === id)
    if (savedItem) return attachCatalogConstraints(savedItem)

    const panel = resolvePanelInstance(id)
    if (!panel) return { i: id, x: 0, y: 0, ...FALLBACK_GRID }
    return { i: id, ...panel.grid, minW: Math.min(panel.grid.minW ?? 1, cols) }
  })
}

/** Stack panels on md/sm using lg visual order (top-to-bottom, left-to-right). */
function buildStackedLayout(
  activePanels: string[],
  lgLayout: Layout,
  breakpoint: BreakpointKey,
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
    const panel = resolvePanelInstance(id)
    const h = lgItem?.h ?? panel?.grid.h ?? FALLBACK_GRID.h
    const item: LayoutItem = {
      i: id,
      x: 0,
      y,
      w: cols,
      h,
      minW: Math.min(panel?.grid.minW ?? 1, cols),
      minH: panel?.grid.minH ?? 1,
    }
    y += h
    return item
  })
}

/** Toggle path — preserve lg geometry; only add/remove items, refresh md/sm. */
function patchWorkspace(activePanels: string[], lgLayout: Layout): WorkspaceState {
  const panels = activePanels.filter((id) => isPanelInstanceId(id))

  if (panels.length === 0) {
    return emptyWorkspaceState()
  }

  const lg = lgLayoutForPanels(panels, lgLayout)
  return {
    activePanels: panels,
    layouts: {
      lg,
      md: buildStackedLayout(panels, lg, 'md'),
      sm: buildStackedLayout(panels, lg, 'sm'),
    },
  }
}

function buildDefaultWorkspace(): WorkspaceState {
  const activePanels = [...DEFAULT_ACTIVE_PANELS]
  const catalogLayout = activePanels.map((id) => {
    const panel = resolvePanelInstance(id)
    return panel ? { i: id, ...panel.grid } : { i: id, x: 0, y: 0, ...FALLBACK_GRID }
  })
  return patchWorkspace(activePanels, catalogLayout)
}

function buildDefaultStore(): WorkspaceStore {
  return {
    version: WORKSPACE_STORAGE_VERSION,
    activeWorkspaceId: MIGRATED_WORKSPACE_ID,
    workspaces: [{ id: MIGRATED_WORKSPACE_ID, state: buildDefaultWorkspace() }],
  }
}

type RestoredWorkspace = {
  entry: WorkspaceEntry
  /** The stored payload still needs the grid-version / envelope migration written back. */
  needsPersist: boolean
}

function restoreWorkspace(stored: StoredWorkspace): RestoredWorkspace {
  // The model keeps grid payloads opaque; `prepareStoredLayout` owns the grid migration.
  const layout = stored.layout as readonly LayoutItem[] as Layout
  const migratedLayout = prepareStoredLayout(layout, stored.gridVersion)

  return {
    entry: { id: stored.id, state: patchWorkspace(stored.activePanels, migratedLayout) },
    needsPersist:
      stored.gridVersion === undefined ||
      needsLegacyColMigration(layout, stored.gridVersion),
  }
}

function toStoredCollection(store: WorkspaceStore): WorkspaceCollection<StoredWorkspace> {
  return {
    version: WORKSPACE_STORAGE_VERSION,
    activeWorkspaceId: store.activeWorkspaceId,
    workspaces: store.workspaces.map((entry) => ({
      id: entry.id,
      activePanels: entry.state.activePanels,
      // The catalog constraints are re-attached on load, so the stored item stays as-is.
      layout: [...(entry.state.layouts.lg ?? [])],
      gridVersion: CURRENT_GRID_VERSION,
    })),
  }
}

/**
 * Loads every workspace, migrating the legacy single-workspace payload (both the older
 * `layout` variant and the newer `layouts.lg` one) into Workspace 1 in place.
 */
export function loadWorkspaces(): WorkspaceStore {
  try {
    const parsed = parseWorkspaceCollection(localStorage.getItem(WORKSPACE_STORAGE_KEY))
    if (!parsed) return buildDefaultStore()

    const restored = parsed.collection.workspaces.map(restoreWorkspace)
    const store: WorkspaceStore = {
      version: WORKSPACE_STORAGE_VERSION,
      activeWorkspaceId: parsed.collection.activeWorkspaceId,
      workspaces: restored.map((item) => item.entry),
    }

    if (parsed.migrated || restored.some((item) => item.needsPersist)) {
      saveWorkspaces(store)
    }
    return store
  } catch {
    return buildDefaultStore()
  }
}

export function saveWorkspaces(store: WorkspaceStore) {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspaceCollection(toStoredCollection(store)))
}

/** Activates an existing workspace without touching any workspace's stored state. */
export function selectWorkspace(store: WorkspaceStore, workspaceId: string): WorkspaceStore {
  return activateWorkspaceInCollection(store, workspaceId)
}

/** Creates a new empty workspace and activates it immediately. */
export function createWorkspace(store: WorkspaceStore, workspaceId?: string): WorkspaceStore {
  const id =
    workspaceId ?? createWorkspaceId(store.workspaces.map((entry) => entry.id))
  return addWorkspaceToCollection(store, { id, state: emptyWorkspaceState() })
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

export function lgLayoutEqual(a: Layout = [], b: Layout = []): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((item) => [item.i, item]))
  return a.every((item) => {
    const other = byId.get(item.i)
    if (!other) return false
    return (
      item.x === other.x &&
      item.y === other.y &&
      item.w === other.w &&
      item.h === other.h
    )
  })
}

function appendToLg(layout: Layout, instanceId: string, templateId: string): Layout {
  const template = getPanelTemplate(templateId)
  if (!template) return layout

  const bottom = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  return [...layout, createLayoutItem(template, instanceId, bottom)]
}

export function appendPanel(
  state: WorkspaceState,
  templateId: string,
): WorkspaceState | null {
  const instance = createPanelInstance(templateId)
  if (!instance) return null

  const lg = appendToLg(state.layouts.lg ?? [], instance.id, templateId)
  return patchWorkspace([...state.activePanels, instance.id], lg)
}

export function removePanel(
  state: WorkspaceState,
  panelId: string,
): WorkspaceState | null {
  if (!state.activePanels.includes(panelId)) return null

  const lg = (state.layouts.lg ?? []).filter((item) => item.i !== panelId)
  return patchWorkspace(
    state.activePanels.filter((id) => id !== panelId),
    lg,
  )
}
