import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import {
  formatLineInstanceLabel,
  lineInstanceStrokeOpacityPercent,
  lineInstanceStrokeStyle,
  lineInstanceStrokeWidth,
  type LineInstance,
} from '@/market/lineInstances'
import { readLineStrokeColorHexForInstance } from '@/market/lineColors'

type LineStyleDialogProps = {
  instance: LineInstance | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onStrokeColorChange: (instanceId: string, strokeColor: string) => void
  onStrokeOpacityChange: (instanceId: string, strokeOpacity: number) => void
  onLineWidthChange: (instanceId: string, lineWidth: LineChartStrokeWidth) => void
  onLineStyleChange: (instanceId: string, lineStyle: LineChartStrokeStyle) => void
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
          <DialogTitle>Line style</DialogTitle>
          <DialogDescription>
            {instance ? formatLineInstanceLabel(instance) : 'Line presentation'}
          </DialogDescription>
        </DialogHeader>
        {instance ? (
          <FieldGroup>
            <ColorOpacityField
              id="line-stroke-color"
              label="Color"
              color={readLineStrokeColorHexForInstance(instance)}
              opacityPercent={lineInstanceStrokeOpacityPercent(instance)}
              lineStyle={lineInstanceStrokeStyle(instance)}
              onColorChange={(color) => onStrokeColorChange(instance.id, color)}
              onOpacityChange={(opacityPercent) =>
                onStrokeOpacityChange(instance.id, opacityPercent)
              }
              onLineStyleChange={(lineStyle) => onLineStyleChange(instance.id, lineStyle)}
            />
            <LineChartStrokeSelectFields
              widthId="line-width"
              lineWidth={lineInstanceStrokeWidth(instance)}
              onLineWidthChange={(lineWidth) => onLineWidthChange(instance.id, lineWidth)}
            />
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
