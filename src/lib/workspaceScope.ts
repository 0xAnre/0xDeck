/**
 * Active-workspace accessor for storage keys that are scoped per workspace.
 *
 * A few values used to be single global singletons (`0xdeck-notes`, `0xdeck-data-config`). They are
 * now stored as `<key>:<workspaceId>` so each workspace keeps its own content, while the legacy
 * singleton keeps belonging to the pre-existing **Workspace 1**.
 *
 * Pure and alias-free so `node --experimental-strip-types` can execute it (`npm run test:ui`).
 */
import {
  MIGRATED_WORKSPACE_ID,
  WORKSPACE_STORAGE_KEY,
  parseWorkspaceCollection,
} from './workspaceModel.ts'

export { WORKSPACE_STORAGE_KEY }

/**
 * Cached parse of `0xdeck-workspace`. Readers run on every render of some widgets, so the active id
 * is only re-parsed when the raw payload actually changed (every workspace save rewrites it).
 */
let cachedRaw: string | null | undefined
let cachedWorkspaceId: string = MIGRATED_WORKSPACE_ID

/** Active workspace id of a raw `0xdeck-workspace` value; Workspace 1 when unusable. */
export function parseActiveWorkspaceId(raw: string | null): string {
  return parseWorkspaceCollection(raw)?.collection.activeWorkspaceId ?? MIGRATED_WORKSPACE_ID
}

/** Id of the workspace that is active right now (Workspace 1 when nothing is stored yet). */
export function resolveActiveWorkspaceId(): string {
  let raw: string | null
  try {
    raw = localStorage.getItem(WORKSPACE_STORAGE_KEY)
  } catch {
    return MIGRATED_WORKSPACE_ID
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedWorkspaceId = parseActiveWorkspaceId(raw)
  }
  return cachedWorkspaceId
}

/** `<baseKey>:<workspaceId>` — the workspace-scoped storage key. */
export function workspaceScopedKey(
  baseKey: string,
  workspaceId: string = resolveActiveWorkspaceId(),
): string {
  return `${baseKey}:${workspaceId}`
}

/**
 * Reads a workspace-scoped value. The legacy singleton is only offered to Workspace 1 (the
 * workspace it was written for); every other workspace starts from its own default.
 */
export function readScopedValue(
  baseKey: string,
  workspaceId: string = resolveActiveWorkspaceId(),
): string | null {
  const scoped = localStorage.getItem(workspaceScopedKey(baseKey, workspaceId))
  if (scoped !== null) return scoped
  return workspaceId === MIGRATED_WORKSPACE_ID ? localStorage.getItem(baseKey) : null
}

/** Test seam: forgets the cached active workspace id. */
export function resetActiveWorkspaceCache() {
  cachedRaw = undefined
  cachedWorkspaceId = MIGRATED_WORKSPACE_ID
}
