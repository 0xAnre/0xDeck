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
  type FrvpLevelLineKind,
} from '@/market/frvpInstanceLineStyles'
import {
  FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT,
  type FrvpHistogramDirection,
} from '@/market/frvpHistogramStyles'
import { FRVP_LEVEL_DEFAULT_OPACITY_PERCENT } from '@/market/frvpLevelLineColors'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'
import {
  frvpSettingsDraftFromInstance,
  frvpSettingsDraftPatch,
  sanitizeFrvpSettingsDraft,
  type FrvpHistogramStyleDraft,
  type FrvpLevelStyleDraft,
  type FrvpSettingsDraft,
  type FrvpSettingsDraftPatch,
} from '@/widgetSettings/fixedRangeVolumeProfileSettingsDraft'

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
  kind,
  label,
  colorId,
  widthId,
  opacityId,
  draft,
  onChange,
}: {
  kind: FrvpLevelLineKind
  label: string
  colorId: string
  widthId: string
  opacityId: string
  draft: FrvpLevelStyleDraft
  onChange: (kind: FrvpLevelLineKind, next: Partial<FrvpLevelStyleDraft>) => void
}) {
  return (
    <FieldGroup className="gap-3 border-t border-border pt-3">
      <p className="text-sm font-medium">{label}</p>
      <ColorOpacityField
        id={colorId}
        opacityId={opacityId}
        label="Color"
        color={draft.color}
        opacityPercent={draft.opacityPercent}
        lineStyle={draft.lineStyle}
        onColorChange={(color) => onChange(kind, { color })}
        onOpacityChange={(opacityPercent) => onChange(kind, { opacityPercent })}
        onLineStyleChange={(lineStyle) => onChange(kind, { lineStyle })}
      />
      <LineChartStrokeSelectFields
        widthId={widthId}
        lineWidth={draft.lineWidth}
        onLineWidthChange={(lineWidth) => onChange(kind, { lineWidth })}
      />
    </FieldGroup>
  )
}

function HistogramStyleFields({
  direction,
  label,
  colorId,
  opacityId,
  draft,
  onChange,
}: {
  direction: FrvpHistogramDirection
  label: string
  colorId: string
  opacityId: string
  draft: FrvpHistogramStyleDraft
  onChange: (direction: FrvpHistogramDirection, next: Partial<FrvpHistogramStyleDraft>) => void
}) {
  return (
    <ColorOpacityField
      id={colorId}
      opacityId={opacityId}
      label={label}
      color={draft.color}
      opacityPercent={draft.opacityPercent}
      onColorChange={(color) => onChange(direction, { color })}
      onOpacityChange={(opacityPercent) => onChange(direction, { opacityPercent })}
    />
  )
}

/**
 * Draft-based volume profile settings: row count, value area and every
 * histogram/level style edit the local draft; `Save` commits only changed fields
 * through the instance update → persist path. `Cancel`, `X`, `Esc` and outside
 * click discard the draft without touching storage or the open instance.
 */
