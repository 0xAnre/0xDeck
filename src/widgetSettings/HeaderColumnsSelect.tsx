import { ChevronDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { HEADER_CONTROL_TRIGGER_CLASS } from '@/widgetSettings/HeaderSelect'

type HeaderColumnsSelectProps = {
  id: string
  columns: string[]
  selectedColumns: string[]
  disabled?: boolean
  onColumnsChange?: (columns: string[]) => void
}

function formatColumnsLabel(selectedColumns: string[], total: number) {
  if (selectedColumns.length === 0) return 'Columns'
  if (total > 0 && selectedColumns.length === total) return `All (${total})`
  if (selectedColumns.length === 1) return selectedColumns[0]
  return `${selectedColumns.length} cols`
}

export function HeaderColumnsSelect({
  id,
  columns,
  selectedColumns,
  disabled = false,
  onColumnsChange,
}: HeaderColumnsSelectProps) {
  const selectedSet = new Set(selectedColumns)
  const isDisabled = disabled || columns.length === 0
  const label = formatColumnsLabel(selectedColumns, columns.length)

  const toggleColumn = (column: string, checked: boolean) => {
    if (!onColumnsChange || disabled) return
    if (checked) {
      onColumnsChange([...selectedColumns, column])
      return
    }
    const next = selectedColumns.filter((item) => item !== column)
    if (next.length > 0) onColumnsChange(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        disabled={isDisabled}
        aria-label="Columns"
        className={cn(
          HEADER_CONTROL_TRIGGER_CLASS,
          'flex items-center justify-between gap-1 whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
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
        {columns.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No columns loaded</p>
        ) : (
          columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column}
              checked={selectedSet.has(column)}
              onCheckedChange={(checked) => toggleColumn(column, checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="truncate">{column}</span>
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
