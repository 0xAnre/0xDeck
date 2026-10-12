import { useRef, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  formatFixedRangeVolumeProfileInstanceLabel,
  isFixedRangeVolumeProfileInstanceHidden,
  type FixedRangeVolumeProfileInstance,
} from '@/market/fixedRangeVolumeProfileInstances'
import {
  formatLineInstanceLabel,
  isLineInstanceHidden,
  isLineInstanceLocked,
  type LineInstance,
} from '@/market/lineInstances'
import {
  formatRectangleInstanceLabel,
  isRectangleInstanceHidden,
  isRectangleInstanceLocked,
  type RectangleInstance,
} from '@/market/rectangleInstances'
import { ChartObjectListRow } from '@/widgetSettings/ChartObjectListRow'
import { numberedChartObjectIcon } from '@/widgetSettings/chartObjectIcons'
import { HEADER_CONTROL_TRIGGER_CLASS } from '@/widgetSettings/HeaderSelect'
import { RectangleFillStyleDialog } from '@/widgetSettings/RectangleFillStyleDialog'
import { LineStyleDialog } from '@/widgetSettings/LineStyleDialog'
import { FixedRangeVolumeProfileSettingsDialog } from '@/widgetSettings/FixedRangeVolumeProfileSettingsDialog'
import type { ChartObjectSettingsTarget } from '@/market/chartObjectSettingsTypes'
import type { FrvpLevelLineKind } from '@/market/frvpInstanceLineStyles'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'

type HeaderToolsMenuProps = {
  id: string
  disabled?: boolean
  fixedRangeVolumeProfileInstances: FixedRangeVolumeProfileInstance[]
  onFixedRangeVolumeProfileArm?: () => void
  onFixedRangeVolumeProfileDelete?: (instanceId: string) => void
  onFixedRangeVolumeProfileToggle?: (instanceId: string, enabled: boolean) => void
  onFixedRangeVolumeProfileLockToggle?: (instanceId: string, locked: boolean) => void
  onFixedRangeVolumeProfileRowCountChange?: (instanceId: string, rowCount: number) => void
  onFixedRangeVolumeProfileValueAreaChange?: (instanceId: string, valueAreaPercent: number) => void
  onFixedRangeVolumeProfileLevelStrokeColorChange?: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    strokeColor: string,
  ) => void
  onFixedRangeVolumeProfileLevelLineWidthChange?: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    lineWidth: LineChartStrokeWidth,
  ) => void
  rectangleInstances: RectangleInstance[]
  onRectangleArm?: () => void
  onRectangleDelete?: (instanceId: string) => void
  onRectangleLockToggle?: (instanceId: string, locked: boolean) => void
  onRectangleVisibilityToggle?: (instanceId: string, hidden: boolean) => void
  onRectangleFillColorChange?: (instanceId: string, fillColor: string) => void
  onRectangleFillOpacityChange?: (instanceId: string, fillOpacity: number) => void
  lineInstances: LineInstance[]
  onLineArm?: () => void
  onLineDelete?: (instanceId: string) => void
  onLineLockToggle?: (instanceId: string, locked: boolean) => void
  onLineVisibilityToggle?: (instanceId: string, hidden: boolean) => void
  onLineStrokeColorChange?: (instanceId: string, strokeColor: string) => void
  onLineWidthChange?: (instanceId: string, lineWidth: LineChartStrokeWidth) => void
  onLineStyleChange?: (instanceId: string, lineStyle: LineChartStrokeStyle) => void
  chartObjectSettingsTarget?: ChartObjectSettingsTarget | null
  onChartObjectSettingsTargetChange?: (target: ChartObjectSettingsTarget | null) => void
}

