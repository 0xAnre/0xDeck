import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import {
  formatLineInstanceLabel,
  lineInstanceStrokeStyle,
  lineInstanceStrokeWidth,
  type LineInstance,
} from '@/market/lineInstances'
import { readLineStrokeStyleForInstance } from '@/market/lineColors'

type LineStyleDialogProps = {
  instance: LineInstance | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onStrokeColorChange: (instanceId: string, strokeColor: string) => void
  onLineWidthChange: (instanceId: string, lineWidth: LineChartStrokeWidth) => void
  onLineStyleChange: (instanceId: string, lineStyle: LineChartStrokeStyle) => void
}

export function LineStyleDialog({
  instance,
  returnFocusId,
  onOpenChange,
  onStrokeColorChange,
  onLineWidthChange,
  onLineStyleChange,
}: LineStyleDialogProps) {
  const strokeColor = instance
    ? readLineStrokeStyleForInstance(instance).replace(/^rgb\((\d+), (\d+), (\d+)\)$/, (_, r, g, b) => {
        const toHex = (n: string) => Number(n).toString(16).padStart(2, '0')
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`
      })
    : '#71717a'

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
            <Field>
              <FieldLabel htmlFor="line-stroke-color">Color</FieldLabel>
              <Input
                id="line-stroke-color"
                type="color"
                value={instance.strokeColor ?? strokeColor}
                onChange={(event) => onStrokeColorChange(instance.id, event.target.value)}
              />
            </Field>
            <LineChartStrokeSelectFields
              widthId="line-width"
              styleId="line-style"
              lineWidth={lineInstanceStrokeWidth(instance)}
              lineStyle={lineInstanceStrokeStyle(instance)}
              onLineWidthChange={(lineWidth) => onLineWidthChange(instance.id, lineWidth)}
              onLineStyleChange={(lineStyle) => onLineStyleChange(instance.id, lineStyle)}
            />
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
