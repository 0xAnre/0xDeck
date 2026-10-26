import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  AGGREGATED_LIQUIDATIONS_POSITIONS,
  AGGREGATED_LIQUIDATIONS_SOURCES,
  type AggregatedLiquidationsPosition,
  type AggregatedLiquidationsSettings,
  type AggregatedLiquidationsSource,
} from '@/market/aggregatedLiquidationsSettings'

const SOURCE_LABELS: Record<AggregatedLiquidationsSource, string> = {
  binance: 'Binance',
  hyperliquid: 'Hyperliquid',
  both: 'Both',
}

const POSITION_LABELS: Record<AggregatedLiquidationsPosition, string> = {
  bottom: 'Bottom',
  top: 'Top',
}

type AggregatedLiquidationsSettingsDialogProps = {
  open: boolean
  settings: AggregatedLiquidationsSettings
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onSettingsChange: (settings: AggregatedLiquidationsSettings) => void
}

export function AggregatedLiquidationsSettingsDialog({
  open,
  settings,
  returnFocusId,
  onOpenChange,
  onSettingsChange,
}: AggregatedLiquidationsSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Aggregated Liquidations settings</DialogTitle>
          <DialogDescription>
            Live Binance BTCUSDT perpetual liquidation orders, aggregated per chart
            candle.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel id="aggregated-liquidations-source-label">Source</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              className="grid w-full grid-cols-3"
              aria-labelledby="aggregated-liquidations-source-label"
              value={settings.source}
              onValueChange={(value) => {
                if (value !== 'binance') return
                onSettingsChange({ ...settings, source: value })
              }}
            >
              {AGGREGATED_LIQUIDATIONS_SOURCES.map((source) => (
                <ToggleGroupItem
                  key={source}
                  value={source}
                  disabled={source !== 'binance'}
                  aria-label={`${SOURCE_LABELS[source]} source${
                    source === 'binance' ? '' : ' (not available in V1)'
                  }`}
                  className="w-full"
                >
                  {SOURCE_LABELS[source]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              Only Binance is available in V1. Hyperliquid and Both are disabled.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel id="aggregated-liquidations-position-label">Position</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              className="grid w-full grid-cols-2"
              aria-labelledby="aggregated-liquidations-position-label"
              value={settings.position}
              onValueChange={(value) => {
                if (
                  !value ||
                  !(AGGREGATED_LIQUIDATIONS_POSITIONS as readonly string[]).includes(value)
                ) {
                  return
                }
                onSettingsChange({
                  ...settings,
                  position: value as AggregatedLiquidationsPosition,
                })
              }}
            >
              {AGGREGATED_LIQUIDATIONS_POSITIONS.map((position) => (
                <ToggleGroupItem
                  key={position}
                  value={position}
                  className="w-full"
                >
                  {POSITION_LABELS[position]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              Bottom grows bars upward from the pane baseline; Top grows them
              downward.
            </FieldDescription>
          </Field>

          <FieldDescription>
            Live-only feed. Binance forceOrder snapshots are not a complete
            market-wide liquidation total.
          </FieldDescription>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  )
}
