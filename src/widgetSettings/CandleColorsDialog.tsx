import { useState } from 'react'
import { RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import {
  DEFAULT_CANDLE_COLORS,
  sanitizeCandleColors,
  type CandleColors,
} from '@/market/candleColors'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'

type CandleColorsDialogProps = {
  open: boolean
  savedColors: CandleColors
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onSave: (colors: CandleColors) => void
}

/**
 * Draft-based global candle-color settings.
 *
 * Only `Save` writes the global preference; `Cancel`, `X`, `Esc` and outside
 * click discard the draft. `Reset` moves the draft back to the built-in
 * #DBDBDB / #808080 pair without writing storage, so a reset still needs Save.
 * Each field is the shared `ColorOpacityField` picker in its narrow color-only
 * mode: candle colors have one color per direction and no opacity setting.
 */
function CandleColorsDialogBody({
  savedColors,
  onCancel,
  onSubmit,
}: {
  savedColors: CandleColors
  onCancel: () => void
  onSubmit: (colors: CandleColors) => void
}) {
  const [draft, setDraft] = useState<CandleColors>(() => sanitizeCandleColors(savedColors))

  return (
    <>
      <div className={CHART_SETTINGS_DIALOG_BODY_CLASS}>
        <FieldGroup>
          <ColorOpacityField
            id="candle-color-rising"
            label="Rising"
            color={draft.rising}
            showOpacity={false}
            onColorChange={(rising) =>
              setDraft((current) => ({ ...current, rising }))
            }
          />
          <ColorOpacityField
            id="candle-color-falling"
            label="Falling"
            color={draft.falling}
            showOpacity={false}
            onColorChange={(falling) =>
              setDraft((current) => ({ ...current, falling }))
            }
          />
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
          One color per direction covers the candle body, wick and matching border;
          border visibility is unchanged. Applies to every BTC Perp panel in every
          workspace and on both candle exchanges. Themes do not change these colors.
        </p>
      </div>
      <DialogFooter className="shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:mr-auto"
          onClick={() => setDraft({ ...DEFAULT_CANDLE_COLORS })}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Reset
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSubmit(draft)}>
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function CandleColorsDialog({
  open,
  savedColors,
  returnFocusId,
  onOpenChange,
  onSave,
}: CandleColorsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={CHART_SETTINGS_DIALOG_CONTENT_CLASS}
        overlayClassName={CHART_SETTINGS_DIALOG_OVERLAY_CLASS}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Candle colors</DialogTitle>
          <DialogDescription>
            Rising and falling candle colors, shared by every BTC Perp panel and
            workspace.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CandleColorsDialogBody
            savedColors={savedColors}
            onCancel={() => onOpenChange(false)}
            onSubmit={(colors) => {
              onSave(sanitizeCandleColors(colors))
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
