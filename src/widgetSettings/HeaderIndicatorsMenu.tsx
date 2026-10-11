import { useState } from 'react'
import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { isIndicatorSupportedOnInterval, type MarketIndicatorId } from '@/market/indicators'
import { rollingVwapInstanceDisplayLabel, type RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { CandleInterval } from '@/market/types'
import { ChartObjectListRow } from '@/widgetSettings/ChartObjectListRow'
import { marketIndicatorIcon, numberedChartObjectIcon } from '@/widgetSettings/chartObjectIcons'
import {
  runIndicatorSettingsGearClick,
  toggleMarketIndicatorSelection,
} from '@/widgetSettings/headerIndicatorMenuActions'
import { HEADER_CONTROL_TRIGGER_CLASS } from '@/widgetSettings/HeaderSelect'

type IndicatorOption = {
  value: MarketIndicatorId
  label: string
  disabled?: boolean
}

type HeaderIndicatorsMenuProps = {
  id: string
  disabled?: boolean
  options: IndicatorOption[]
  activeIndicators: MarketIndicatorId[]
  onActiveIndicatorsChange?: (indicators: MarketIndicatorId[]) => void
  marketInterval?: CandleInterval
  rollingVwapInstances?: RollingVwapInstance[]
  onRollingVwapAdd?: () => void
  onRollingVwapToggle?: (instanceId: string, enabled: boolean) => void
  onRollingVwapSettingsClick?: (instanceId: string) => void
  onRollingVwapDelete?: (instanceId: string) => void
  onRollingVwapLockToggle?: (instanceId: string, locked: boolean) => void
  onMarketIndicatorSettingsClick?: (indicatorId: MarketIndicatorId) => void
}

export function HeaderIndicatorsMenu({
  id,
  disabled = false,
  options,
  activeIndicators,
  onActiveIndicatorsChange,
  marketInterval = '1m',
  rollingVwapInstances = [],
  onRollingVwapAdd,
  onRollingVwapToggle,
  onRollingVwapSettingsClick,
  onRollingVwapDelete,
  onRollingVwapLockToggle,
  onMarketIndicatorSettingsClick,
}: HeaderIndicatorsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const activeSet = new Set(activeIndicators)
  const singletonOptions = options.filter((option) => option.value !== 'rolling-vwap')
  const rollingSupported = isIndicatorSupportedOnInterval('rolling-vwap', marketInterval)
  const isDisabled = disabled || (singletonOptions.length === 0 && !onRollingVwapAdd)

  const toggleIndicator = (
    indicatorId: MarketIndicatorId,
    checked: boolean,
    optionDisabled: boolean,
  ) => {
    if (!onActiveIndicatorsChange || disabled || optionDisabled) return
    onActiveIndicatorsChange(
      toggleMarketIndicatorSelection(activeIndicators, indicatorId, checked),
    )
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger
        id={id}
        disabled={isDisabled}
        aria-label="Indicators"
        className={cn(
          HEADER_CONTROL_TRIGGER_CLASS,
          'flex w-[5.5rem] items-center justify-between gap-1 whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="truncate">Indicators</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="z-[200] max-h-64 min-w-[16rem] overflow-y-auto"
      >
        {singletonOptions.map((option) => {
          const Icon = marketIndicatorIcon(option.value)
          const isActive = activeSet.has(option.value)
          return (
            <ChartObjectListRow
              key={option.value}
              icon={Icon}
              label={option.label}
              hidden={!isActive}
              disabled={disabled || option.disabled === true}
              onToggleHidden={() =>
                toggleIndicator(option.value, !isActive, option.disabled === true)
              }
              onSettings={
                onMarketIndicatorSettingsClick
                  ? () =>
                      runIndicatorSettingsGearClick({
                        indicatorId: option.value,
                        closeDropdown: () => setMenuOpen(false),
                        onIndicatorSettingsClick: onMarketIndicatorSettingsClick,
                      })
                  : undefined
              }
            />
          )
        })}

        <div className="mt-1 border-t border-border pt-1">
          <div className="flex items-center justify-between gap-1 px-2 py-1">
            <span className="text-xs font-medium text-foreground">Rolling VWAP</span>
            {onRollingVwapAdd && (
              <button
                type="button"
                aria-label="Add Rolling VWAP"
                disabled={disabled || !rollingSupported}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onRollingVwapAdd()
                }}
              >
                <PlusIcon className="size-3.5" />
              </button>
            )}
          </div>

          {rollingVwapInstances.map((instance) => (
            <ChartObjectListRow
              key={instance.id}
              icon={numberedChartObjectIcon('rolling-vwap')}
              label={rollingVwapInstanceDisplayLabel(instance)}
              hidden={!instance.enabled}
              locked={instance.locked === true}
              disabled={disabled || !rollingSupported}
              onToggleHidden={
                onRollingVwapToggle
                  ? () => onRollingVwapToggle(instance.id, !instance.enabled)
                  : undefined
              }
              onToggleLocked={
                onRollingVwapLockToggle
                  ? () => onRollingVwapLockToggle(instance.id, instance.locked !== true)
                  : undefined
              }
              onSettings={
                onRollingVwapSettingsClick
                  ? () =>
                      runIndicatorSettingsGearClick({
                        indicatorId: 'rolling-vwap',
                        closeDropdown: () => setMenuOpen(false),
                        onIndicatorSettingsClick: () => onRollingVwapSettingsClick(instance.id),
                      })
                  : undefined
              }
              onDelete={onRollingVwapDelete ? () => onRollingVwapDelete(instance.id) : undefined}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
