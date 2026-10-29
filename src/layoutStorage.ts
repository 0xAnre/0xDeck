import type { Layout } from 'react-grid-layout'
import {
  DEFAULT_ACTIVE_PANELS,
  createLayoutItem,
  createPanelInstance,
  getPanelTemplate,
  resolvePanelInstance,
} from './panels'
import {
  WORKSPACE_STORAGE_KEY,
  createWorkspaceStorage,
  createWorkspace as createWorkspaceInStore,
  selectWorkspace as selectWorkspaceInStore,
  updateWorkspaceState as updateWorkspaceStateInStore,
  type WorkspaceState,
  type WorkspaceStore,
} from './lib/workspaceStorage'

export {
  CURRENT_GRID_VERSION,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceEntry,
  type WorkspaceState,
  type WorkspaceStore,
} from './lib/workspaceStorage'

/**
 * App adapter over the pure workspace persistence core (`src/lib/workspaceStorage.ts`): it plugs in
 * the browser `localStorage` and the widget catalog (`resolvePanelInstance`) so the core itself stays
 * testable under `node --experimental-strip-types`.
 */
const workspaceStorage = createWorkspaceStorage({
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
  lookupPanelGrid: (instanceId) => resolvePanelInstance(instanceId)?.grid,
  defaultPanelIds: DEFAULT_ACTIVE_PANELS,
  storageKey: WORKSPACE_STORAGE_KEY,
})

/**
 * Loads every workspace, migrating the legacy single-workspace payload (both the older
 * `layout` variant and the newer `layouts.lg` one) into Workspace 1 in place.
 */
export function loadWorkspaces(): WorkspaceStore {
  return workspaceStorage.load()
}

export function saveWorkspaces(store: WorkspaceStore) {
  workspaceStorage.save(store)
}

/** Activates an existing workspace without touching any workspace's stored state. */
export function selectWorkspace(store: WorkspaceStore, workspaceId: string): WorkspaceStore {
  return selectWorkspaceInStore(store, workspaceId)
}

/** Creates a new empty workspace and activates it immediately. */
export function createWorkspace(store: WorkspaceStore, workspaceId?: string): WorkspaceStore {
  return createWorkspaceInStore(store, workspaceStorage.emptyState, workspaceId)
}

/** Applies a state change to exactly one workspace; other workspaces keep their identity. */
export function updateWorkspaceState(
  store: WorkspaceStore,
  workspaceId: string,
  update: (state: WorkspaceState) => WorkspaceState,
): WorkspaceStore {
  return updateWorkspaceStateInStore(store, workspaceId, update)
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

  // Preserved (unresolvable) items stay in the payload; the new panel goes below every item.
  const lg = appendToLg(
    [...(state.layouts.lg ?? []), ...state.preservedLayout],
    instance.id,
    templateId,
  )
  return workspaceStorage.patch([...state.activePanels, instance.id], lg)
}

export function removePanel(
  state: WorkspaceState,
  panelId: string,
): WorkspaceState | null {
  if (!state.activePanels.includes(panelId)) return null

  // Only the addressed panel is dropped; preserved (unresolvable) items stay untouched.
  const lg = [
    ...(state.layouts.lg ?? []).filter((item) => item.i !== panelId),
    ...state.preservedLayout.filter((item) => item.i !== panelId),
  ]
  return workspaceStorage.patch(
    state.activePanels.filter((id) => id !== panelId),
    lg,
  )
}
