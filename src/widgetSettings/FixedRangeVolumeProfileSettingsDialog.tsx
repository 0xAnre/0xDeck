import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'
import {
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
  DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
  formatFixedRangeVolumeProfileInstanceLabel,
  MAX_FIXED_RANGE_VP_ROW_COUNT,
  type FixedRangeVolumeProfileInstance,
} from '@/market/fixedRangeVolumeProfileInstances'
import {
  DEFAULT_FRVP_LEVEL_LINE_WIDTH,
  frvpInstanceLevelLineStyle,
  frvpInstanceLevelLineWidth,
  frvpInstanceLevelStrokeOpacityPercent,
  frvpLevelStrokeColorInputValue,
  type FrvpLevelLineKind,
} from '@/market/frvpInstanceLineStyles'
import {
  frvpHistogramColorInputValue,
  frvpHistogramOpacityPercent,
  type FrvpHistogramDirection,
} from '@/market/frvpHistogramStyles'
import { FRVP_LEVEL_DEFAULT_OPACITY_PERCENT } from '@/market/frvpLevelLineColors'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'

type FixedRangeVolumeProfileSettingsDialogProps = {
  instance: FixedRangeVolumeProfileInstance | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onRowCountChange: (instanceId: string, rowCount: number) => void
  onValueAreaPercentChange: (instanceId: string, valueAreaPercent: number) => void
  onExtendRightChange: (instanceId: string, extendRight: boolean) => void
  onHistogramColorChange: (
    instanceId: string,
    direction: FrvpHistogramDirection,
    color: string,
  ) => void
  onHistogramOpacityChange: (
    instanceId: string,
    direction: FrvpHistogramDirection,
    opacityPercent: number,
  ) => void
  onLevelStrokeColorChange: (instanceId: string, kind: FrvpLevelLineKind, strokeColor: string) => void
  onLevelLineWidthChange: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    lineWidth: LineChartStrokeWidth,
  ) => void
  onLevelLineStyleChange: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    lineStyle: LineChartStrokeStyle,
  ) => void
  onLevelStrokeOpacityChange: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    opacityPercent: number,
  ) => void
}

function LevelLineStyleFields({
  instance,
  kind,
  label,
  colorId,
  widthId,
  styleId,
  opacityId,
  onLevelStrokeColorChange,
  onLevelLineWidthChange,
  onLevelLineStyleChange,
  onLevelStrokeOpacityChange,
}: {
  instance: FixedRangeVolumeProfileInstance
  kind: FrvpLevelLineKind
  label: string
  colorId: string
  widthId: string
  styleId: string
  opacityId: string
  onLevelStrokeColorChange: (instanceId: string, kind: FrvpLevelLineKind, strokeColor: string) => void
  onLevelLineWidthChange: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    lineWidth: LineChartStrokeWidth,
  ) => void
  onLevelLineStyleChange: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    lineStyle: LineChartStrokeStyle,
  ) => void
  onLevelStrokeOpacityChange: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    opacityPercent: number,
  ) => void
}) {
  const opacity = frvpInstanceLevelStrokeOpacityPercent(instance, kind)

  return (
    <FieldGroup className="gap-3 border-t border-border pt-3">
      <p className="text-sm font-medium">{label}</p>
      <ColorOpacityField
        id={colorId}
        opacityId={opacityId}
        label="Color"
        color={frvpLevelStrokeColorInputValue(instance, kind)}
        opacityPercent={opacity}
        onColorChange={(color) => onLevelStrokeColorChange(instance.id, kind, color)}
        onOpacityChange={(opacityPercent) =>
          onLevelStrokeOpacityChange(instance.id, kind, opacityPercent)
        }
      />
      <LineChartStrokeSelectFields
        widthId={widthId}
        styleId={styleId}
        lineWidth={frvpInstanceLevelLineWidth(instance, kind)}
        lineStyle={frvpInstanceLevelLineStyle(instance, kind)}
        onLineWidthChange={(lineWidth) => onLevelLineWidthChange(instance.id, kind, lineWidth)}
        onLineStyleChange={(lineStyle) => onLevelLineStyleChange(instance.id, kind, lineStyle)}
      />
    </FieldGroup>
  )
}

function HistogramStyleFields({
  instance,
  direction,
  label,
  colorId,
  opacityId,
  onHistogramColorChange,
  onHistogramOpacityChange,
}: {
  instance: FixedRangeVolumeProfileInstance
  direction: FrvpHistogramDirection
  label: string
  colorId: string
  opacityId: string
  onHistogramColorChange: (
    instanceId: string,
    direction: FrvpHistogramDirection,
    color: string,
  ) => void
  onHistogramOpacityChange: (
    instanceId: string,
    direction: FrvpHistogramDirection,
    opacityPercent: number,
  ) => void
}) {
  return (
    <ColorOpacityField
      id={colorId}
      opacityId={opacityId}
      label={label}
      color={frvpHistogramColorInputValue(instance, direction)}
      opacityPercent={frvpHistogramOpacityPercent(instance, direction)}
      onColorChange={(color) => onHistogramColorChange(instance.id, direction, color)}
      onOpacityChange={(opacityPercent) =>
        onHistogramOpacityChange(instance.id, direction, opacityPercent)
      }
    />
  )
}

