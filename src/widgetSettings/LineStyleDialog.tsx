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
import { FieldGroup } from '@/components/ui/field'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'
import {
  lineStyleDraftFromInstance,
  lineStyleDraftPatch,
  sanitizeLineStyleDraft,
  type LineStyleDraft,
  type LineStyleDraftPatch,
} from '@/widgetSettings/lineStyleDraft'
import { formatLineInstanceLabel, type LineInstance } from '@/market/lineInstances'

type LineStyleDialogProps = {
  instance: LineInstance | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onStrokeColorChange: (instanceId: string, strokeColor: string) => void
  onStrokeOpacityChange: (instanceId: string, strokeOpacity: number) => void
  onLineWidthChange: (instanceId: string, lineWidth: LineChartStrokeWidth) => void
  onLineStyleChange: (instanceId: string, lineStyle: LineChartStrokeStyle) => void
}

/**
 * Draft-based line settings: every control edits a local draft and only `Save`
 * commits the changed fields through the instance update → persist path.
 * `Cancel`, `X`, `Esc` and outside click discard the draft.
 */
function LineStyleDialogBody({
  instance,
  onCancel,
  onSubmit,
}: {
  instance: LineInstance
  onCancel: () => void
  onSubmit: (instanceId: string, patch: LineStyleDraftPatch) => void
}) {
  const [initial] = useState<LineStyleDraft>(() => lineStyleDraftFromInstance(instance))
  const [draft, setDraft] = useState<LineStyleDraft>(initial)

  return (
    <>
      <div className={CHART_SETTINGS_DIALOG_BODY_CLASS}>
        <FieldGroup>
          <ColorOpacityField
            id="line-stroke-color"
            label="Color"
            color={draft.color}
            opacityPercent={draft.opacityPercent}
            lineStyle={draft.lineStyle}
            onColorChange={(color) => setDraft((current) => ({ ...current, color }))}
            onOpacityChange={(opacityPercent) =>
              setDraft((current) => ({ ...current, opacityPercent }))
            }
            onLineStyleChange={(lineStyle) => setDraft((current) => ({ ...current, lineStyle }))}
          />
          <LineChartStrokeSelectFields
            widthId="line-width"
            lineWidth={draft.lineWidth}
            onLineWidthChange={(lineWidth) => setDraft((current) => ({ ...current, lineWidth }))}
          />
        </FieldGroup>
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() =>
            onSubmit(
              instance.id,
              lineStyleDraftPatch(initial, sanitizeLineStyleDraft(initial, draft)),
            )
          }
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function LineStyleDialog({
  instance,
  returnFocusId,
  onOpenChange,
  onStrokeColorChange,
  onStrokeOpacityChange,
  onLineWidthChange,
  onLineStyleChange,
}: LineStyleDialogProps) {
  const handleSave = (instanceId: string, patch: LineStyleDraftPatch) => {
    if (patch.strokeColor !== undefined) onStrokeColorChange(instanceId, patch.strokeColor)
    if (patch.strokeOpacity !== undefined) {
      onStrokeOpacityChange(instanceId, patch.strokeOpacity)
    }
    if (patch.lineWidth !== undefined) onLineWidthChange(instanceId, patch.lineWidth)
    if (patch.lineStyle !== undefined) onLineStyleChange(instanceId, patch.lineStyle)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={instance !== null}
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
          <DialogTitle>Line style</DialogTitle>
          <DialogDescription>
            {instance ? formatLineInstanceLabel(instance) : 'Line presentation'}
          </DialogDescription>
        </DialogHeader>
        {instance ? (
          <LineStyleDialogBody
            key={instance.id}
            instance={instance}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
