import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { LineChartStrokeWidth } from '@/market/lineChartStroke'
import {
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
  DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
  formatFixedRangeVolumeProfileInstanceLabel,
  MAX_FIXED_RANGE_VP_ROW_COUNT,
  type FixedRangeVolumeProfileInstance,
} from '@/market/fixedRangeVolumeProfileInstances'
import {
  FRVP_VAH_VAL_DEFAULT_HEX,
  frvpInstanceLevelLineWidth,
  type FrvpLevelLineKind,
} from '@/market/frvpInstanceLineStyles'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'

const POC_DEFAULT_HEX = '#dc2626'

type FixedRangeVolumeProfileSettingsDialogProps = {
  instance: FixedRangeVolumeProfileInstance | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onRowCountChange: (instanceId: string, rowCount: number) => void
  onValueAreaPercentChange: (instanceId: string, valueAreaPercent: number) => void
  onLevelStrokeColorChange: (instanceId: string, kind: FrvpLevelLineKind, strokeColor: string) => void
  onLevelLineWidthChange: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    lineWidth: LineChartStrokeWidth,
  ) => void
}

function levelStrokeColorValue(instance: FixedRangeVolumeProfileInstance, kind: FrvpLevelLineKind): string {
  switch (kind) {
    case 'poc':
      return instance.pocStrokeColor ?? POC_DEFAULT_HEX
    case 'vah':
      return instance.vahStrokeColor ?? FRVP_VAH_VAL_DEFAULT_HEX
    case 'val':
      return instance.valStrokeColor ?? FRVP_VAH_VAL_DEFAULT_HEX
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

function LevelLineStyleFields({
  instance,
  kind,
  label,
  colorId,
  widthId,
  onLevelStrokeColorChange,
  onLevelLineWidthChange,
}: {
  instance: FixedRangeVolumeProfileInstance
  kind: FrvpLevelLineKind
  label: string
  colorId: string
  widthId: string
  onLevelStrokeColorChange: (instanceId: string, kind: FrvpLevelLineKind, strokeColor: string) => void
  onLevelLineWidthChange: (
    instanceId: string,
    kind: FrvpLevelLineKind,
    lineWidth: LineChartStrokeWidth,
  ) => void
}) {
  return (
    <FieldGroup className="gap-3 border-t border-border pt-3">
      <p className="text-sm font-medium">{label}</p>
      <Field>
        <FieldLabel htmlFor={colorId}>Color</FieldLabel>
        <Input
          id={colorId}
          type="color"
          value={levelStrokeColorValue(instance, kind)}
          onChange={(event) => onLevelStrokeColorChange(instance.id, kind, event.target.value)}
        />
      </Field>
      <LineChartStrokeSelectFields
        widthId={widthId}
        styleId={`${widthId}-style-hidden`}
        lineWidth={frvpInstanceLevelLineWidth(instance, kind)}
        lineStyle="solid"
        onLineWidthChange={(lineWidth) => onLevelLineWidthChange(instance.id, kind, lineWidth)}
        onLineStyleChange={() => {}}
        showStyleSelect={false}
      />
    </FieldGroup>
  )
}

export function FixedRangeVolumeProfileSettingsDialog({
  instance,
  returnFocusId,
  onOpenChange,
  onRowCountChange,
  onValueAreaPercentChange,
  onLevelStrokeColorChange,
  onLevelLineWidthChange,
}: FixedRangeVolumeProfileSettingsDialogProps) {
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
          <DialogTitle>Volume profile</DialogTitle>
          <DialogDescription>
            {instance ? formatFixedRangeVolumeProfileInstanceLabel(instance) : 'Profile settings'}
          </DialogDescription>
        </DialogHeader>
        {instance ? (
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
            <LevelLineStyleFields
              instance={instance}
              kind="poc"
              label="POC line"
              colorId="frvp-poc-color"
              widthId="frvp-poc-width"
              onLevelStrokeColorChange={onLevelStrokeColorChange}
              onLevelLineWidthChange={onLevelLineWidthChange}
            />
            <LevelLineStyleFields
              instance={instance}
              kind="vah"
              label="VAH line"
              colorId="frvp-vah-color"
              widthId="frvp-vah-width"
              onLevelStrokeColorChange={onLevelStrokeColorChange}
              onLevelLineWidthChange={onLevelLineWidthChange}
            />
            <LevelLineStyleFields
              instance={instance}
              kind="val"
              label="VAL line"
              colorId="frvp-val-color"
              widthId="frvp-val-width"
              onLevelStrokeColorChange={onLevelStrokeColorChange}
              onLevelLineWidthChange={onLevelLineWidthChange}
            />
            <p className="text-xs text-muted-foreground">
              Defaults: {DEFAULT_FIXED_RANGE_VP_ROW_COUNT} rows, {DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT}% value area.
            </p>
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
