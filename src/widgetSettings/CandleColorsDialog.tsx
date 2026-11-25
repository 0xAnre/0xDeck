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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'
import {
  createDefaultCandleColors,
  sanitizeCandleColors,
  type CandleColors,
  type CandlePartColors,
  type CandlePartId,
} from '@/market/candleColors'
import { normalizeColorPickerOpacityPercent } from '@/widgetSettings/colorPickerPalette'
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

/** One appearance row per native candle part, in the reference order. */
const CANDLE_PART_ROWS: ReadonlyArray<{ id: CandlePartId; label: string }> = [
  { id: 'body', label: 'Body' },
  { id: 'border', label: 'Borders' },
  { id: 'wick', label: 'Wick' },
]

function withPart(
  draft: CandleColors,
  partId: CandlePartId,
  patch: Partial<CandlePartColors>,
): CandleColors {
  return {
    ...draft,
    [partId]: { ...draft[partId], ...patch },
  } as CandleColors
}

/**
 * One part: visibility checkbox, one rising/falling swatch pair and one opacity
 * for both directions. Hidden parts keep their colors and opacity in the draft,
 * so re-checking the box restores exactly what the user chose.
 */
function CandlePartRow({
  partId,
  label,
  part,
  onChange,
}: {
  partId: CandlePartId
  label: string
  part: CandlePartColors
  onChange: (patch: Partial<CandlePartColors>) => void
}) {
  const visibleId = `candle-part-${partId}-visible`
  const opacityId = `candle-part-${partId}-opacity`
  const opacityLabelId = `${opacityId}-label`

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 p-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Field orientation="horizontal" className="w-auto">
          <input
            id={visibleId}
            type="checkbox"
            checked={part.visible}
            className="size-3.5 shrink-0 accent-primary"
            onChange={(event) => onChange({ visible: event.target.checked })}
          />
          <FieldLabel htmlFor={visibleId}>{label}</FieldLabel>
        </Field>
        <div className="flex min-w-0 items-center gap-2">
          <FieldLabel
            id={opacityLabelId}
            className="text-xs font-normal text-muted-foreground"
          >
            <span aria-hidden="true">Opacity</span>
            <span className="sr-only">{`${label} opacity`}</span>
          </FieldLabel>
          <Slider
            id={opacityId}
            aria-labelledby={opacityLabelId}
            aria-label={`${label} opacity`}
            min={0}
            max={100}
            step={1}
            value={[part.opacity]}
            onValueChange={(value) => {
              const next = value[0]
              if (next === undefined || !Number.isFinite(next)) return
              onChange({ opacity: normalizeColorPickerOpacityPercent(next) })
            }}
            className="w-24"
          />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {part.opacity}%
          </span>
        </div>
      </div>
      <FieldGroup
        role="group"
        aria-label={`${label} colors`}
        className="grid grid-cols-2 gap-2"
      >
        <ColorOpacityField
          id={`candle-part-${partId}-rising`}
          label="Rising"
          color={part.rising}
          showOpacity={false}
          onColorChange={(rising) => onChange({ rising })}
        />
        <ColorOpacityField
          id={`candle-part-${partId}-falling`}
          label="Falling"
          color={part.falling}
          showOpacity={false}
          onColorChange={(falling) => onChange({ falling })}
        />
      </FieldGroup>
    </div>
  )
}

/**
 * Draft-based global candle appearance settings.
 *
 * Only `Save` writes the global preference; `Cancel`, `X`, `Esc` and outside
 * click discard the draft. `Reset` moves the draft back to the built-in
 * #DBDBDB / #808080 record (Body and Wick on, Borders off, every opacity 100)
 * without writing storage, so a reset still needs Save. Color swatches reuse
 * the shared `ColorOpacityField` palette in its color-only mode; the single
 * `Slider` per part is that part's shared opacity.
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
        <FieldGroup className="gap-2">
          {CANDLE_PART_ROWS.map(({ id, label }) => (
            <CandlePartRow
              key={id}
              partId={id}
              label={label}
              part={draft[id]}
              onChange={(patch) =>
                setDraft((current) => withPart(current, id, patch))
              }
            />
          ))}
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
          Borders use the native 1px candle border. Unchecked parts stay hidden and keep
          their chosen colors and opacity. Applies to every BTC Perp panel in every
          workspace and on both candle exchanges; themes do not change these colors.
        </p>
      </div>
      <DialogFooter className="shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:mr-auto"
          onClick={() => setDraft(createDefaultCandleColors())}
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
            Body, border and wick colors, opacity and visibility, shared by every BTC
            Perp panel and workspace.
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
