import type { ReactNode } from 'react'
import { WorkspaceScopeContext } from '@/context/workspaceScopeContextValue'

type WorkspaceScopeProviderProps = {
  /** Active workspace id of this tab (`workspaces.activeWorkspaceId` in `App.tsx`). */
  workspaceId: string
  children: ReactNode
}

/**
 * Hands the active workspace id of **this tab** to the panel tree. Every workspace-scoped write
 * (`notesStorage`, `datasetStorage`) uses it explicitly, so a tab that still renders Workspace 1
 * keeps writing Workspace 1 even while another tab has activated Workspace 2.
 */
export function WorkspaceScopeProvider({ workspaceId, children }: WorkspaceScopeProviderProps) {
  return (
    <WorkspaceScopeContext.Provider value={workspaceId}>
      {children}
    </WorkspaceScopeContext.Provider>
  )
}