export function HeaderToolsMenu({
  id,
  disabled = false,
  fixedRangeVolumeProfileInstances,
  onFixedRangeVolumeProfileArm,
  onFixedRangeVolumeProfileDelete,
  onFixedRangeVolumeProfileToggle,
  onFixedRangeVolumeProfileLockToggle,
  onFixedRangeVolumeProfileRowCountChange,
  onFixedRangeVolumeProfileValueAreaChange,
  onFixedRangeVolumeProfileLevelStrokeColorChange,
  onFixedRangeVolumeProfileLevelLineWidthChange,
  rectangleInstances,
  onRectangleArm,
  onRectangleDelete,
  onRectangleLockToggle,
  onRectangleVisibilityToggle,
  onRectangleFillColorChange,
  onRectangleFillOpacityChange,
  lineInstances,
  onLineArm,
  onLineDelete,
  onLineLockToggle,
  onLineVisibilityToggle,
  onLineStrokeColorChange,
  onLineWidthChange,
  onLineStyleChange,
  chartObjectSettingsTarget = null,
  onChartObjectSettingsTargetChange,
}: HeaderToolsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const suppressMenuCloseAutoFocusRef = useRef(false)

  const rectangleStyleInstance =
    chartObjectSettingsTarget?.kind === 'rectangle'
      ? (rectangleInstances.find((item) => item.id === chartObjectSettingsTarget.instanceId) ?? null)
      : null
  const lineStyleInstance =
    chartObjectSettingsTarget?.kind === 'line'
      ? (lineInstances.find((item) => item.id === chartObjectSettingsTarget.instanceId) ?? null)
      : null
  const frvpStyleInstance =
    chartObjectSettingsTarget?.kind === 'fixed-range-volume-profile'
      ? (fixedRangeVolumeProfileInstances.find(
          (item) => item.id === chartObjectSettingsTarget.instanceId,
        ) ?? null)
      : null

  const openSettings = (target: ChartObjectSettingsTarget) => {
    suppressMenuCloseAutoFocusRef.current = true
    setMenuOpen(false)
    onChartObjectSettingsTargetChange?.(target)
  }

  const closeSettings = () => {
    suppressMenuCloseAutoFocusRef.current = false
    onChartObjectSettingsTargetChange?.(null)
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

  const hasObjects =
    fixedRangeVolumeProfileInstances.length > 0 ||
    lineInstances.length > 0 ||
    rectangleInstances.length > 0

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
          className="min-w-[18rem]"
          onCloseAutoFocus={(event) => {
            if (suppressMenuCloseAutoFocusRef.current) {
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
          {hasObjects && <DropdownMenuSeparator />}
          {fixedRangeVolumeProfileInstances.map((instance) => (
            <ChartObjectListRow
              key={instance.id}
              icon={numberedChartObjectIcon('frvp')}
              label={formatFixedRangeVolumeProfileInstanceLabel(instance)}
              hidden={isFixedRangeVolumeProfileInstanceHidden(instance)}
              locked={instance.locked === true}
              disabled={disabled}
              onToggleHidden={
                onFixedRangeVolumeProfileToggle
                  ? () =>
                      onFixedRangeVolumeProfileToggle(instance.id, !instance.enabled)
                  : undefined
              }
              onToggleLocked={
                onFixedRangeVolumeProfileLockToggle
                  ? () => onFixedRangeVolumeProfileLockToggle(instance.id, !instance.locked)
                  : undefined
              }
              onSettings={() =>
                openSettings({ kind: 'fixed-range-volume-profile', instanceId: instance.id })
              }
              onDelete={
                onFixedRangeVolumeProfileDelete
                  ? () => onFixedRangeVolumeProfileDelete(instance.id)
                  : undefined
              }
            />
          ))}
          {lineInstances.map((instance) => (
            <ChartObjectListRow
              key={instance.id}
              icon={numberedChartObjectIcon('line')}
              label={formatLineInstanceLabel(instance)}
              hidden={isLineInstanceHidden(instance)}
              locked={isLineInstanceLocked(instance)}
              disabled={disabled}
              onToggleHidden={
                onLineVisibilityToggle
                  ? () => onLineVisibilityToggle(instance.id, !isLineInstanceHidden(instance))
                  : undefined
              }
              onToggleLocked={
                onLineLockToggle
                  ? () => onLineLockToggle(instance.id, !isLineInstanceLocked(instance))
                  : undefined
              }
              onSettings={() => openSettings({ kind: 'line', instanceId: instance.id })}
              onDelete={onLineDelete ? () => onLineDelete(instance.id) : undefined}
            />
          ))}
          {rectangleInstances.map((instance) => (
            <ChartObjectListRow
              key={instance.id}
              icon={numberedChartObjectIcon('box')}
              label={formatRectangleInstanceLabel(instance)}
              hidden={isRectangleInstanceHidden(instance)}
              locked={isRectangleInstanceLocked(instance)}
              disabled={disabled}
              onToggleHidden={
                onRectangleVisibilityToggle
                  ? () =>
                      onRectangleVisibilityToggle(instance.id, !isRectangleInstanceHidden(instance))
                  : undefined
              }
              onToggleLocked={
                onRectangleLockToggle
                  ? () => onRectangleLockToggle(instance.id, !isRectangleInstanceLocked(instance))
                  : undefined
              }
              onSettings={() => openSettings({ kind: 'rectangle', instanceId: instance.id })}
              onDelete={onRectangleDelete ? () => onRectangleDelete(instance.id) : undefined}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <RectangleFillStyleDialog
        instance={rectangleStyleInstance}
        returnFocusId={id}
        onOpenChange={(open) => {
          if (!open) closeSettings()
        }}
        onFillColorChange={(instanceId, fillColor) => {
          onRectangleFillColorChange?.(instanceId, fillColor)
        }}
        onFillOpacityChange={(instanceId, fillOpacity) => {
          onRectangleFillOpacityChange?.(instanceId, fillOpacity)
        }}
      />
      <LineStyleDialog
        instance={lineStyleInstance}
        returnFocusId={id}
        onOpenChange={(open) => {
          if (!open) closeSettings()
        }}
        onStrokeColorChange={(instanceId, strokeColor) => {
          onLineStrokeColorChange?.(instanceId, strokeColor)
        }}
        onLineWidthChange={(instanceId, lineWidth) => {
          onLineWidthChange?.(instanceId, lineWidth)
        }}
        onLineStyleChange={(instanceId, lineStyle) => {
          onLineStyleChange?.(instanceId, lineStyle)
        }}
      />
      <FixedRangeVolumeProfileSettingsDialog
        instance={frvpStyleInstance}
        returnFocusId={id}
        onOpenChange={(open) => {
          if (!open) closeSettings()
        }}
        onRowCountChange={(instanceId, rowCount) => {
          onFixedRangeVolumeProfileRowCountChange?.(instanceId, rowCount)
        }}
        onValueAreaPercentChange={(instanceId, valueAreaPercent) => {
          onFixedRangeVolumeProfileValueAreaChange?.(instanceId, valueAreaPercent)
        }}
        onLevelStrokeColorChange={(instanceId, kind, strokeColor) => {
          onFixedRangeVolumeProfileLevelStrokeColorChange?.(instanceId, kind, strokeColor)
        }}
        onLevelLineWidthChange={(instanceId, kind, lineWidth) => {
          onFixedRangeVolumeProfileLevelLineWidthChange?.(instanceId, kind, lineWidth)
        }}
      />
    </>
  )
}
