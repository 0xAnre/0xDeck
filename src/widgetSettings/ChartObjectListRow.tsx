import type { LucideIcon } from 'lucide-react'
import { EyeIcon, EyeOffIcon, LockIcon, LockOpenIcon, SettingsIcon, Trash2Icon } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type ChartObjectListRowProps = {
  icon: LucideIcon
  label: string
  hidden?: boolean
  locked?: boolean
  disabled?: boolean
  onToggleHidden?: () => void
  onToggleLocked?: () => void
  onSettings?: () => void
  onDelete?: () => void
  className?: string
}

const ROW_ACTION_ITEM_CLASS =
  'size-6 min-h-6 shrink-0 justify-center gap-0 px-0 py-0 focus:bg-accent'

export function ChartObjectListRow({
  icon: Icon,
  label,
  hidden = false,
  locked = false,
  disabled = false,
  onToggleHidden,
  onToggleLocked,
  onSettings,
  onDelete,
  className,
}: ChartObjectListRowProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-0.5 py-0.5 pl-0.5 pr-0',
        hidden && 'opacity-60',
        className,
      )}
    >
      <DropdownMenuLabel className="flex min-w-0 flex-1 items-center gap-1 py-0 pl-1 pr-0 font-normal">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate text-xs text-foreground">{label}</span>
      </DropdownMenuLabel>
      {onToggleHidden && (
        <DropdownMenuItem
          disabled={disabled}
          className={ROW_ACTION_ITEM_CLASS}
          aria-label={hidden ? 'Show object' : 'Hide object'}
          onSelect={(event) => {
            event.preventDefault()
            onToggleHidden()
          }}
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </DropdownMenuItem>
      )}
      {onToggleLocked && (
        <DropdownMenuItem
          disabled={disabled}
          className={ROW_ACTION_ITEM_CLASS}
          aria-label={locked ? 'Unlock object' : 'Lock object'}
          onSelect={(event) => {
            event.preventDefault()
            onToggleLocked()
          }}
        >
          {locked ? <LockIcon /> : <LockOpenIcon />}
        </DropdownMenuItem>
      )}
      {onSettings && (
        <DropdownMenuItem
          disabled={disabled}
          className={ROW_ACTION_ITEM_CLASS}
          aria-label={`${label} settings`}
          onSelect={() => {
            onSettings()
          }}
        >
          <SettingsIcon />
        </DropdownMenuItem>
      )}
      {onDelete && (
        <DropdownMenuItem
          disabled={disabled}
          variant="destructive"
          className={cn(ROW_ACTION_ITEM_CLASS, 'hover:text-destructive')}
          aria-label={`Delete ${label}`}
          onSelect={() => {
            onDelete()
          }}
        >
          <Trash2Icon />
        </DropdownMenuItem>
      )}
    </div>
  )
}
