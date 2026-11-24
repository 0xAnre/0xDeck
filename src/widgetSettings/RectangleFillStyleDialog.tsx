import { useState } from 'react'
import { LockIcon, LockOpenIcon } from 'lucide-react'
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
import { Toggle } from '@/components/ui/toggle'
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
  onLockedChange: (instanceId: string, locked: boolean) => void
}

/**
 * Draft-based rectangle settings: the fill color/opacity pair and the geometry
 * lock flag edit a local draft; `Save` commits only changed fields through the
 * instance update → persist path, and `Cancel`, `X`, `Esc` and outside click
 * discard the draft without writing storage.
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
  const lockLabelId = `rectangle-lock-label-${instance.id}`
  const lockDescriptionId = `rectangle-lock-description-${instance.id}`

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
          <Field>
            <FieldLabel id={lockLabelId}>Lock</FieldLabel>
            <Toggle
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              pressed={draft.locked}
              onPressedChange={(locked) => setDraft((current) => ({ ...current, locked }))}
              aria-labelledby={lockLabelId}
              aria-describedby={lockDescriptionId}
            >
              {draft.locked ? (
                <LockIcon data-icon="inline-start" />
              ) : (
                <LockOpenIcon data-icon="inline-start" />
              )}
              {draft.locked ? 'Locked' : 'Unlocked'}
            </Toggle>
            <FieldDescription id={lockDescriptionId}>
              Locked boxes stay visible and can still be selected or opened for settings, but
              cannot be moved, resized or deleted on the chart. Save applies the change; Cancel,
              Esc and close discard it.
            </FieldDescription>
          </Field>
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
  onLockedChange,
}: RectangleFillStyleDialogProps) {
  const handleSave = (instanceId: string, patch: RectangleFillStyleDraftPatch) => {
    if (patch.fillColor !== undefined) onFillColorChange(instanceId, patch.fillColor)
    if (patch.fillOpacity !== undefined) onFillOpacityChange(instanceId, patch.fillOpacity)
    if (patch.locked !== undefined) onLockedChange(instanceId, patch.locked)
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
          <DialogTitle>Rectangle settings</DialogTitle>
          <DialogDescription>
            {instance ? formatRectangleInstanceLabel(instance) : 'Fill style and lock'}
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
