import { useRef, useState } from 'react'
import { ChevronDownIcon, LockIcon, LockOpenIcon, Trash2Icon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
} from '@/market/rectangleInstances'
import type { RectangleInstance } from '@/market/rectangleInstances'
import { HEADER_CONTROL_TRIGGER_CLASS } from '@/widgetSettings/HeaderSelect'
import { RectangleFillStyleDialog } from '@/widgetSettings/RectangleFillStyleDialog'

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
  const [styleInstanceId, setStyleInstanceId] = useState<string | null>(null)
  const styleInstanceIdRef = useRef<string | null>(null)
  const styleInstance =
    rectangleInstances.find((instance) => instance.id === styleInstanceId) ?? null

  const openRectangleFillStyle = (instanceId: string) => {
    styleInstanceIdRef.current = instanceId
    setStyleInstanceId(instanceId)
  }

  const closeRectangleFillStyle = () => {
    styleInstanceIdRef.current = null
    setStyleInstanceId(null)
  }

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
    <>
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
        <DropdownMenuContent
          align="start"
          className="min-w-[16rem]"
          onCloseAutoFocus={(event) => {
            if (styleInstanceIdRef.current !== null) {
              event.preventDefault()
            }
          }}
        >
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
                const label = formatRectangleInstanceLabel(instance)
                return (
                  <DropdownMenuSub key={instance.id}>
                    <DropdownMenuSubTrigger>
                      <span className="min-w-0 truncate">
                        {label}
                        {locked ? ' (locked)' : ''}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-40">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onSelect={() => onRectangleLockToggle?.(instance.id, !locked)}
                        >
                          {locked ? <LockOpenIcon /> : <LockIcon />}
                          {locked ? 'Unlock' : 'Lock'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openRectangleFillStyle(instance.id)}>
                          Fill style
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => onRectangleDelete?.(instance.id)}
                        >
                          <Trash2Icon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <RectangleFillStyleDialog
        instance={styleInstance}
        returnFocusId={id}
        onOpenChange={(open) => {
          if (!open) closeRectangleFillStyle()
        }}
        onFillColorChange={(instanceId, fillColor) => {
          onRectangleFillColorChange?.(instanceId, fillColor)
        }}
        onFillOpacityChange={(instanceId, fillOpacity) => {
          onRectangleFillOpacityChange?.(instanceId, fillOpacity)
        }}
      />
    </>
  )
}
