import { useState } from 'react'
import { ChevronDownIcon, LockIcon, LockOpenIcon, Trash2Icon } from 'lucide-react'
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
import { formatLineInstanceLabel } from '@/market/lineInstances'
import type { LineInstance } from '@/market/lineInstances'
import {
  formatRectangleInstanceLabel,
  isRectangleInstanceLocked,
  rectangleInstanceFillColorHex,
  rectangleInstanceFillOpacityPercent,
} from '@/market/rectangleInstances'
import type { RectangleInstance } from '@/market/rectangleInstances'
import { HEADER_CONTROL_TRIGGER_CLASS } from '@/widgetSettings/HeaderSelect'

type HeaderToolsMenuProps = {
  id: string
  disabled?: boolean
  fixedRangeVolumeProfileInstances: FixedRangeVolumeProfileInstance[]
  onFixedRangeVolumeProfileArm?: () => void
  onFixedRangeVolumeProfileDelete?: (instanceId: string) => void
  rectangleInstances: RectangleInstance[]
  onRectangleArm?: () => void
  onRectangleDelete?: (instanceId: string) => void
  onRectangleLockToggle?: (instanceId: string, locked: boolean) => void
  onRectangleFillColorChange?: (instanceId: string, fillColor: string) => void
  onRectangleFillOpacityChange?: (instanceId: string, fillOpacity: number) => void
  lineInstances: LineInstance[]
  onLineArm?: () => void
  onLineDelete?: (instanceId: string) => void
}

export function HeaderToolsMenu({
  id,
  disabled = false,
  fixedRangeVolumeProfileInstances,
  onFixedRangeVolumeProfileArm,
  onFixedRangeVolumeProfileDelete,
  rectangleInstances,
  onRectangleArm,
  onRectangleDelete,
  onRectangleLockToggle,
  onRectangleFillColorChange,
  onRectangleFillOpacityChange,
  lineInstances,
  onLineArm,
  onLineDelete,
}: HeaderToolsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const armFixedRangeVolumeProfile = () => {
    onFixedRangeVolumeProfileArm?.()
    setMenuOpen(false)
  }

  const armRectangle = () => {
    onRectangleArm?.()
    setMenuOpen(false)
  }

  const armLine = () => {
    onLineArm?.()
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
        <DropdownMenuItem disabled={disabled} onSelect={armFixedRangeVolumeProfile}>
          Fixed Range Volume Profile
        </DropdownMenuItem>
        <DropdownMenuItem disabled={disabled} onSelect={armRectangle}>
          Rectangle / Box
        </DropdownMenuItem>
        <DropdownMenuItem disabled={disabled} onSelect={armLine}>
          Line
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
        {lineInstances.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {lineInstances.map((instance) => (
              <DropdownMenuItem
                key={instance.id}
                className="flex items-center justify-between gap-2"
                onSelect={(event) => event.preventDefault()}
              >
                <span className="min-w-0 truncate text-xs">{formatLineInstanceLabel(instance)}</span>
                <button
                  type="button"
                  aria-label="Delete line"
                  className="inline-flex shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onLineDelete?.(instance.id)
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {rectangleInstances.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {rectangleInstances.map((instance) => {
              const locked = isRectangleInstanceLocked(instance)
              return (
                <DropdownMenuItem
                  key={instance.id}
                  className="flex flex-col items-stretch gap-1.5 py-2"
                  onSelect={(event) => event.preventDefault()}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs">
                      {formatRectangleInstanceLabel(instance)}
                      {locked ? ' (locked)' : ''}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={locked ? 'Unlock rectangle' : 'Lock rectangle'}
                        className="inline-flex rounded-sm p-1 text-muted-foreground hover:text-foreground"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRectangleLockToggle?.(instance.id, !locked)
                        }}
                      >
                        {locked ? (
                          <LockIcon className="size-3.5" />
                        ) : (
                          <LockOpenIcon className="size-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label="Delete rectangle"
                        className="inline-flex rounded-sm p-1 text-muted-foreground hover:text-foreground"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRectangleDelete?.(instance.id)
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Rectangle fill color"
                      className="h-6 w-8 shrink-0 cursor-pointer rounded-sm border border-input bg-transparent p-0"
                      value={rectangleInstanceFillColorHex(instance)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        event.stopPropagation()
                        onRectangleFillColorChange?.(instance.id, event.target.value)
                      }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      aria-label="Rectangle fill opacity"
                      className="h-4 min-w-0 flex-1 accent-foreground"
                      value={rectangleInstanceFillOpacityPercent(instance)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        event.stopPropagation()
                        onRectangleFillOpacityChange?.(
                          instance.id,
                          Number(event.target.value),
                        )
                      }}
                    />
                    <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {rectangleInstanceFillOpacityPercent(instance)}%
                    </span>
                  </div>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
