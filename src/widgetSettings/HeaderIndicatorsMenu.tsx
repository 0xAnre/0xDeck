import { ChevronDownIcon, SettingsIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { MarketIndicatorId } from '@/market/indicators'
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
  indicatorsWithSettings?: readonly MarketIndicatorId[]
  onIndicatorSettingsClick?: (indicatorId: MarketIndicatorId) => void
}

export function HeaderIndicatorsMenu({
  id,
  disabled = false,
  options,
  activeIndicators,
  onActiveIndicatorsChange,
  indicatorsWithSettings = [],
  onIndicatorSettingsClick,
}: HeaderIndicatorsMenuProps) {
  const activeSet = new Set(activeIndicators)
  const settingsSet = new Set(indicatorsWithSettings)
  const isDisabled = disabled || options.length === 0

  const toggleIndicator = (
    indicatorId: MarketIndicatorId,
    checked: boolean,
    optionDisabled: boolean,
  ) => {
    if (!onActiveIndicatorsChange || disabled || optionDisabled) return
    if (checked) {
      if (activeSet.has(indicatorId)) return
      onActiveIndicatorsChange([...activeIndicators, indicatorId])
      return
    }
    onActiveIndicatorsChange(activeIndicators.filter((item) => item !== indicatorId))
  }

  return (
    <DropdownMenu>
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
        className="z-[200] max-h-48 min-w-[10rem] overflow-y-auto"
      >
        {options.map((option) => (
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
            {settingsSet.has(option.value) && onIndicatorSettingsClick && (
              <button
                type="button"
                aria-label={`${option.label} settings`}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onIndicatorSettingsClick(option.value)
                }}
              >
                <SettingsIcon className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
