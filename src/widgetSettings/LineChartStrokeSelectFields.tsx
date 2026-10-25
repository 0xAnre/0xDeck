import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  LINE_CHART_STROKE_STYLE_LABELS,
  LINE_CHART_STROKE_STYLES,
  LINE_CHART_STROKE_WIDTHS,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from '@/market/lineChartStroke'

type LineChartStrokeSelectFieldsProps = {
  widthId: string
  styleId: string
  lineWidth: LineChartStrokeWidth
  lineStyle: LineChartStrokeStyle
  onLineWidthChange: (width: LineChartStrokeWidth) => void
  onLineStyleChange: (style: LineChartStrokeStyle) => void
  showStyleSelect?: boolean
}

export function LineChartStrokeSelectFields({
  widthId,
  styleId,
  lineWidth,
  lineStyle,
  onLineWidthChange,
  onLineStyleChange,
  showStyleSelect = true,
}: LineChartStrokeSelectFieldsProps) {
  return (
    <>
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
      {showStyleSelect ? (
        <Field>
          <FieldLabel htmlFor={styleId}>Style</FieldLabel>
          <Select value={lineStyle} onValueChange={(value) => onLineStyleChange(value as LineChartStrokeStyle)}>
            <SelectTrigger id={styleId} className="w-full" size="default">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {LINE_CHART_STROKE_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {LINE_CHART_STROKE_STYLE_LABELS[style]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </>
  )
}
