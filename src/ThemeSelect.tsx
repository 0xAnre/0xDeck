import { PaletteIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { THEME_LABELS, THEMES, type Theme } from './themeStorage'

type ThemeSelectProps = {
  value: Theme
  onChange: (theme: Theme) => void
}

export function ThemeSelect({ value, onChange }: ThemeSelectProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Tema seç">
              <PaletteIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Choose theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as Theme)}
        >
          {THEMES.map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              {THEME_LABELS[id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
