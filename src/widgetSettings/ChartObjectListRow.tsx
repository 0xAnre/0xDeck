import type { LucideIcon } from 'lucide-react'
import { EyeIcon, EyeOffIcon, LockIcon, LockOpenIcon, SettingsIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        'flex min-w-0 items-center gap-1 py-0.5 pl-1 pr-0.5',
        hidden && 'opacity-60',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
      {onToggleHidden && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={hidden ? 'Show object' : 'Hide object'}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleHidden()
          }}
        >
          {hidden ? <EyeOffIcon data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}
        </Button>
      )}
      {onToggleLocked && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={locked ? 'Unlock object' : 'Lock object'}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleLocked()
          }}
        >
          {locked ? <LockIcon data-icon="inline-start" /> : <LockOpenIcon data-icon="inline-start" />}
        </Button>
      )}
      {onSettings && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${label} settings`}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSettings()
          }}
        >
          <SettingsIcon data-icon="inline-start" />
        </Button>
      )}
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="hover:text-destructive"
          aria-label={`Delete ${label}`}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete()
          }}
        >
          <Trash2Icon data-icon="inline-start" />
        </Button>
      )}
    </div>
  )
}
