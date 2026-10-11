import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_FIXED_RANGE_VP_ROW_COUNT,
  DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT,
  formatFixedRangeVolumeProfileInstanceLabel,
  type FixedRangeVolumeProfileInstance,
} from '@/market/fixedRangeVolumeProfileInstances'

type FixedRangeVolumeProfileSettingsDialogProps = {
  instance: FixedRangeVolumeProfileInstance | null
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onRowCountChange: (instanceId: string, rowCount: number) => void
  onValueAreaPercentChange: (instanceId: string, valueAreaPercent: number) => void
}

export function FixedRangeVolumeProfileSettingsDialog({
  instance,
  returnFocusId,
  onOpenChange,
  onRowCountChange,
  onValueAreaPercentChange,
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
                value={instance.rowCount}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10)
                  if (Number.isFinite(value) && value >= 1) {
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
            <p className="text-xs text-muted-foreground">
              Defaults: {DEFAULT_FIXED_RANGE_VP_ROW_COUNT} rows, {DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT}% value area.
            </p>
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
