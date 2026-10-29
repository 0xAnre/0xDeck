import { createContext, useContext } from 'react'

/**
 * Id of the workspace the mounted panel tree renders.
 *
 * Widgets persist workspace-scoped values (`0xdeck-notes:<id>`, `0xdeck-data-config:<id>`) and
 * must never decide their write target by re-reading `0xdeck-workspace`: another tab can activate
 * a different workspace at any time, and a stale tab that resolved the id at save time would write
 * the workspace it *renders* into the workspace that is *active in storage*.
 *
 * `null` outside the provider so a widget that forgets it fails loudly instead of silently falling
 * back to a global lookup.
 */
export const WorkspaceScopeContext = createContext<string | null>(null)

/** Whatever the provider above the panel tree hands down as `props.workspaceId`. */
export function useWorkspaceScope(): string {
  const workspaceId = useContext(WorkspaceScopeContext)
  if (workspaceId === null) {
    throw new Error('useWorkspaceScope must be used within WorkspaceScopeProvider')
  }
  return workspaceId
}
