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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
  sessionVwapSeriesStyleInputsFromFlat,
  type SessionVwapSeriesStyleInputs,
} from '@/market/marketIndicatorSeriesColors'
import {
  sessionVwapBandFillColorInputValue,
  sessionVwapBandFillOpacityInputValue,
} from '@/market/sessionVwapBandFillStyle'
import {
  mergeMarketIndicatorSeriesStyles,
  type MarketIndicatorPresentation,
} from '@/marketIndicatorPresentationStorage'
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
  type MarketIndicatorSeriesStyleDraft,
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
  /** Resolved per-line values for the time-based VWAP center/upper/lower lines. */
  sessionVwapSeriesInputs?: SessionVwapSeriesStyleInputs | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onPresentationChange: (indicatorId: MarketIndicatorId, presentation: MarketIndicatorPresentation) => void
  onRsiSettingsChange?: (settings: RsiSettings) => void
}

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
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
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
      <Field orientation="horizontal">
        <input
          id="rsi-threshold-glow"
          type="checkbox"
          checked={settings.thresholdGlow}
          onChange={(event) =>
            onChange({ ...settings, thresholdGlow: event.target.checked })
          }
        />
        <FieldLabel htmlFor="rsi-threshold-glow">Threshold Glow</FieldLabel>
      </Field>
    </FieldGroup>
  )
}

const SESSION_VWAP_SERIES_FIELDS = [
  { key: 'vwap', label: 'Center line' },
  { key: 'previousUpper1', label: 'Upper band' },
  { key: 'previousLower1', label: 'Lower band' },
] as const

/** One independent Color/Opacity/Width/Line-Dot block for a session VWAP line. */
function SessionVwapSeriesStyleFields({
  label,
  idPrefix,
  style,
  onChange,
}: {
  label: string
  idPrefix: string
  style: MarketIndicatorSeriesStyleDraft
  onChange: (style: MarketIndicatorSeriesStyleDraft) => void
}) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <ColorOpacityField
        id={`${idPrefix}-color`}
        label="Color"
        color={style.color}
        opacityPercent={style.opacityPercent}
        lineStyle={style.lineStyle}
        onColorChange={(color) => onChange({ ...style, color })}
        onOpacityChange={(opacityPercent) => onChange({ ...style, opacityPercent })}
        onLineStyleChange={(lineStyle) => onChange({ ...style, lineStyle })}
      />
      <LineChartStrokeSelectFields
        widthId={`${idPrefix}-width`}
        lineWidth={style.lineWidth}
        onLineWidthChange={(lineWidth) => onChange({ ...style, lineWidth })}
      />
    </section>
  )
}

/**
 * Draft-based indicator settings: color, opacity, width, `Line`/`Dot`, the
 * time-based VWAP band background and the RSI range all edit the local draft.
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
  sessionVwapSeriesInputs,
  onCancel,
  onSubmit,
}: {
  indicatorId: MarketIndicatorId
  presentation: MarketIndicatorPresentation
  seriesColors: readonly string[]
  seriesLineWidths: readonly LineChartStrokeWidth[]
  seriesLineStyles: readonly LineChartStrokeStyle[]
  rsiSettings?: RsiSettings
  sessionVwapSeriesInputs?: SessionVwapSeriesStyleInputs | null
  onCancel: () => void
  onSubmit: (patch: MarketIndicatorStyleDraftPatch) => void
}) {
  const [initial] = useState<MarketIndicatorStyleDraft>(() => {
    const color = marketIndicatorColorInputValue(presentation.color, seriesColors)
    const opacityPercent = marketIndicatorOpacityInputValue(presentation.opacity)
    const lineWidth = marketIndicatorLineWidthInputValue(
      presentation.lineWidth,
      seriesLineWidths,
    )
    const lineStyle = marketIndicatorLineStyleSelectValue(
      presentation.lineStyle,
      seriesLineStyles,
    )
    return marketIndicatorStyleDraftFromInputs({
      color,
      opacityPercent,
      lineWidth,
      lineStyle,
      fillColor: sessionVwapBandFillColorInputValue(presentation.fillColor),
      fillOpacityPercent: sessionVwapBandFillOpacityInputValue(presentation.fillOpacity),
      series: marketIndicatorSupportsBandFill(indicatorId)
        ? sessionVwapSeriesInputs ??
          sessionVwapSeriesStyleInputsFromFlat({ color, opacityPercent, lineWidth, lineStyle })
        : null,
      rsiSettings,
    })
  })
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
        {marketIndicatorSupportsBandFill(indicatorId) ? (
          <div className="space-y-3">
            {SESSION_VWAP_SERIES_FIELDS.map(({ key, label }) => {
              const style = draft.series[key]
              if (!style) return null
              return (
                <SessionVwapSeriesStyleFields
                  key={key}
                  label={label}
                  idPrefix={`indicator-${key}`}
                  style={style}
                  onChange={(next) =>
                    setDraft((current) => ({
                      ...current,
                      series: { ...current.series, [key]: next },
                    }))
                  }
                />
              )
            })}
          </div>
        ) : (
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
        )}
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
  sessionVwapSeriesInputs,
  returnFocusId,
  onOpenChange,
  onPresentationChange,
  onRsiSettingsChange,
}: MarketIndicatorStyleDialogProps) {
  const label = indicatorId ? MARKET_INDICATOR_DEFINITIONS[indicatorId].label : 'Indicator'

  const handleSave = (patch: MarketIndicatorStyleDraftPatch) => {
    if (!indicatorId) return
    if (Object.keys(patch.presentation).length > 0) {
      const next: MarketIndicatorPresentation = { ...presentation, ...patch.presentation }
      const series = mergeMarketIndicatorSeriesStyles(
        presentation.series,
        patch.presentation.series,
      )
      if (series) {
        next.series = series
      } else {
        delete next.series
      }
      onPresentationChange(indicatorId, next)
    }
    if (patch.rsi && onRsiSettingsChange) {
      onRsiSettingsChange(patch.rsi)
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
            sessionVwapSeriesInputs={sessionVwapSeriesInputs}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
