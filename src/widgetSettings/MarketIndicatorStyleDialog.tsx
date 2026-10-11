import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MARKET_INDICATOR_DEFINITIONS, type MarketIndicatorId } from '@/market/indicators'
import {
  LINE_CHART_STROKE_STYLES,
  LINE_CHART_STROKE_WIDTHS,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from '@/market/lineChartStroke'
import type { MarketIndicatorPresentation } from '@/marketIndicatorPresentationStorage'

type MarketIndicatorStyleDialogProps = {
  indicatorId: MarketIndicatorId | null
  presentation: MarketIndicatorPresentation
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onPresentationChange: (indicatorId: MarketIndicatorId, presentation: MarketIndicatorPresentation) => void
}

export function MarketIndicatorStyleDialog({
  indicatorId,
  presentation,
  returnFocusId,
  onOpenChange,
  onPresentationChange,
}: MarketIndicatorStyleDialogProps) {
  const label = indicatorId ? MARKET_INDICATOR_DEFINITIONS[indicatorId].label : 'Indicator'

  return (
    <Dialog
      open={indicatorId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false)
      }}
    >
      <DialogContent
        className="sm:max-w-sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Indicator style</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        {indicatorId ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="indicator-color">Color</FieldLabel>
              <Input
                id="indicator-color"
                type="color"
                value={presentation.color ?? '#9e9e9e'}
                onChange={(event) =>
                  onPresentationChange(indicatorId, {
                    ...presentation,
                    color: event.target.value,
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="indicator-width">Width</FieldLabel>
              <select
                id="indicator-width"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={presentation.lineWidth ?? 1}
                onChange={(event) =>
                  onPresentationChange(indicatorId, {
                    ...presentation,
                    lineWidth: Number(event.target.value) as LineChartStrokeWidth,
                  })
                }
              >
                {LINE_CHART_STROKE_WIDTHS.map((width) => (
                  <option key={width} value={width}>{width}px</option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="indicator-style">Style</FieldLabel>
              <select
                id="indicator-style"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={presentation.lineStyle ?? 'solid'}
                onChange={(event) =>
                  onPresentationChange(indicatorId, {
                    ...presentation,
                    lineStyle: event.target.value as LineChartStrokeStyle,
                  })
                }
              >
                {LINE_CHART_STROKE_STYLES.map((style) => (
                  <option key={style} value={style}>{style}</option>
                ))}
              </select>
            </Field>
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
