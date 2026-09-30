import { useState } from 'react'
import { ChevronDownIcon, PlusIcon, SettingsIcon, Trash2Icon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { isIndicatorSupportedOnInterval, type MarketIndicatorId } from '@/market/indicators'
import { rollingVwapInstanceMenuLabel } from '@/market/rollingVwapChartInstances'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { CandleInterval } from '@/market/types'
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
        className="z-[200] max-h-64 min-w-[14rem] overflow-y-auto"
      >
        {singletonOptions.map((option) => (
          <div key={option.value} className="flex items-center gap-0.5 pr-1">
            <DropdownMenuCheckboxItem
              className="min-w-0 flex-1"
              checked={activeSet.has(option.value)}
              disabled={option.disabled === true}
              onCheckedChange={(checked) =>
                toggleIndicator(option.value, checked === true, option.disabled === true)
              }
              onSelect={(event) => event.preventDefault()}
            >
              <span className="truncate">{option.label}</span>
            </DropdownMenuCheckboxItem>
          </div>
        ))}

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
            <div
              key={instance.id}
              className="flex items-center gap-0.5 py-0.5 pl-2 pr-1"
            >
              <DropdownMenuCheckboxItem
                className="min-w-0 flex-1 py-1"
                checked={instance.enabled}
                disabled={disabled || !rollingSupported}
                onCheckedChange={(checked) => {
                  onRollingVwapToggle?.(instance.id, checked === true)
                }}
                onSelect={(event) => event.preventDefault()}
              >
                <span className="truncate text-xs">
                  {rollingVwapInstanceMenuLabel(instance, marketInterval)}
                </span>
              </DropdownMenuCheckboxItem>
              {onRollingVwapSettingsClick && (
                <button
                  type="button"
                  aria-label={`${rollingVwapInstanceMenuLabel(instance, marketInterval)} settings`}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    runIndicatorSettingsGearClick({
                      indicatorId: 'rolling-vwap',
                      closeDropdown: () => setMenuOpen(false),
                      onIndicatorSettingsClick: () => onRollingVwapSettingsClick(instance.id),
                    })
                  }}
                >
                  <SettingsIcon className="size-3.5" />
                </button>
              )}
              {onRollingVwapDelete && (
                <button
                  type="button"
                  aria-label={`Delete ${rollingVwapInstanceMenuLabel(instance, marketInterval)}`}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-destructive"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onRollingVwapDelete(instance.id)
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
