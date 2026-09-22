import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PANEL_CATALOG } from './panels'

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
        {PANEL_CATALOG.map((panel) => (
          <DropdownMenuItem key={panel.id} onSelect={() => onAdd(panel.id)}>
            <PlusIcon data-icon="inline-start" />
            {panel.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
