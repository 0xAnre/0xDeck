import { ChevronDownIcon } from 'lucide-react'
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
}

type HeaderIndicatorsMenuProps = {
  id: string
  disabled?: boolean
  options: IndicatorOption[]
  activeIndicators: MarketIndicatorId[]
  onActiveIndicatorsChange?: (indicators: MarketIndicatorId[]) => void
}

export function HeaderIndicatorsMenu({
  id,
  disabled = false,
  options,
  activeIndicators,
  onActiveIndicatorsChange,
}: HeaderIndicatorsMenuProps) {
  const activeSet = new Set(activeIndicators)
  const isDisabled = disabled || options.length === 0

  const toggleIndicator = (indicatorId: MarketIndicatorId, checked: boolean) => {
    if (!onActiveIndicatorsChange || disabled) return
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
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={activeSet.has(option.value)}
            onCheckedChange={(checked) => toggleIndicator(option.value, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="truncate">{option.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
