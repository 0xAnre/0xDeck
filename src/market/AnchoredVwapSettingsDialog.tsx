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
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'
import {
  sanitizeAnchoredVwapDrawingSettings,
  type AnchoredVwapDrawingBandPairSettings,
  type AnchoredVwapDrawingSettings,
} from '@/market/anchoredVwapDrawingSettings'

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
      <LineChartStrokeSelectFields
        widthId={`${idPrefix}-width`}
        lineWidth={draft.lineWidth}
        onLineWidthChange={(lineWidth) => onChange({ ...draft, lineWidth })}
      />
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
          // The band pair shares one `lineStyle` for its upper and lower lines, so
          // both stroke fields expose the same `Line` / `Dot` row (the fill below does not).
          lineStyle={draft.lineStyle}
          onColorChange={(upperColor) => onChange({ ...draft, upperColor })}
          onOpacityChange={(upperOpacity) => onChange({ ...draft, upperOpacity })}
          onLineStyleChange={(lineStyle) => onChange({ ...draft, lineStyle })}
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
          lineStyle={draft.lineStyle}
          onColorChange={(lowerColor) => onChange({ ...draft, lowerColor })}
          onOpacityChange={(lowerOpacity) => onChange({ ...draft, lowerOpacity })}
          onLineStyleChange={(lineStyle) => onChange({ ...draft, lineStyle })}
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
        <DialogDescription>Anchored VWAP line and band presentation</DialogDescription>
      </DialogHeader>

      <div className={`${CHART_SETTINGS_DIALOG_BODY_CLASS} text-xs`}>
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
          <LineChartStrokeSelectFields
            widthId="anchored-vwap-line-width"
            lineWidth={draft.vwapLine.lineWidth}
            onLineWidthChange={(lineWidth) =>
              setDraft((current) => ({
                ...current,
                vwapLine: { ...current.vwapLine, lineWidth },
              }))
            }
          />
          <ColorOpacityField
            id="anchored-vwap-line-color"
            label="Color"
            color={draft.vwapLine.lineColor}
            opacityPercent={draft.vwapLine.lineOpacity}
            lineStyle={draft.vwapLine.lineStyle}
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
            onLineStyleChange={(lineStyle) =>
              setDraft((current) => ({
                ...current,
                vwapLine: { ...current.vwapLine, lineStyle },
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
        className={CHART_SETTINGS_DIALOG_CONTENT_CLASS}
        overlayClassName={CHART_SETTINGS_DIALOG_OVERLAY_CLASS}
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
