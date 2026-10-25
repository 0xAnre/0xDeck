import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldLabel } from '@/components/ui/field'
import { LINE_CHART_STROKE_WIDTHS, type LineChartStrokeWidth } from '@/market/lineChartStroke'

type LineChartStrokeSelectFieldsProps = {
  widthId: string
  lineWidth: LineChartStrokeWidth
  onLineWidthChange: (width: LineChartStrokeWidth) => void
}

/**
 * Stroke width select for the BTC Perp style dialogs.
 *
 * Width stays in the dialog body (it is not a color/opacity concern); the
 * `Line` / `Dot` style picker now lives inside the `ColorOpacityField` popover
 * for the same stroke, so there is no second, redundant style control here.
 */
export function LineChartStrokeSelectFields({
  widthId,
  lineWidth,
  onLineWidthChange,
}: LineChartStrokeSelectFieldsProps) {
  return (
    <Field>
      <FieldLabel htmlFor={widthId}>Width</FieldLabel>
      <Select
        value={String(lineWidth)}
        onValueChange={(value) => onLineWidthChange(Number(value) as LineChartStrokeWidth)}
      >
        <SelectTrigger id={widthId} className="w-full" size="default">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {LINE_CHART_STROKE_WIDTHS.map((width) => (
              <SelectItem key={width} value={String(width)}>{`${width}px`}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
