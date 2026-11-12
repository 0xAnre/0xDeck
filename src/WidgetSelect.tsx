import { BlocksIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WIDGET_REGISTRY } from '@/widgets/registry'

type WidgetSelectProps = {
  panelCount: number
  onAdd: (templateId: string) => void
}

export function WidgetSelect({ panelCount, onAdd }: WidgetSelectProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Widget ekle">
              <BlocksIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Add widget ({panelCount} open)</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuGroup>
          {WIDGET_REGISTRY.map((widget) => (
            <DropdownMenuItem key={widget.id} onSelect={() => onAdd(widget.id)}>
              <PlusIcon data-icon="inline-start" />
              {widget.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
