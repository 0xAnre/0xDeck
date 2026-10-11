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
  DEFAULT_LINE_CHART_STROKE_STYLE,
  DEFAULT_LINE_CHART_STROKE_WIDTH,
} from '@/market/lineChartStroke'
import {
  marketIndicatorColorInputValue,
  marketIndicatorUsesDistinctSeriesColors,
} from '@/market/marketIndicatorSeriesColors'
import type { MarketIndicatorPresentation } from '@/marketIndicatorPresentationStorage'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'

type MarketIndicatorStyleDialogProps = {
  indicatorId: MarketIndicatorId | null
  presentation: MarketIndicatorPresentation
  seriesColors: readonly string[]
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onPresentationChange: (indicatorId: MarketIndicatorId, presentation: MarketIndicatorPresentation) => void
}

export function MarketIndicatorStyleDialog({
  indicatorId,
  presentation,
  seriesColors,
  returnFocusId,
  onOpenChange,
  onPresentationChange,
}: MarketIndicatorStyleDialogProps) {
  const label = indicatorId ? MARKET_INDICATOR_DEFINITIONS[indicatorId].label : 'Indicator'
  const colorInputValue = marketIndicatorColorInputValue(presentation.color, seriesColors)
  const usesDistinctSeriesColors =
    presentation.color === undefined && marketIndicatorUsesDistinctSeriesColors(seriesColors)

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
              {usesDistinctSeriesColors ? (
                <div className="flex flex-wrap items-center gap-2">
                  {seriesColors.map((color, index) => (
                    <span
                      key={`${color}-${index}`}
                      className="size-6 rounded border border-border"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Theme colors per line. Pick a color to apply it to all lines.
                  </p>
                </div>
              ) : null}
              <Input
                id="indicator-color"
                type="color"
                value={colorInputValue}
                onChange={(event) =>
                  onPresentationChange(indicatorId, {
                    ...presentation,
                    color: event.target.value,
                  })
                }
              />
            </Field>
            <LineChartStrokeSelectFields
              widthId="indicator-width"
              styleId="indicator-style"
              lineWidth={presentation.lineWidth ?? DEFAULT_LINE_CHART_STROKE_WIDTH}
              lineStyle={presentation.lineStyle ?? DEFAULT_LINE_CHART_STROKE_STYLE}
              onLineWidthChange={(lineWidth) =>
                onPresentationChange(indicatorId, { ...presentation, lineWidth })
              }
              onLineStyleChange={(lineStyle) =>
                onPresentationChange(indicatorId, { ...presentation, lineStyle })
              }
            />
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
