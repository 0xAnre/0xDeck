import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { clampMarketStyleOpacityPercent } from '@/market/marketStylePalette'
import { cn } from '@/lib/utils'

type ColorOpacityFieldProps = {
  /** Base id for the color input; the slider gets `${id}-opacity` by default. */
  id: string
  /** Explicit slider id when a dialog needs a stable legacy id. */
  opacityId?: string
  label: string
  color: string
  opacityPercent: number
  onColorChange: (color: string) => void
  onOpacityChange: (opacityPercent: number) => void
  className?: string
}

/**
 * Shared `Color + Opacity` field used by every BTC Perp style dialog.
 *
 * One `<input type="color">` plus an independent 0–100 opacity slider, matching
 * the original FRVP level pattern so all dialogs look and behave the same.
 */
export function ColorOpacityField({
  id,
  opacityId,
  label,
  color,
  opacityPercent,
  onColorChange,
  onOpacityChange,
  className,
}: ColorOpacityFieldProps) {
  const percent = Math.round(clampMarketStyleOpacityPercent(opacityPercent))
  const sliderId = opacityId ?? `${id}-opacity`

  return (
    <Field className={cn('gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          type="color"
          aria-label={`${label} color`}
          className="h-8 w-12 shrink-0 cursor-pointer p-1"
          value={color}
          onChange={(event) => onColorChange(event.target.value)}
        />
        <Slider
          id={sliderId}
          aria-label={`${label} opacity`}
          min={0}
          max={100}
          step={1}
          value={[percent]}
          onValueChange={(value) => {
            const next = value[0]
            if (next === undefined || !Number.isFinite(next)) return
            onOpacityChange(Math.round(next))
          }}
          className="flex-1"
        />
      </div>
    </Field>
  )
}
