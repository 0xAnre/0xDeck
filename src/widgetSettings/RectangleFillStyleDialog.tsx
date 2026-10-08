import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { rectangleInstancePickerFillHex } from '@/market/rectangleColors'
import {
  formatRectangleInstanceLabel,
  rectangleInstanceFillOpacityPercent,
} from '@/market/rectangleInstances'
import type { RectangleInstance } from '@/market/rectangleInstances'

const COLOR_INPUT_ID = 'rectangle-fill-color'
const OPACITY_INPUT_ID = 'rectangle-fill-opacity'

type RectangleFillStyleDialogProps = {
  instance: RectangleInstance | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onFillColorChange: (instanceId: string, fillColor: string) => void
  onFillOpacityChange: (instanceId: string, fillOpacity: number) => void
}

export function RectangleFillStyleDialog({
  instance,
  returnFocusId,
  onOpenChange,
  onFillColorChange,
  onFillOpacityChange,
}: RectangleFillStyleDialogProps) {
  const opacity = instance ? rectangleInstanceFillOpacityPercent(instance) : 0

  return (
    <Dialog
      open={instance !== null}
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
          <DialogTitle>Rectangle fill</DialogTitle>
          <DialogDescription>
            {instance ? formatRectangleInstanceLabel(instance) : 'Fill style'}
          </DialogDescription>
        </DialogHeader>
        {instance ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={COLOR_INPUT_ID}>Fill color</FieldLabel>
              <Input
                id={COLOR_INPUT_ID}
                type="color"
                className="h-8 w-16 cursor-pointer p-1"
                value={rectangleInstancePickerFillHex(instance)}
                onChange={(event) => {
                  onFillColorChange(instance.id, event.target.value)
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={OPACITY_INPUT_ID}>Fill opacity</FieldLabel>
              <Slider
                id={OPACITY_INPUT_ID}
                min={0}
                max={100}
                step={1}
                value={[opacity]}
                onValueChange={(value) => {
                  const next = value[0]
                  if (next === undefined || !Number.isFinite(next)) return
                  onFillOpacityChange(instance.id, Math.round(next))
                }}
              />
              <FieldDescription>{opacity}%</FieldDescription>
            </Field>
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
