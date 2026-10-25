import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LINE_CHART_STROKE_STYLE_LABELS } from '@/market/lineChartStroke'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import {
  sanitizeAnchoredVwapDrawingSettings,
  type AnchoredVwapDrawingBandPairSettings,
  type AnchoredVwapDrawingSettings,
} from '@/market/anchoredVwapDrawingSettings'
import {
  isRollingVwapLineStyle,
  isRollingVwapLineWidth,
  ROLLING_VWAP_LINE_STYLES,
  ROLLING_VWAP_LINE_WIDTHS,
} from '@/market/rollingVwapSettings'

const inputClassName =
  'h-8 w-full rounded-md border border-input bg-input/20 px-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30'

type AnchoredVwapSettingsDialogProps = {
  open: boolean
  savedSettings: AnchoredVwapDrawingSettings
  onOpenChange: (open: boolean) => void
  onSave: (settings: AnchoredVwapDrawingSettings) => void
}

function BandPairSection({
  idPrefix,
  label,
  draft,
  onChange,
}: {
  idPrefix: string
  label: string
  draft: AnchoredVwapDrawingBandPairSettings
  onChange: (next: AnchoredVwapDrawingBandPairSettings) => void
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.visible}
          onChange={(event) => onChange({ ...draft, visible: event.target.checked })}
        />
        <span className="font-medium text-foreground">{label}</span>
      </label>
      <label className="block space-y-1">
        <span className="text-muted-foreground">Multiplier</span>
        <input
          type="number"
          min={0}
          step={0.5}
          className={inputClassName}
          value={draft.multiplier}
          onChange={(event) => onChange({ ...draft, multiplier: Number(event.target.value) })}
        />
      </label>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        className="grid w-full grid-cols-4"
        value={String(draft.lineWidth)}
        onValueChange={(value) => {
          if (!value) return
          const parsed = Number(value)
          if (!isRollingVwapLineWidth(parsed)) return
          onChange({ ...draft, lineWidth: parsed })
        }}
      >
        {ROLLING_VWAP_LINE_WIDTHS.map((width) => (
          <ToggleGroupItem key={width} value={String(width)} className="w-full">
            {width}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        className="grid w-full grid-cols-2"
        value={draft.lineStyle}
        onValueChange={(value) => {
          if (!value || !isRollingVwapLineStyle(value)) return
          onChange({ ...draft, lineStyle: value })
        }}
      >
        {ROLLING_VWAP_LINE_STYLES.map((style) => (
          <ToggleGroupItem
            key={style}
            value={style}
            aria-label={`Line style ${LINE_CHART_STROKE_STYLE_LABELS[style]}`}
            className="w-full"
          >
            {LINE_CHART_STROKE_STYLE_LABELS[style]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.upperVisible}
            onChange={(event) => onChange({ ...draft, upperVisible: event.target.checked })}
          />
          <span className="text-muted-foreground">Upper</span>
        </label>
        <ColorOpacityField
          id={`${idPrefix}-upper-color`}
          label="Upper color"
          color={draft.upperColor}
          opacityPercent={draft.upperOpacity}
          onColorChange={(upperColor) => onChange({ ...draft, upperColor })}
          onOpacityChange={(upperOpacity) => onChange({ ...draft, upperOpacity })}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.lowerVisible}
            onChange={(event) => onChange({ ...draft, lowerVisible: event.target.checked })}
          />
          <span className="text-muted-foreground">Lower</span>
        </label>
        <ColorOpacityField
          id={`${idPrefix}-lower-color`}
          label="Lower color"
          color={draft.lowerColor}
          opacityPercent={draft.lowerOpacity}
          onColorChange={(lowerColor) => onChange({ ...draft, lowerColor })}
          onOpacityChange={(lowerOpacity) => onChange({ ...draft, lowerOpacity })}
        />
        <ColorOpacityField
          id={`${idPrefix}-fill-color`}
          label="Fill"
          color={draft.fillColor}
          opacityPercent={draft.fillOpacity}
          onColorChange={(fillColor) => onChange({ ...draft, fillColor })}
          onOpacityChange={(fillOpacity) => onChange({ ...draft, fillOpacity })}
        />
      </div>
    </div>
  )
}

function AnchoredVwapSettingsDialogBody({
  savedSettings,
  onClose,
  onSave,
}: {
  savedSettings: AnchoredVwapDrawingSettings
  onClose: () => void
  onSave: (settings: AnchoredVwapDrawingSettings) => void
}) {
  const [draft, setDraft] = useState<AnchoredVwapDrawingSettings>(() =>
    sanitizeAnchoredVwapDrawingSettings(savedSettings),
  )

  const handleSave = () => {
    onSave(sanitizeAnchoredVwapDrawingSettings(draft))
    onClose()
  }

  return (
    <>
      <DialogHeader className="shrink-0">
        <DialogTitle>Anchored VWAP settings</DialogTitle>
      </DialogHeader>

      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-y-contain text-xs">
        <section className="space-y-2">
          <p className="font-medium text-foreground">VWAP line</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.vwapLine.visible}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  vwapLine: { ...current.vwapLine, visible: event.target.checked },
                }))
              }
            />
            <span>Visible</span>
          </label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="grid w-full grid-cols-4"
            value={String(draft.vwapLine.lineWidth)}
            onValueChange={(value) => {
              if (!value) return
              const parsed = Number(value)
              if (!isRollingVwapLineWidth(parsed)) return
              setDraft((current) => ({
                ...current,
                vwapLine: { ...current.vwapLine, lineWidth: parsed },
              }))
            }}
          >
            {ROLLING_VWAP_LINE_WIDTHS.map((width) => (
              <ToggleGroupItem key={width} value={String(width)} className="w-full">
                {width}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="grid w-full grid-cols-2"
            value={draft.vwapLine.lineStyle}
            onValueChange={(value) => {
              if (!value || !isRollingVwapLineStyle(value)) return
              setDraft((current) => ({
                ...current,
                vwapLine: { ...current.vwapLine, lineStyle: value },
              }))
            }}
          >
            {ROLLING_VWAP_LINE_STYLES.map((style) => (
              <ToggleGroupItem
                key={style}
                value={style}
                aria-label={`Line style ${LINE_CHART_STROKE_STYLE_LABELS[style]}`}
                className="w-full"
              >
                {LINE_CHART_STROKE_STYLE_LABELS[style]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ColorOpacityField
            id="anchored-vwap-line-color"
            label="Color"
            color={draft.vwapLine.lineColor}
            opacityPercent={draft.vwapLine.lineOpacity}
            onColorChange={(lineColor) =>
              setDraft((current) => ({
                ...current,
                vwapLine: { ...current.vwapLine, lineColor },
              }))
            }
            onOpacityChange={(lineOpacity) =>
              setDraft((current) => ({
                ...current,
                vwapLine: { ...current.vwapLine, lineOpacity },
              }))
            }
          />
        </section>

        <section className="space-y-2">
          <p className="font-medium text-foreground">Standard deviation bands</p>
          <BandPairSection
            idPrefix="anchored-vwap-band1"
            label="Band pair #1"
            draft={draft.band1}
            onChange={(band1) => setDraft((current) => ({ ...current, band1 }))}
          />
          <BandPairSection
            idPrefix="anchored-vwap-band2"
            label="Band pair #2"
            draft={draft.band2}
            onChange={(band2) => setDraft((current) => ({ ...current, band2 }))}
          />
          <BandPairSection
            idPrefix="anchored-vwap-band3"
            label="Band pair #3"
            draft={draft.band3}
            onChange={(band3) => setDraft((current) => ({ ...current, band3 }))}
          />
        </section>
      </div>

      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave}>
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function AnchoredVwapSettingsDialog({
  open,
  savedSettings,
  onOpenChange,
  onSave,
}: AnchoredVwapSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-md flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {open ? (
          <AnchoredVwapSettingsDialogBody
            savedSettings={savedSettings}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
