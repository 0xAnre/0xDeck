import { useState } from 'react'
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
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from '@/market/lineChartStroke'
import {
  RSI_LEVEL_MAX,
  RSI_LEVEL_MIN,
  RSI_PERIOD_MAX,
  RSI_PERIOD_MIN,
  sanitizeRsiSettings,
  type RsiSettings,
} from '@/market/rsi'
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
  rsiSettings?: RsiSettings
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onPresentationChange: (indicatorId: MarketIndicatorId, presentation: MarketIndicatorPresentation) => void
  onRsiSettingsChange?: (settings: RsiSettings) => void
}

const RSI_INPUT_CLASSNAME =
  'h-8 w-full rounded-md border border-input bg-input/20 px-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30'

/**
 * RSI range fields keep a local draft so partially typed numbers are not clamped
 * per keystroke; the sanitized value commits on blur/Enter.
 */
function RsiRangeFields({
  settings,
  onChange,
}: {
  settings: RsiSettings
  onChange: (settings: RsiSettings) => void
}) {
  const [draft, setDraft] = useState<RsiSettings>(() => sanitizeRsiSettings(settings))

  const commit = () => {
    const sanitized = sanitizeRsiSettings(draft)
    setDraft(sanitized)
    onChange(sanitized)
  }

  const numberField = (
    id: string,
    label: string,
    key: 'period' | 'overbought' | 'oversold',
    min: number,
    max: number,
  ) => (
    <Field key={id}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        className={RSI_INPUT_CLASSNAME}
        value={draft[key]}
        onChange={(event) =>
          setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))
        }
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
    </Field>
  )

  return (
    <FieldGroup>
      {numberField('rsi-period', 'Period', 'period', RSI_PERIOD_MIN, RSI_PERIOD_MAX)}
      {numberField('rsi-overbought', 'Overbought level', 'overbought', RSI_LEVEL_MIN, RSI_LEVEL_MAX)}
      {numberField('rsi-oversold', 'Oversold level', 'oversold', RSI_LEVEL_MIN, RSI_LEVEL_MAX)}
    </FieldGroup>
  )
}

export function MarketIndicatorStyleDialog({
  indicatorId,
  presentation,
  seriesColors,
  seriesLineWidths,
  seriesLineStyles,
  rsiSettings,
  returnFocusId,
  onOpenChange,
  onPresentationChange,
  onRsiSettingsChange,
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
          <>
            {indicatorId === 'rsi' && rsiSettings && onRsiSettingsChange ? (
              <section className="space-y-2">
                <p className="text-xs font-medium text-foreground">RSI range</p>
                <RsiRangeFields
                  settings={rsiSettings}
                  onChange={onRsiSettingsChange}
                />
              </section>
            ) : null}
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
                lineStyle={lineStyleSelectValue}
                lineStyleMixed={usesDistinctSeriesLineStyles}
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
                onLineStyleChange={(lineStyle) =>
                  onPresentationChange(indicatorId, { ...presentation, lineStyle })
                }
              />
              {usesDistinctSeriesLineWidths ? (
                <p className="text-xs text-muted-foreground">
                  Mixed line widths on chart. Pick a width to apply to all lines.
                </p>
              ) : null}
              <LineChartStrokeSelectFields
                widthId="indicator-width"
                lineWidth={lineWidthInputValue}
                onLineWidthChange={(lineWidth) =>
                  onPresentationChange(indicatorId, { ...presentation, lineWidth })
                }
              />
            </FieldGroup>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
