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
import type { MarketIndicatorPresentation } from '@/marketIndicatorPresentationStorage'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'

type MarketIndicatorStyleDialogProps = {
  indicatorId: MarketIndicatorId | null
  presentation: MarketIndicatorPresentation
  seriesColor?: string
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onPresentationChange: (indicatorId: MarketIndicatorId, presentation: MarketIndicatorPresentation) => void
}

export function MarketIndicatorStyleDialog({
  indicatorId,
  presentation,
  seriesColor,
  returnFocusId,
  onOpenChange,
  onPresentationChange,
}: MarketIndicatorStyleDialogProps) {
  const label = indicatorId ? MARKET_INDICATOR_DEFINITIONS[indicatorId].label : 'Indicator'
  const colorControlValue = presentation.color ?? seriesColor ?? '#9e9e9e'

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
                value={colorControlValue}
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
