import type { LucideIcon } from 'lucide-react'
import { EyeIcon, EyeOffIcon, LockIcon, LockOpenIcon, SettingsIcon, Trash2Icon } from 'lucide-react'
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
        <button
          type="button"
          aria-label={hidden ? 'Show object' : 'Hide object'}
          disabled={disabled}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleHidden()
          }}
        >
          {hidden ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
        </button>
      )}
      {onToggleLocked && (
        <button
          type="button"
          aria-label={locked ? 'Unlock object' : 'Lock object'}
          disabled={disabled}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleLocked()
          }}
        >
          {locked ? <LockIcon className="size-3.5" /> : <LockOpenIcon className="size-3.5" />}
        </button>
      )}
      {onSettings && (
        <button
          type="button"
          aria-label={`${label} settings`}
          disabled={disabled}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSettings()
          }}
        >
          <SettingsIcon className="size-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${label}`}
          disabled={disabled}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete()
          }}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
    </div>
  )
}
