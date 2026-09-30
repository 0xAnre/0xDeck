import { useState } from 'react'
import { ChevronDownIcon, Trash2Icon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatFixedRangeVolumeProfileInstanceLabel } from '@/market/fixedRangeVolumeProfileInstances'
import type { FixedRangeVolumeProfileInstance } from '@/market/fixedRangeVolumeProfileInstances'
import { HEADER_CONTROL_TRIGGER_CLASS } from '@/widgetSettings/HeaderSelect'

type HeaderToolsMenuProps = {
  id: string
  disabled?: boolean
  fixedRangeVolumeProfileInstances: FixedRangeVolumeProfileInstance[]
  onFixedRangeVolumeProfileArm?: () => void
  onFixedRangeVolumeProfileDelete?: (instanceId: string) => void
}

export function HeaderToolsMenu({
  id,
  disabled = false,
  fixedRangeVolumeProfileInstances,
  onFixedRangeVolumeProfileArm,
  onFixedRangeVolumeProfileDelete,
}: HeaderToolsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const armTool = () => {
    onFixedRangeVolumeProfileArm?.()
    setMenuOpen(false)
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger
        id={id}
        disabled={disabled}
        aria-label="Tools"
        className={cn(
          HEADER_CONTROL_TRIGGER_CLASS,
          'flex w-[4.25rem] items-center justify-between gap-1 whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        )}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span>Tools</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[16rem]">
        <DropdownMenuItem disabled={disabled} onSelect={armTool}>
          Fixed Range Volume Profile
        </DropdownMenuItem>
        {fixedRangeVolumeProfileInstances.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {fixedRangeVolumeProfileInstances.map((instance) => (
              <DropdownMenuItem
                key={instance.id}
                className="flex items-center justify-between gap-2"
                onSelect={(event) => event.preventDefault()}
              >
                <span className="min-w-0 truncate text-xs">
                  {formatFixedRangeVolumeProfileInstanceLabel(instance.fromTime, instance.toTime)}
                </span>
                <button
                  type="button"
                  aria-label="Delete range"
                  className="inline-flex shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onFixedRangeVolumeProfileDelete?.(instance.id)
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
