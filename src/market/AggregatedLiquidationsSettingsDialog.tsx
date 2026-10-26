import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  aggregatedLiquidationsSettingsDraftFrom,
  aggregatedLiquidationsSettingsDraftPatch,
  sanitizeAggregatedLiquidationsSettingsDraft,
  type AggregatedLiquidationsSettingsDraft,
  type AggregatedLiquidationsSettingsDraftPatch,
} from '@/market/aggregatedLiquidationsSettingsDraft'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'

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

/**
 * Draft-based Aggregated Liquidations settings: source and pane position edit a
 * local draft; `Save` commits the changed fields through the existing settings
 * callback (storage + chart), and `Cancel`, `X`, `Esc` and outside click discard
 * the draft without writing storage.
 */
function AggregatedLiquidationsSettingsDialogBody({
  settings,
  onCancel,
  onSubmit,
}: {
  settings: AggregatedLiquidationsSettings
  onCancel: () => void
  onSubmit: (patch: AggregatedLiquidationsSettingsDraftPatch) => void
}) {
  const [initial] = useState<AggregatedLiquidationsSettingsDraft>(() =>
    aggregatedLiquidationsSettingsDraftFrom(settings),
  )
  const [draft, setDraft] = useState<AggregatedLiquidationsSettingsDraft>(initial)

  return (
    <>
      <div className={CHART_SETTINGS_DIALOG_BODY_CLASS}>
        <FieldGroup>
          <Field>
            <FieldLabel id="aggregated-liquidations-source-label">Source</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              className="grid w-full grid-cols-3"
              aria-labelledby="aggregated-liquidations-source-label"
              value={draft.source}
              onValueChange={(value) => {
                if (value !== 'binance') return
                setDraft((current) => ({ ...current, source: value }))
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
              value={draft.position}
              onValueChange={(value) => {
                if (
                  !value ||
                  !(AGGREGATED_LIQUIDATIONS_POSITIONS as readonly string[]).includes(value)
                ) {
                  return
                }
                setDraft((current) => ({
                  ...current,
                  position: value as AggregatedLiquidationsPosition,
                }))
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
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() =>
            onSubmit(
              aggregatedLiquidationsSettingsDraftPatch(
                initial,
                sanitizeAggregatedLiquidationsSettingsDraft(initial, draft),
              ),
            )
          }
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function AggregatedLiquidationsSettingsDialog({
  open,
  settings,
  returnFocusId,
  onOpenChange,
  onSettingsChange,
}: AggregatedLiquidationsSettingsDialogProps) {
  const handleSave = (patch: AggregatedLiquidationsSettingsDraftPatch) => {
    if (Object.keys(patch).length > 0) {
      onSettingsChange({ ...settings, ...patch })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={CHART_SETTINGS_DIALOG_CONTENT_CLASS}
        overlayClassName={CHART_SETTINGS_DIALOG_OVERLAY_CLASS}
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Aggregated Liquidations settings</DialogTitle>
          <DialogDescription>
            Live Binance BTCUSDT perpetual liquidation orders, aggregated per chart
            candle.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AggregatedLiquidationsSettingsDialogBody
            key="aggregated-liquidations-settings"
            settings={settings}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
