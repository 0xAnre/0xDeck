import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  MARKET_INDICATOR_DEFINITIONS,
  marketIndicatorSupportsBandFill,
  type MarketIndicatorId,
} from '@/market/indicators'
import {
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from '@/market/lineChartStroke'
import {
  ORDER_BOOK_DEPTH_DISTANCES,
  type OrderBookDepthDistance,
} from '@/market/orderBookDepth'
import {
  ORDER_BOOK_DEPTH_DISTANCE_LABELS,
  DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
  sanitizeOrderBookDepthSettings,
  type OrderBookDepthSettings,
} from '@/market/orderBookDepthSettings'
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
import {
  sessionVwapBandFillColorInputValue,
  sessionVwapBandFillOpacityInputValue,
} from '@/market/sessionVwapBandFillStyle'
import type { MarketIndicatorPresentation } from '@/marketIndicatorPresentationStorage'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'
import {
  marketIndicatorStyleDraftFromInputs,
  marketIndicatorStyleDraftPatch,
  sanitizeMarketIndicatorStyleDraft,
  type MarketIndicatorStyleDraft,
  type MarketIndicatorStyleDraftPatch,
} from '@/widgetSettings/marketIndicatorStyleDraft'

type MarketIndicatorStyleDialogProps = {
  indicatorId: MarketIndicatorId | null
  presentation: MarketIndicatorPresentation
  seriesColors: readonly string[]
  seriesLineWidths: readonly LineChartStrokeWidth[]
  seriesLineStyles: readonly LineChartStrokeStyle[]
  rsiSettings?: RsiSettings
  orderBookDepthSettings?: OrderBookDepthSettings
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onPresentationChange: (indicatorId: MarketIndicatorId, presentation: MarketIndicatorPresentation) => void
  onRsiSettingsChange?: (settings: RsiSettings) => void
  onOrderBookDepthSettingsChange?: (settings: OrderBookDepthSettings) => void
}

const RSI_INPUT_CLASSNAME =
  'h-8 w-full rounded-md border border-input bg-input/20 px-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30'

/**
 * RSI range fields edit the dialog draft, so partially typed numbers are not
 * clamped per keystroke and sanitizing on blur/Enter rewrites the draft only.
 */
function RsiRangeFields({
  settings,
  onChange,
  onSanitize,
}: {
  settings: RsiSettings
  onChange: (next: RsiSettings) => void
  onSanitize: () => void
}) {
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
        value={settings[key]}
        onChange={(event) => onChange({ ...settings, [key]: Number(event.target.value) })}
        onBlur={onSanitize}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSanitize()
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

function OrderBookDepthFields({
  settings,
  onChange,
  onSanitize,
}: {
  settings: OrderBookDepthSettings
  onChange: (next: OrderBookDepthSettings) => void
  onSanitize: () => void
}) {
  const numberField = (
    id: string,
    label: string,
    key: 'positiveThreshold' | 'negativeThreshold',
  ) => (
    <Field key={id}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type="number"
        min={-100}
        max={100}
        step={1}
        className={RSI_INPUT_CLASSNAME}
        value={settings[key]}
        onChange={(event) => onChange({ ...settings, [key]: Number(event.target.value) })}
        onBlur={onSanitize}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSanitize()
        }}
      />
    </Field>
  )

  return (
    <FieldGroup>
      <Field>
        <FieldLabel id="order-book-depth-source-label">Source</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          className="grid w-full grid-cols-1"
          aria-labelledby="order-book-depth-source-label"
          value={settings.source}
          onValueChange={(value) => {
            if (value !== 'binance') return
            onChange({ ...settings, source: value })
          }}
        >
          <ToggleGroupItem value="binance" className="w-full">
            Binance
          </ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          Binance USD-M BTCUSDT is the only order-book source in V1.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel id="order-book-depth-distance-label">Price distance</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          className="grid w-full grid-cols-4"
          aria-labelledby="order-book-depth-distance-label"
          value={String(settings.distance)}
          onValueChange={(value) => {
            const distance = Number(value)
            if (
              !value ||
              !(ORDER_BOOK_DEPTH_DISTANCES as readonly number[]).includes(distance)
            ) {
              return
            }
            onChange({
              ...settings,
              distance: distance as OrderBookDepthDistance,
            })
          }}
        >
          {ORDER_BOOK_DEPTH_DISTANCES.map((distance) => (
            <ToggleGroupItem
              key={distance}
              value={String(distance)}
              className="w-full"
            >
              {ORDER_BOOK_DEPTH_DISTANCE_LABELS[distance]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          Percent each side of the midpoint. Coverage below this distance is
          never rendered as a measurement.
        </FieldDescription>
      </Field>

      {numberField(
        'order-book-depth-positive-threshold',
        'Positive threshold',
        'positiveThreshold',
      )}
      {numberField(
        'order-book-depth-negative-threshold',
        'Negative threshold',
        'negativeThreshold',
      )}
    </FieldGroup>
  )
}

/**
 * Draft-based indicator settings: color, opacity, width, `Line`/`Dot`, the
 * time-based VWAP band background, the RSI range and the Order Book Depth
 * numeric/source fields all edit the local draft.
 * `Save` commits only changed fields through the existing presentation/RSI
 * callbacks; `Cancel`, `X`, `Esc` and outside click discard the draft without
 * writing storage.
 */
function MarketIndicatorStyleDialogBody({
  indicatorId,
  presentation,
  seriesColors,
  seriesLineWidths,
  seriesLineStyles,
  rsiSettings,
  orderBookDepthSettings,
  onCancel,
  onSubmit,
}: {
  indicatorId: MarketIndicatorId
  presentation: MarketIndicatorPresentation
  seriesColors: readonly string[]
  seriesLineWidths: readonly LineChartStrokeWidth[]
  seriesLineStyles: readonly LineChartStrokeStyle[]
  rsiSettings?: RsiSettings
  orderBookDepthSettings?: OrderBookDepthSettings
  onCancel: () => void
  onSubmit: (patch: MarketIndicatorStyleDraftPatch) => void
}) {
  const [initial] = useState<MarketIndicatorStyleDraft>(() =>
    marketIndicatorStyleDraftFromInputs({
      color: marketIndicatorColorInputValue(presentation.color, seriesColors),
      opacityPercent: marketIndicatorOpacityInputValue(presentation.opacity),
      lineWidth: marketIndicatorLineWidthInputValue(presentation.lineWidth, seriesLineWidths),
      lineStyle: marketIndicatorLineStyleSelectValue(presentation.lineStyle, seriesLineStyles),
      fillColor: sessionVwapBandFillColorInputValue(presentation.fillColor),
      fillOpacityPercent: sessionVwapBandFillOpacityInputValue(presentation.fillOpacity),
      rsiSettings,
      orderBookDepthSettings,
    }),
  )
  const [draft, setDraft] = useState<MarketIndicatorStyleDraft>(initial)

  const usesDistinctSeriesColors =
    presentation.color === undefined && marketIndicatorUsesDistinctSeriesColors(seriesColors)
  const usesDistinctSeriesLineWidths =
    presentation.lineWidth === undefined &&
    marketIndicatorUsesDistinctSeriesLineWidths(seriesLineWidths)
  const usesDistinctSeriesLineStyles =
    presentation.lineStyle === undefined &&
    marketIndicatorUsesDistinctSeriesLineStyles(seriesLineStyles)

  return (
    <>
      <div className={CHART_SETTINGS_DIALOG_BODY_CLASS}>
        {indicatorId === 'rsi' && draft.rsi ? (
          <section className="space-y-2">
            <p className="text-xs font-medium text-foreground">RSI range</p>
            <RsiRangeFields
              settings={draft.rsi}
              onChange={(rsi) => setDraft((current) => ({ ...current, rsi }))}
              onSanitize={() =>
                setDraft((current) => ({
                  ...current,
                  rsi: current.rsi === null ? null : sanitizeRsiSettings(current.rsi),
                }))
              }
            />
          </section>
        ) : null}
        {indicatorId === 'order-book-depth' && draft.orderBookDepth ? (
          <section className="space-y-2">
            <p className="text-xs font-medium text-foreground">Order book depth</p>
            <OrderBookDepthFields
              settings={draft.orderBookDepth}
              onChange={(orderBookDepth) =>
                setDraft((current) => ({ ...current, orderBookDepth }))
              }
              onSanitize={() =>
                setDraft((current) => ({
                  ...current,
                  orderBookDepth:
                    current.orderBookDepth === null
                      ? null
                      : sanitizeOrderBookDepthSettings(current.orderBookDepth),
                }))
              }
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
            color={draft.color}
            opacityPercent={draft.opacityPercent}
            lineStyle={draft.lineStyle}
            lineStyleMixed={usesDistinctSeriesLineStyles}
            onColorChange={(color) => setDraft((current) => ({ ...current, color }))}
            onOpacityChange={(opacityPercent) =>
              setDraft((current) => ({ ...current, opacityPercent }))
            }
            onLineStyleChange={(lineStyle) => setDraft((current) => ({ ...current, lineStyle }))}
          />
          {usesDistinctSeriesLineWidths ? (
            <p className="text-xs text-muted-foreground">
              Mixed line widths on chart. Pick a width to apply to all lines.
            </p>
          ) : null}
          <LineChartStrokeSelectFields
            widthId="indicator-width"
            lineWidth={draft.lineWidth}
            onLineWidthChange={(lineWidth) => setDraft((current) => ({ ...current, lineWidth }))}
          />
        </FieldGroup>
        {marketIndicatorSupportsBandFill(indicatorId) ? (
          <section className="space-y-2">
            <p className="text-xs font-medium text-foreground">Background</p>
            <ColorOpacityField
              id="indicator-background-color"
              label="Color"
              color={draft.fillColor}
              opacityPercent={draft.fillOpacityPercent}
              onColorChange={(fillColor) => setDraft((current) => ({ ...current, fillColor }))}
              onOpacityChange={(fillOpacityPercent) =>
                setDraft((current) => ({ ...current, fillOpacityPercent }))
              }
            />
          </section>
        ) : null}
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const sanitized = sanitizeMarketIndicatorStyleDraft(initial, draft)
            setDraft(sanitized)
            onSubmit(marketIndicatorStyleDraftPatch(initial, sanitized))
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function MarketIndicatorStyleDialog({
  indicatorId,
  presentation,
  seriesColors,
  seriesLineWidths,
  seriesLineStyles,
  rsiSettings,
  orderBookDepthSettings,
  returnFocusId,
  onOpenChange,
  onPresentationChange,
  onRsiSettingsChange,
  onOrderBookDepthSettingsChange,
}: MarketIndicatorStyleDialogProps) {
  const label = indicatorId ? MARKET_INDICATOR_DEFINITIONS[indicatorId].label : 'Indicator'

  const handleSave = (patch: MarketIndicatorStyleDraftPatch) => {
    if (!indicatorId) return
    if (Object.keys(patch.presentation).length > 0) {
      onPresentationChange(indicatorId, { ...presentation, ...patch.presentation })
    }
    if (patch.rsi && onRsiSettingsChange) {
      onRsiSettingsChange(patch.rsi)
    }
    if (patch.orderBookDepth && onOrderBookDepthSettingsChange) {
      onOrderBookDepthSettingsChange(patch.orderBookDepth)
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={indicatorId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false)
      }}
    >
      <DialogContent
        className={CHART_SETTINGS_DIALOG_CONTENT_CLASS}
        overlayClassName={CHART_SETTINGS_DIALOG_OVERLAY_CLASS}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Indicator style</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        {indicatorId ? (
          <MarketIndicatorStyleDialogBody
            key={indicatorId}
            indicatorId={indicatorId}
            presentation={presentation}
            seriesColors={seriesColors}
            seriesLineWidths={seriesLineWidths}
            seriesLineStyles={seriesLineStyles}
            rsiSettings={rsiSettings}
            orderBookDepthSettings={
              orderBookDepthSettings ?? DEFAULT_ORDER_BOOK_DEPTH_SETTINGS
            }
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
