import {
  LayoutDashboardIcon,
  LayoutGridIcon,
  PanelsTopLeftIcon,
  PlusIcon,
  SquareDashedIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Fixed monochrome icon cycle: workspace N always renders the same icon, whatever its id,
 * so switching workspaces never rearranges the switcher.
 */
const WORKSPACE_ICONS = [
  LayoutGridIcon,
  PanelsTopLeftIcon,
  LayoutDashboardIcon,
  SquareDashedIcon,
] as const

type WorkspaceSwitcherProps = {
  workspaceIds: string[]
  activeWorkspaceId: string
  onSelect: (workspaceId: string) => void
  onCreate: () => void
}

/**
 * Minimal header workspace switcher: icon-only buttons (no names, no dropdown) plus a `+`
 * button that creates and activates a new empty workspace. Sizing matches the other header
 * controls (`Button size="sm"`).
 */
export function WorkspaceSwitcher({
  workspaceIds,
  activeWorkspaceId,
  onSelect,
  onCreate,
}: WorkspaceSwitcherProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Workspaces">
      {workspaceIds.map((workspaceId, index) => {
        const Icon = WORKSPACE_ICONS[index % WORKSPACE_ICONS.length]
        const label = `Workspace ${index + 1}`
        const isActive = workspaceId === activeWorkspaceId

        return (
          <Button
            key={workspaceId}
            type="button"
            size="sm"
            variant={isActive ? 'secondary' : 'ghost'}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            className={cn(!isActive && 'text-muted-foreground')}
            onClick={() => onSelect(workspaceId)}
          >
            <Icon />
          </Button>
        )
      })}
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Yeni çalışma alanı ekle"
        title="Yeni çalışma alanı ekle"
        onClick={onCreate}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
