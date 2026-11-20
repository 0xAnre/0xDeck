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
import { Slider } from '@/components/ui/slider'
import {
  POSITION_MARKER_SIZE_MAX,
  POSITION_MARKER_SIZE_MIN,
  POSITION_MARKER_SIZE_STEP,
  positionMarkerSizeLabel,
  sanitizePositionMarkerSize,
  type PositionMarkerSettings,
} from '@/market/positionMarkers'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'

const MARKER_SIZE_LABEL_ID = 'position-marker-size-label'

type MarketPositionMarkerSettingsDialogProps = {
  open: boolean
  settings: PositionMarkerSettings
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onSettingsChange: (settings: PositionMarkerSettings) => void
}

/**
 * Draft-based Position Markers settings: the slider edits a local draft, only
 * `Save` commits the size through storage + chart, and `Cancel`, `X`, `Esc` and
 * outside click discard the draft without writing storage.
 *
 * Size is the only control: marker color, shape and position stay fixed and the
 * visibility toggle stays in the Indicators menu row.
 */
function MarketPositionMarkerSettingsDialogBody({
  settings,
  onCancel,
  onSubmit,
}: {
  settings: PositionMarkerSettings
  onCancel: () => void
  onSubmit: (size: number) => void
}) {
  const [initial] = useState<number>(() => sanitizePositionMarkerSize(settings.size))
  const [draft, setDraft] = useState<number>(initial)

  return (
    <>
      <div className={CHART_SETTINGS_DIALOG_BODY_CLASS}>
        <FieldGroup>
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel id={MARKER_SIZE_LABEL_ID}>Marker Size</FieldLabel>
              <span className="text-xs tabular-nums text-muted-foreground">
                {positionMarkerSizeLabel(draft)}
              </span>
            </div>
            <Slider
              id="position-marker-size"
              aria-labelledby={MARKER_SIZE_LABEL_ID}
              min={POSITION_MARKER_SIZE_MIN}
              max={POSITION_MARKER_SIZE_MAX}
              step={POSITION_MARKER_SIZE_STEP}
              value={[draft]}
              onValueChange={(value) => {
                const next = value[0]
                if (next === undefined) return
                setDraft(sanitizePositionMarkerSize(next))
              }}
            />
            <FieldDescription>
              Arrow size as a multiple of the chart default. Marker color, shape
              and position are fixed, and the size does not change what a marker
              means.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSubmit(draft)}>
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function MarketPositionMarkerSettingsDialog({
  open,
  settings,
  returnFocusId,
  onOpenChange,
  onSettingsChange,
}: MarketPositionMarkerSettingsDialogProps) {
  const handleSave = (size: number) => {
    const sanitized = sanitizePositionMarkerSize(size)
    if (sanitized !== sanitizePositionMarkerSize(settings.size)) {
      onSettingsChange({ ...settings, size: sanitized })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={CHART_SETTINGS_DIALOG_CONTENT_CLASS}
        overlayClassName={CHART_SETTINGS_DIALOG_OVERLAY_CLASS}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Position Markers settings</DialogTitle>
          <DialogDescription>
            Hyperliquid entry/close arrow size on the candle series.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <MarketPositionMarkerSettingsDialogBody
            settings={settings}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
