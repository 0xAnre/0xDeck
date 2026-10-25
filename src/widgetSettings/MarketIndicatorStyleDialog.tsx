import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { MARKET_INDICATOR_DEFINITIONS, type MarketIndicatorId } from '@/market/indicators'
import {
  LINE_CHART_STROKE_STYLE_LABELS,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from '@/market/lineChartStroke'
import {
  marketIndicatorColorInputValue,
  marketIndicatorLineStyleSelectValue,
  marketIndicatorLineWidthInputValue,
  marketIndicatorOpacityInputValue,
  marketIndicatorUsesDistinctSeriesColors,
  marketIndicatorUsesDistinctSeriesLineStyles,
  marketIndicatorUsesDistinctSeriesLineWidths,
} from '@/market/marketIndicatorSeriesColors'
import type { MarketIndicatorPresentation } from '@/marketIndicatorPresentationStorage'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'

type MarketIndicatorStyleDialogProps = {
  indicatorId: MarketIndicatorId | null
  presentation: MarketIndicatorPresentation
  seriesColors: readonly string[]
  seriesLineWidths: readonly LineChartStrokeWidth[]
  seriesLineStyles: readonly LineChartStrokeStyle[]
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onPresentationChange: (indicatorId: MarketIndicatorId, presentation: MarketIndicatorPresentation) => void
}

export function MarketIndicatorStyleDialog({
  indicatorId,
  presentation,
  seriesColors,
  seriesLineWidths,
  seriesLineStyles,
  returnFocusId,
  onOpenChange,
  onPresentationChange,
}: MarketIndicatorStyleDialogProps) {
  const label = indicatorId ? MARKET_INDICATOR_DEFINITIONS[indicatorId].label : 'Indicator'
  const colorInputValue = marketIndicatorColorInputValue(presentation.color, seriesColors)
  const opacityInputValue = marketIndicatorOpacityInputValue(presentation.opacity)
  const usesDistinctSeriesColors =
    presentation.color === undefined && marketIndicatorUsesDistinctSeriesColors(seriesColors)
  const lineWidthInputValue = marketIndicatorLineWidthInputValue(
    presentation.lineWidth,
    seriesLineWidths,
  )
  const lineStyleSelectValue = marketIndicatorLineStyleSelectValue(
    presentation.lineStyle,
    seriesLineStyles,
  )
  const usesDistinctSeriesLineWidths =
    presentation.lineWidth === undefined &&
    marketIndicatorUsesDistinctSeriesLineWidths(seriesLineWidths)
  const usesDistinctSeriesLineStyles =
    presentation.lineStyle === undefined &&
    marketIndicatorUsesDistinctSeriesLineStyles(seriesLineStyles)

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
            {usesDistinctSeriesColors ? (
              <Field>
                <FieldLabel>Chart lines</FieldLabel>
                <div
                  id="indicator-series-colors"
                  className="flex flex-wrap items-center gap-2"
                >
                  {seriesColors.map((color, index) => (
                    <span
                      key={`${color}-${index}`}
                      className="size-6 rounded border border-border"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Palette shades per line. Pick a color to apply it to all lines.
                  </p>
                </div>
              </Field>
            ) : null}
            <ColorOpacityField
              id="indicator-color"
              label="Color"
              color={colorInputValue}
              opacityPercent={opacityInputValue}
              onColorChange={(color) =>
                onPresentationChange(indicatorId, {
                  ...presentation,
                  color,
                })
              }
              onOpacityChange={(opacity) =>
                onPresentationChange(indicatorId, {
                  ...presentation,
                  opacity,
                })
              }
            />
            {usesDistinctSeriesLineWidths ? (
              <p className="text-xs text-muted-foreground">
                Mixed line widths on chart. Pick a width to apply to all lines.
              </p>
            ) : null}
            {usesDistinctSeriesLineStyles ? (
              <div className="flex flex-wrap items-center gap-2">
                {seriesLineStyles.map((style, index) => (
                  <span
                    key={`${style}-${index}`}
                    className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {LINE_CHART_STROKE_STYLE_LABELS[style]}
                  </span>
                ))}
                <p className="text-xs text-muted-foreground">
                  Mixed line styles on chart. Pick a style to apply it to all lines.
                </p>
              </div>
            ) : null}
            <LineChartStrokeSelectFields
              widthId="indicator-width"
              styleId="indicator-style"
              lineWidth={lineWidthInputValue}
              lineStyle={lineStyleSelectValue}
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
