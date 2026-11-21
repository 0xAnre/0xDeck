import { useState } from 'react'
import { PaintbrushIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { setCandleColors } from '@/market/candleColors'
import { useCandleColors } from '@/market/useCandleColors'
import { CandleColorsDialog } from '@/widgetSettings/CandleColorsDialog'

/** Stable focus-return target for the settings dialog. */
const APPEARANCE_TRIGGER_ID = 'header-appearance'

/**
 * General-purpose appearance menu in the app header.
 *
 * The menu is intentionally broader than its current contents: today it opens
 * only the global candle-color settings, and a future appearance setting can be
 * added here without renaming the menu or moving it. It is not a widget menu and
 * not a per-panel chart-settings menu.
 */
export function AppearanceMenu() {
  const candleColors = useCandleColors()
  const [candleColorsOpen, setCandleColorsOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                id={APPEARANCE_TRIGGER_ID}
                variant="outline"
                size="icon-sm"
                aria-label="Appearance"
              >
                <PaintbrushIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Appearance</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setCandleColorsOpen(true)}>
              Candle colors
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <CandleColorsDialog
        open={candleColorsOpen}
        savedColors={candleColors}
        returnFocusId={APPEARANCE_TRIGGER_ID}
        onOpenChange={setCandleColorsOpen}
        onSave={setCandleColors}
      />
    </>
  )
}
