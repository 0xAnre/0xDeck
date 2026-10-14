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
  label,
  draft,
  onChange,
}: {
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
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
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
        <label className="space-y-1">
          <span className="text-muted-foreground">Opacity (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            className={inputClassName}
            value={draft.lineOpacity}
            onChange={(event) => onChange({ ...draft, lineOpacity: Number(event.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Color</span>
          <input
            type="color"
            className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
            value={draft.lineColor}
            onChange={(event) => onChange({ ...draft, lineColor: event.target.value })}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-muted-foreground">Fill opacity (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            className={inputClassName}
            value={draft.fillOpacity}
            onChange={(event) => onChange({ ...draft, fillOpacity: Number(event.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Fill color</span>
          <input
            type="color"
            className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
            value={draft.fillColor}
            onChange={(event) => onChange({ ...draft, fillColor: event.target.value })}
          />
        </label>
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
              <ToggleGroupItem key={style} value={style} className="w-full capitalize">
                {style}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground">Opacity (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                className={inputClassName}
                value={draft.vwapLine.lineOpacity}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    vwapLine: { ...current.vwapLine, lineOpacity: Number(event.target.value) },
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">Color</span>
              <input
                type="color"
                className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                value={draft.vwapLine.lineColor}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    vwapLine: { ...current.vwapLine, lineColor: event.target.value },
                  }))
                }
              />
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <p className="font-medium text-foreground">Standard deviation bands</p>
          <BandPairSection
            label="Band pair #1"
            draft={draft.band1}
            onChange={(band1) => setDraft((current) => ({ ...current, band1 }))}
          />
          <BandPairSection
            label="Band pair #2"
            draft={draft.band2}
            onChange={(band2) => setDraft((current) => ({ ...current, band2 }))}
          />
          <BandPairSection
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
