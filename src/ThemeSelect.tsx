import { ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { THEME_LABELS, THEMES, type Theme } from './themeStorage'

type ThemeSelectProps = {
  value: Theme
  onChange: (theme: Theme) => void
}

export function ThemeSelect({ value, onChange }: ThemeSelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Tema seç">
          Theme
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
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