function FixedRangeVolumeProfileSettingsDialogBody({
  instance,
  onCancel,
  onSubmit,
}: {
  instance: FixedRangeVolumeProfileInstance
  onCancel: () => void
  onSubmit: (instanceId: string, patch: FrvpSettingsDraftPatch) => void
}) {
  const [initial] = useState<FrvpSettingsDraft>(() => frvpSettingsDraftFromInstance(instance))
  const [draft, setDraft] = useState<FrvpSettingsDraft>(initial)

  const sanitizeDraft = () => setDraft((current) => sanitizeFrvpSettingsDraft(initial, current))

  const setLevel = (kind: FrvpLevelLineKind, next: Partial<FrvpLevelStyleDraft>) =>
    setDraft((current) => ({
      ...current,
      levels: { ...current.levels, [kind]: { ...current.levels[kind], ...next } },
    }))

  const setHistogram = (
    direction: FrvpHistogramDirection,
    next: Partial<FrvpHistogramStyleDraft>,
  ) =>
    setDraft((current) => ({
      ...current,
      histogram: {
        ...current.histogram,
        [direction]: { ...current.histogram[direction], ...next },
      },
    }))

  return (
    <>
      <div className={CHART_SETTINGS_DIALOG_BODY_CLASS}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="frvp-row-count">Row count</FieldLabel>
            <Input
              id="frvp-row-count"
              type="number"
              min={1}
              max={MAX_FIXED_RANGE_VP_ROW_COUNT}
              value={draft.rowCount}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10)
                if (!Number.isFinite(value)) return
                setDraft((current) => ({ ...current, rowCount: value }))
              }}
              onBlur={sanitizeDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sanitizeDraft()
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
              value={draft.valueAreaPercent}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10)
                if (!Number.isFinite(value)) return
                setDraft((current) => ({ ...current, valueAreaPercent: value }))
              }}
              onBlur={sanitizeDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sanitizeDraft()
              }}
            />
          </Field>
          <Field>
            <label className="flex items-center gap-2">
              <input
                id="frvp-extend-right"
                type="checkbox"
                checked={draft.extendRight}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, extendRight: event.target.checked }))
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
            <FieldDescription>
              Opacity is the Value-Area ceiling; rows outside the value area render at ~25/55
              of it. Default is {FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT}% for both directions.
            </FieldDescription>
            <HistogramStyleFields
              direction="up"
              label="Up volume"
              colorId="frvp-histogram-up-color"
              opacityId="frvp-histogram-up-opacity"
              draft={draft.histogram.up}
              onChange={setHistogram}
            />
            <HistogramStyleFields
              direction="down"
              label="Down volume"
              colorId="frvp-histogram-down-color"
              opacityId="frvp-histogram-down-opacity"
              draft={draft.histogram.down}
              onChange={setHistogram}
            />
          </FieldGroup>
          <LevelLineStyleFields
            kind="poc"
            label="POC line"
            colorId="frvp-poc-color"
            widthId="frvp-poc-width"
            opacityId="frvp-poc-opacity"
            draft={draft.levels.poc}
            onChange={setLevel}
          />
          <LevelLineStyleFields
            kind="vah"
            label="VAH line"
            colorId="frvp-vah-color"
            widthId="frvp-vah-width"
            opacityId="frvp-vah-opacity"
            draft={draft.levels.vah}
            onChange={setLevel}
          />
          <LevelLineStyleFields
            kind="val"
            label="VAL line"
            colorId="frvp-val-color"
            widthId="frvp-val-width"
            opacityId="frvp-val-opacity"
            draft={draft.levels.val}
            onChange={setLevel}
          />
          <p className="text-xs text-muted-foreground">
            Defaults: {DEFAULT_FIXED_RANGE_VP_ROW_COUNT} rows,{' '}
            {DEFAULT_FIXED_RANGE_VP_VALUE_AREA_PERCENT}% value area, extend right on, red dotted
            POC and grey solid VAH/VAL at {DEFAULT_FRVP_LEVEL_LINE_WIDTH}px /{' '}
            {FRVP_LEVEL_DEFAULT_OPACITY_PERCENT}% opacity.
          </p>
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
              instance.id,
              frvpSettingsDraftPatch(initial, sanitizeFrvpSettingsDraft(initial, draft)),
            )
          }
        >
          Save
        </Button>
      </DialogFooter>
    </>
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
  const handleSave = (instanceId: string, patch: FrvpSettingsDraftPatch) => {
    if (patch.rowCount !== undefined) onRowCountChange(instanceId, patch.rowCount)
    if (patch.valueAreaPercent !== undefined) {
      onValueAreaPercentChange(instanceId, patch.valueAreaPercent)
    }
    if (patch.extendRight !== undefined) onExtendRightChange(instanceId, patch.extendRight)
    for (const level of patch.levels) {
      if (level.strokeColor !== undefined) {
        onLevelStrokeColorChange(instanceId, level.kind, level.strokeColor)
      }
      if (level.opacityPercent !== undefined) {
        onLevelStrokeOpacityChange(instanceId, level.kind, level.opacityPercent)
      }
      if (level.lineWidth !== undefined) {
        onLevelLineWidthChange(instanceId, level.kind, level.lineWidth)
      }
      if (level.lineStyle !== undefined) {
        onLevelLineStyleChange(instanceId, level.kind, level.lineStyle)
      }
    }
    for (const histogram of patch.histogram) {
      if (histogram.color !== undefined) {
        onHistogramColorChange(instanceId, histogram.direction, histogram.color)
      }
      if (histogram.opacityPercent !== undefined) {
        onHistogramOpacityChange(instanceId, histogram.direction, histogram.opacityPercent)
      }
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={instance !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false)
      }}
    >
      <DialogContent
        className={CHART_SETTINGS_DIALOG_CONTENT_CLASS}
        overlayClassName={CHART_SETTINGS_DIALOG_OVERLAY_CLASS}
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
          <FixedRangeVolumeProfileSettingsDialogBody
            key={instance.id}
            instance={instance}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
