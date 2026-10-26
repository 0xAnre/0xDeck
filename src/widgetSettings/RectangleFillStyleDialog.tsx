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
import { formatRectangleInstanceLabel, type RectangleInstance } from '@/market/rectangleInstances'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'
import {
  rectangleFillStyleDraftFromInstance,
  rectangleFillStyleDraftPatch,
  sanitizeRectangleFillStyleDraft,
  type RectangleFillStyleDraft,
  type RectangleFillStyleDraftPatch,
} from '@/widgetSettings/rectangleFillStyleDraft'

const COLOR_INPUT_ID = 'rectangle-fill-color'

type RectangleFillStyleDialogProps = {
  instance: RectangleInstance | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onFillColorChange: (instanceId: string, fillColor: string) => void
  onFillOpacityChange: (instanceId: string, fillOpacity: number) => void
}

/**
 * Draft-based rectangle fill settings: `Save` commits changed fields through the
 * instance update → persist path; `Cancel`, `X`, `Esc` and outside click discard.
 */
function RectangleFillStyleDialogBody({
  instance,
  onCancel,
  onSubmit,
}: {
  instance: RectangleInstance
  onCancel: () => void
  onSubmit: (instanceId: string, patch: RectangleFillStyleDraftPatch) => void
}) {
  const [initial] = useState<RectangleFillStyleDraft>(() =>
    rectangleFillStyleDraftFromInstance(instance),
  )
  const [draft, setDraft] = useState<RectangleFillStyleDraft>(initial)

  return (
    <>
      <div className={CHART_SETTINGS_DIALOG_BODY_CLASS}>
        <FieldGroup>
          <ColorOpacityField
            id={COLOR_INPUT_ID}
            label="Fill color"
            color={draft.fillColor}
            opacityPercent={draft.fillOpacityPercent}
            onColorChange={(fillColor) => setDraft((current) => ({ ...current, fillColor }))}
            onOpacityChange={(fillOpacityPercent) =>
              setDraft((current) => ({ ...current, fillOpacityPercent }))
            }
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
              rectangleFillStyleDraftPatch(
                initial,
                sanitizeRectangleFillStyleDraft(initial, draft),
              ),
            )
          }
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function RectangleFillStyleDialog({
  instance,
  returnFocusId,
  onOpenChange,
  onFillColorChange,
  onFillOpacityChange,
}: RectangleFillStyleDialogProps) {
  const handleSave = (instanceId: string, patch: RectangleFillStyleDraftPatch) => {
    if (patch.fillColor !== undefined) onFillColorChange(instanceId, patch.fillColor)
    if (patch.fillOpacity !== undefined) onFillOpacityChange(instanceId, patch.fillOpacity)
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
          <DialogTitle>Rectangle fill</DialogTitle>
          <DialogDescription>
            {instance ? formatRectangleInstanceLabel(instance) : 'Fill style'}
          </DialogDescription>
        </DialogHeader>
        {instance ? (
          <RectangleFillStyleDialogBody
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
