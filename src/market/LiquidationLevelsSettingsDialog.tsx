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
import { Input } from '@/components/ui/input'
import {
  DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
  LIQUIDATION_LEVELS_MAX_WIDTH_PERCENT,
  LIQUIDATION_LEVELS_MIN_WIDTH_PERCENT,
  LIQUIDATION_LEVELS_WIDTH_STEP_PERCENT,
  liquidationLevelsSettingsEqual,
  sanitizeLiquidationLevelsSettings,
  type LiquidationLevelsSettings,
} from '@/market/liquidationLevelsSettings'
import { LIQUIDATION_LEVELS_SOURCE_LABEL } from '@/market/liquidationLevelsProtocol'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'

type LiquidationLevelsSettingsDialogProps = {
  open: boolean
  settings: LiquidationLevelsSettings
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onSave: (settings: LiquidationLevelsSettings) => void
}

/**
 * Draft-based live liquidation-level profile settings.
 *
 * The profile is a bar object: each side owns one shared Color + Opacity pair
 * and one bar-extent control, following the chart-object capability matrix.
 * There is deliberately no Width, Line/Dot, Lock or line-style control — the
 * profile has no stroke and no movable geometry. All edits stay in a local
 * draft; `Cancel`, `X`, `Esc` and outside click discard it, and only `Save`
 * commits through the panel's settings → storage path.
 */
function LiquidationLevelsSettingsDialogBody({
  settings,
  onCancel,
  onSubmit,
}: {
  settings: LiquidationLevelsSettings
  onCancel: () => void
  onSubmit: (next: LiquidationLevelsSettings) => void
}) {
  const [initial] = useState<LiquidationLevelsSettings>(() => ({
    ...settings,
  }))
  const [draft, setDraft] = useState<LiquidationLevelsSettings>(initial)

  const sanitize = () =>
    setDraft((current) =>
      sanitizeLiquidationLevelsSettings({ ...initial, ...current }),
    )

  return (
    <>
      <div className={CHART_SETTINGS_DIALOG_BODY_CLASS}>
        <FieldGroup>
          <FieldDescription>
            {LIQUIDATION_LEVELS_SOURCE_LABEL}. Each bar is today&apos;s open
            positions whose liquidation price sits at that price — a current
            profile, not executed liquidation history, and not a candle value.
          </FieldDescription>

          <FieldGroup className="gap-3 border-t border-border pt-3">
            <p className="text-sm font-medium">Bars</p>
            <ColorOpacityField
              id="liquidation-levels-long-color"
              label="Long positions"
              color={draft.longColor}
              opacityPercent={draft.longOpacityPercent}
              onColorChange={(longColor) =>
                setDraft((current) => ({ ...current, longColor }))
              }
              onOpacityChange={(longOpacityPercent) =>
                setDraft((current) => ({ ...current, longOpacityPercent }))
              }
            />
            <ColorOpacityField
              id="liquidation-levels-short-color"
              label="Short positions"
              color={draft.shortColor}
              opacityPercent={draft.shortOpacityPercent}
              onColorChange={(shortColor) =>
                setDraft((current) => ({ ...current, shortColor }))
              }
              onOpacityChange={(shortOpacityPercent) =>
                setDraft((current) => ({ ...current, shortOpacityPercent }))
              }
            />
            <FieldDescription>
              Both sides share one magnitude scale, so equal bar length means
              equal open size on either side. Defaults are the semantic pair
              (long green, short red) at{' '}
              {DEFAULT_LIQUIDATION_LEVELS_SETTINGS.longOpacityPercent}% opacity.
            </FieldDescription>
          </FieldGroup>

          <Field>
            <FieldLabel htmlFor="liquidation-levels-max-width">
              Max bar width (% of pane)
            </FieldLabel>
            <Input
              id="liquidation-levels-max-width"
              type="number"
              min={LIQUIDATION_LEVELS_MIN_WIDTH_PERCENT}
              max={LIQUIDATION_LEVELS_MAX_WIDTH_PERCENT}
              step={LIQUIDATION_LEVELS_WIDTH_STEP_PERCENT}
              value={draft.maxWidthPercent}
              onChange={(event) => {
                const value = Number.parseFloat(event.target.value)
                if (!Number.isFinite(value)) return
                setDraft((current) => ({ ...current, maxWidthPercent: value }))
              }}
              onBlur={sanitize}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sanitize()
              }}
            />
            <FieldDescription>
              Horizontal extent of the largest row. Bars are anchored to the
              candle pane&apos;s right edge and always extend left; the price
              scale, candles and viewport are never changed.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onSubmit(sanitizeLiquidationLevelsSettings(draft))}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function LiquidationLevelsSettingsDialog({
  open,
  settings,
  returnFocusId,
  onOpenChange,
  onSave,
}: LiquidationLevelsSettingsDialogProps) {
  const handleSave = (next: LiquidationLevelsSettings) => {
    if (!liquidationLevelsSettingsEqual(settings, next)) {
      onSave(next)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={CHART_SETTINGS_DIALOG_CONTENT_CLASS}
        overlayClassName={CHART_SETTINGS_DIALOG_OVERLAY_CLASS}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Liquidation Levels settings</DialogTitle>
          <DialogDescription>
            Live open-position liquidation prices from MarketLens&apos;
            Hyperliquid L4 feed, drawn on the candle pane.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <LiquidationLevelsSettingsDialogBody
            key={`${settings.longColor}|${settings.longOpacityPercent}|${settings.shortColor}|${settings.shortOpacityPercent}|${settings.maxWidthPercent}`}
            settings={settings}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
