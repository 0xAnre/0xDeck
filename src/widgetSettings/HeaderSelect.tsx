import { ChevronDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export const HEADER_CONTROL_TRIGGER_CLASS =
  'h-6 w-[5.25rem] shrink-0 rounded-md border border-input bg-input/20 px-1.5 text-xs dark:bg-input/30'

export const HEADER_CONTROL_TRIGGER_NARROW_CLASS =
  'h-6 w-[3.25rem] shrink-0 rounded-md border border-input bg-input/20 px-1.5 text-xs dark:bg-input/30'

type HeaderSelectProps = {
  id: string
  'aria-label': string
  value?: string
  placeholder: string
  disabled?: boolean
  className?: string
  options: { value: string; label: string }[]
  onValueChange?: (value: string) => void
}

function selectedLabel(
  value: string | undefined,
  placeholder: string,
  options: { value: string; label: string }[],
) {
  if (!value) return placeholder
  return options.find((option) => option.value === value)?.label ?? value
}

export function HeaderSelect({
  id,
  'aria-label': ariaLabel,
  value,
  placeholder,
  disabled = false,
  className,
  options,
  onValueChange,
}: HeaderSelectProps) {
  const isDisabled = disabled || options.length === 0
  const label = selectedLabel(value, placeholder, options)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        disabled={isDisabled}
        aria-label={ariaLabel}
        className={cn(
          HEADER_CONTROL_TRIGGER_CLASS,
          'flex items-center justify-between gap-1 whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="z-[200] max-h-48 min-w-[10rem] overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onValueChange?.(next)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="truncate">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
