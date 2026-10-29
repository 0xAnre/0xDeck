/**
 * Pure multi-workspace model: workspace list operations, the persisted envelope and the
 * migration of the pre-multi-workspace `0xdeck-workspace` payload.
 *
 * Deliberately free of React, `@/` aliases and other runtime imports so
 * `node --experimental-strip-types` can execute `workspaceModel.test.ts` directly
 * (`npm run test:ui`).
 */

/** Envelope version written under `0xdeck-workspace`. */
export const WORKSPACE_STORAGE_VERSION = 2

/** localStorage key holding every workspace plus the active workspace id the last writer stamped. */
export const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'

/** Stable id of the workspace that a legacy single-workspace payload migrates into. */
export const MIGRATED_WORKSPACE_ID = 'ws-1'

export type WorkspaceHasId = { id: string }

/** One persisted react-grid-layout item (`i`, `x`, `y`, `w`, `h`, …); opaque here. */
export type WorkspaceLayoutItem = object

/** Persisted per-workspace layout payload (`lg` only, plus the grid migration version). */
export type WorkspaceSnapshot<Item extends WorkspaceLayoutItem = WorkspaceLayoutItem> =
  WorkspaceHasId & {
    activePanels: string[]
    layout: Item[]
    gridVersion?: number
  }

export type WorkspaceCollection<T extends WorkspaceHasId = WorkspaceSnapshot> = {
  version: number
  activeWorkspaceId: string
  workspaces: T[]
}

export type ParsedWorkspaceCollection = {
  collection: WorkspaceCollection<WorkspaceSnapshot>
  /** The raw payload was not in the current shape, so callers must persist the migrated result. */
  migrated: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toPanelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function toLayoutItems(value: unknown): WorkspaceLayoutItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord)
}

function toGridVersion(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseSnapshot(value: unknown): WorkspaceSnapshot | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id.length === 0) return null
  if (!Array.isArray(value.activePanels)) return null

  return {
    id: value.id,
    activePanels: toPanelIds(value.activePanels),
    layout: toLayoutItems(value.layout),
    gridVersion: toGridVersion(value.gridVersion),
  }
}

/** `{ activePanels, layout, gridVersion }` or `{ activePanels, layouts: { lg }, gridVersion }`. */
function parseLegacySnapshot(data: Record<string, unknown>): WorkspaceSnapshot | null {
  if (!Array.isArray(data.activePanels)) return null

  const legacyLayout = Array.isArray(data.layout)
    ? data.layout
    : isRecord(data.layouts) && Array.isArray(data.layouts.lg)
      ? data.layouts.lg
      : null
  if (!legacyLayout) return null

  return {
    id: MIGRATED_WORKSPACE_ID,
    activePanels: toPanelIds(data.activePanels),
    layout: toLayoutItems(legacyLayout),
    gridVersion: toGridVersion(data.gridVersion),
  }
}

export function createEmptyWorkspace<Item extends WorkspaceLayoutItem = WorkspaceLayoutItem>(
  id: string,
  gridVersion?: number,
): WorkspaceSnapshot<Item> {
  return { id, activePanels: [], layout: [], gridVersion }
}

export function createWorkspaceCollection<T extends WorkspaceHasId>(
  workspaces: T[],
  activeWorkspaceId: string = workspaces[0]?.id ?? '',
): WorkspaceCollection<T> {
  return { version: WORKSPACE_STORAGE_VERSION, activeWorkspaceId, workspaces }
}

/**
 * Parses the raw `0xdeck-workspace` value.
 *
 * - current envelope (`{ version, activeWorkspaceId, workspaces }`) → as stored, `migrated: false`
 * - legacy payload → one workspace (`ws-1`), `migrated: true`; `gridVersion` is preserved so the
 *   existing `layoutStorage` column migration still sees the original value
 */
