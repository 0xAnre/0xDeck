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
 *
 * The icon strip is the only shrinkable part of the header left block: with many workspaces it
 * scrolls horizontally inside a bounded width instead of pushing Theme/Widgets/Data Source/Screen
 * Lock out of view. The `+` button sits outside that strip, so it always stays reachable.
 */
export function WorkspaceSwitcher({
  workspaceIds,
  activeWorkspaceId,
  onSelect,
  onCreate,
}: WorkspaceSwitcherProps) {
  return (
    <div className="flex min-w-0 items-center gap-1" role="group" aria-label="Workspaces">
      <div
        className="flex min-w-0 max-w-[50vw] items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-slot="workspace-strip"
      >
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
              className={cn('shrink-0', !isActive && 'text-muted-foreground')}
              onClick={() => onSelect(workspaceId)}
            >
              <Icon />
            </Button>
          )
        })}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        aria-label="Yeni çalışma alanı ekle"
        title="Yeni çalışma alanı ekle"
        onClick={onCreate}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
