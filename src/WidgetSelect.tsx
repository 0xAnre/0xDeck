import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WIDGET_REGISTRY } from '@/widgets/registry'

type WidgetSelectProps = {
  panelCount: number
  onAdd: (templateId: string) => void
}

export function WidgetSelect({ panelCount, onAdd }: WidgetSelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Widget ekle">
          Widgets ({panelCount})
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {WIDGET_REGISTRY.map((widget) => (
          <DropdownMenuItem key={widget.id} onSelect={() => onAdd(widget.id)}>
            <PlusIcon data-icon="inline-start" />
            {widget.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