export function parseWorkspaceCollection(
  raw: string | null,
): ParsedWorkspaceCollection | null {
  if (!raw) return null

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data)) return null

  if (Array.isArray(data.workspaces)) {
    const seen = new Set<string>()
    const workspaces: WorkspaceSnapshot[] = []
    for (const entry of data.workspaces) {
      const snapshot = parseSnapshot(entry)
      if (!snapshot || seen.has(snapshot.id)) continue
      seen.add(snapshot.id)
      workspaces.push(snapshot)
    }
    if (workspaces.length === 0) return null

    const requested =
      typeof data.activeWorkspaceId === 'string' ? data.activeWorkspaceId : ''
    return {
      collection: {
        version: WORKSPACE_STORAGE_VERSION,
        activeWorkspaceId: seen.has(requested) ? requested : workspaces[0].id,
        workspaces,
      },
      migrated: data.version !== WORKSPACE_STORAGE_VERSION,
    }
  }

  const legacy = parseLegacySnapshot(data)
  if (!legacy) return null

  return {
    collection: {
      version: WORKSPACE_STORAGE_VERSION,
      activeWorkspaceId: legacy.id,
      workspaces: [legacy],
    },
    migrated: true,
  }
}

export function serializeWorkspaceCollection(
  collection: WorkspaceCollection<WorkspaceSnapshot>,
): string {
  return JSON.stringify({
    version: WORKSPACE_STORAGE_VERSION,
    activeWorkspaceId: collection.activeWorkspaceId,
    workspaces: collection.workspaces.map((snapshot) => ({
      id: snapshot.id,
      activePanels: [...snapshot.activePanels],
      layout: [...snapshot.layout],
      gridVersion: snapshot.gridVersion,
    })),
  })
}

export function getActiveWorkspace<T extends WorkspaceHasId>(
  collection: WorkspaceCollection<T>,
): T | undefined {
  return (
    collection.workspaces.find((workspace) => workspace.id === collection.activeWorkspaceId) ??
    collection.workspaces[0]
  )
}

export function hasWorkspace<T extends WorkspaceHasId>(
  collection: WorkspaceCollection<T>,
  workspaceId: string,
): boolean {
  return collection.workspaces.some((workspace) => workspace.id === workspaceId)
}

/** Activates an existing workspace; an unknown or already active id returns the same collection. */
export function activateWorkspace<T extends WorkspaceHasId>(
  collection: WorkspaceCollection<T>,
  workspaceId: string,
): WorkspaceCollection<T> {
  if (collection.activeWorkspaceId === workspaceId) return collection
  if (!hasWorkspace(collection, workspaceId)) return collection
  return { ...collection, activeWorkspaceId: workspaceId }
}

/** Appends a workspace and activates it; a duplicate id is rejected (same collection). */
export function addWorkspace<T extends WorkspaceHasId>(
  collection: WorkspaceCollection<T>,
  workspace: T,
): WorkspaceCollection<T> {
  if (hasWorkspace(collection, workspace.id)) return collection
  return {
    ...collection,
    activeWorkspaceId: workspace.id,
    workspaces: [...collection.workspaces, workspace],
  }
}

/** Replaces one workspace entry; other workspaces keep their identity (no cross-workspace mutation). */
export function updateWorkspace<T extends WorkspaceHasId>(
  collection: WorkspaceCollection<T>,
  workspaceId: string,
  update: (workspace: T) => T,
): WorkspaceCollection<T> {
  const index = collection.workspaces.findIndex((workspace) => workspace.id === workspaceId)
  if (index === -1) return collection

  const current = collection.workspaces[index]
  const next = update(current)
  if (next === current) return collection

  const workspaces = [...collection.workspaces]
  workspaces[index] = next
  return { ...collection, workspaces }
}

function randomWorkspaceSuffix(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid.replace(/-/g, '').slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

/** Fresh id that is not yet used by `existingIds`. */
export function createWorkspaceId(
  existingIds: readonly string[] = [],
  suffix: string = randomWorkspaceSuffix(),
): string {
  const taken = new Set(existingIds)
  let candidate = `ws-${suffix}`
  let attempt = 1
  while (taken.has(candidate)) {
    candidate = `ws-${suffix}-${attempt}`
    attempt += 1
  }
  return candidate
}