export function FixedRangeVolumeProfileSettingsDialog({
  instance,
  returnFocusId,
  onOpenChange,
  onRowCountChange,
  onValueAreaPercentChange,
  onExtendRightChange,
  onHistogramColorChange,
  onHistogramOpacityChange,
  onLevelStrokeColorChange,
  onLevelLineWidthChange,
  onLevelLineStyleChange,
  onLevelStrokeOpacityChange,
}: FixedRangeVolumeProfileSettingsDialogProps) {
  return (
    <Dialog
      open={instance !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false)
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-sm flex-col overflow-hidden sm:max-w-sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Volume profile</DialogTitle>
          <DialogDescription>
            {instance ? formatFixedRangeVolumeProfileInstanceLabel(instance) : 'Profile settings'}
          </DialogDescription>
        </DialogHeader>
        {instance ? (
          <div className="min-h-0 overflow-y-auto overscroll-y-contain">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="frvp-row-count">Row count</FieldLabel>
              <Input
                id="frvp-row-count"
                type="number"
                min={1}
                max={MAX_FIXED_RANGE_VP_ROW_COUNT}
                value={instance.rowCount}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10)
                  if (
                    Number.isFinite(value) &&
                    value >= 1 &&
                    value <= MAX_FIXED_RANGE_VP_ROW_COUNT
                  ) {
                    onRowCountChange(instance.id, value)
                  }
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="frvp-value-area">Value area %</FieldLabel>
              <Input
                id="frvp-value-area"
                type="number"
                min={0}
                max={100}
                value={instance.valueAreaPercent}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10)
                  if (Number.isFinite(value) && value >= 0 && value <= 100) {
                    onValueAreaPercentChange(instance.id, value)
                  }
                }}
              />
            </Field>
            <Field>
              <label className="flex items-center gap-2">
                <input
                  id="frvp-extend-right"
                  type="checkbox"
                  checked={instance.extendRight === true}
                  onChange={(event) =>
                    onExtendRightChange(instance.id, event.target.checked)
                  }
                />
                <span className="text-sm font-medium">Extend right</span>
              </label>
              <FieldDescription>
                Keep the drawing coordinates but calculate the profile up to the latest candle.
              </FieldDescription>
            </Field>
            <FieldGroup className="gap-3 border-t border-border pt-3">
              <p className="text-sm font-medium">Histogram</p>
              <HistogramStyleFields
                instance={instance}
                direction="up"
                label="Up volume"
                colorId="frvp-histogram-up-color"
                opacityId="frvp-histogram-up-opacity"
                onHistogramColorChange={onHistogramColorChange}
                onHistogramOpacityChange={onHistogramOpacityChange}
              />
              <HistogramStyleFields
                instance={instance}
                direction="down"
                label="Down volume"
                colorId="frvp-histogram-down-color"
                opacityId="frvp-histogram-down-opacity"
                onHistogramColorChange={onHistogramColorChange}
                onHistogramOpacityChange={onHistogramOpacityChange}
              />
            </FieldGroup>
            <LevelLineStyleFields
              instance={instance}
              kind="poc"
              label="POC line"
              colorId="frvp-poc-color"
              widthId="frvp-poc-width"
              styleId="frvp-poc-style"
              opacityId="frvp-poc-opacity"
              onLevelStrokeColorChange={onLevelStrokeColorChange}
              onLevelLineWidthChange={onLevelLineWidthChange}
              onLevelLineStyleChange={onLevelLineStyleChange}
              onLevelStrokeOpacityChange={onLevelStrokeOpacityChange}
            />
            <LevelLineStyleFields
              instance={instance}
              kind="vah"
              label="VAH line"
              colorId="frvp-vah-color"
              widthId="frvp-vah-width"
              styleId="frvp-vah-style"
              opacityId="frvp-vah-opacity"
              onLevelStrokeColorChange={onLevelStrokeColorChange}
              onLevelLineWidthChange={onLevelLineWidthChange}
              onLevelLineStyleChange={onLevelLineStyleChange}
              onLevelStrokeOpacityChange={onLevelStrokeOpacityChange}
            />
            <LevelLineStyleFields
              instance={instance}
              kind="val"
              label="VAL line"
              colorId="frvp-val-color"
              widthId="frvp-val-width"
              styleId="frvp-val-style"
              opacityId="frvp-val-opacity"
              onLevelStrokeColorChange={onLevelStrokeColorChange}
              onLevelLineWidthChange={onLevelLineWidthChange}
              onLevelLineStyleChange={onLevelLineStyleChange}
              onLevelStrokeOpacityChange={onLevelStrokeOpacityChange}
            />
            <p className="text-xs text-muted-foreground">
              Defaults: {DEFAULT_FIXED_RANGE_VP_ROW_COUNT} rows,{' '}
              {DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT}% value area, extend right on. POC,
              VAH and VAL at {DEFAULT_FRVP_LEVEL_LINE_WIDTH}px /{' '}
              {FRVP_LEVEL_DEFAULT_OPACITY_PERCENT}% opacity (POC dot, VAH/VAL line).
            </p>
          </FieldGroup>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
