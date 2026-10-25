import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { rectangleInstancePickerFillHex } from '@/market/rectangleColors'
import {
  formatRectangleInstanceLabel,
  rectangleInstanceFillOpacityPercent,
} from '@/market/rectangleInstances'
import type { RectangleInstance } from '@/market/rectangleInstances'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'

const COLOR_INPUT_ID = 'rectangle-fill-color'

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
            <ColorOpacityField
              id={COLOR_INPUT_ID}
              label="Fill color"
              color={rectangleInstancePickerFillHex(instance)}
              opacityPercent={rectangleInstanceFillOpacityPercent(instance)}
              onColorChange={(color) => onFillColorChange(instance.id, color)}
              onOpacityChange={(opacityPercent) => onFillOpacityChange(instance.id, opacityPercent)}
            />
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
