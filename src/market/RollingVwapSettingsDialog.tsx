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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAX_ROLLING_VWAP_BAND_PERCENTAGE, type RollingVwapBandType } from '@/market/rollingVwap'
import {
  sanitizeRollingVwapSettings,
  withRollingVwapBandType,
  type RollingVwapSettings,
} from '@/market/rollingVwapSettings'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'

type RollingVwapSettingsDialogProps = {
  open: boolean
  instanceLabel?: string
  savedSettings: RollingVwapSettings
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onSave: (settings: RollingVwapSettings) => void
}

function RollingVwapSettingsDialogBody({
  instanceLabel,
  savedSettings,
  onClose,
  onSave,
}: {
  instanceLabel?: string
  savedSettings: RollingVwapSettings
  onClose: () => void
  onSave: (settings: RollingVwapSettings) => void
}) {
  const [draft, setDraft] = useState<RollingVwapSettings>(() =>
    sanitizeRollingVwapSettings(savedSettings),
  )

  const fixedDisabled = !draft.fixedTimePeriod.useFixedTimePeriod

  const handleSave = () => {
    onSave(sanitizeRollingVwapSettings(draft))
    onClose()
  }

  return (
    <>
        <DialogHeader className="shrink-0">
          <DialogTitle>Rolling VWAP settings</DialogTitle>
          <DialogDescription>
            {instanceLabel ?? 'Rolling VWAP overlay presentation'}
          </DialogDescription>
        </DialogHeader>

        <div className={`${CHART_SETTINGS_DIALOG_BODY_CLASS} text-xs`}>
          <section className="space-y-2">
            <p className="font-medium text-foreground">Time period</p>
            <Field orientation="horizontal">
              <input
                id="rolling-vwap-fixed-time-period"
                type="checkbox"
                checked={draft.fixedTimePeriod.useFixedTimePeriod}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    fixedTimePeriod: {
                      ...current.fixedTimePeriod,
                      useFixedTimePeriod: event.target.checked,
                    },
                  }))
                }
              />
              <FieldLabel htmlFor="rolling-vwap-fixed-time-period">
                Use a fixed time period
              </FieldLabel>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field>
                <FieldLabel htmlFor="rolling-vwap-fixed-days">Days</FieldLabel>
                <Input
                  id="rolling-vwap-fixed-days"
                  type="number"
                  min={0}
                  disabled={fixedDisabled}
                  value={draft.fixedTimePeriod.days}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      fixedTimePeriod: {
                        ...current.fixedTimePeriod,
                        days: Number(event.target.value),
                      },
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rolling-vwap-fixed-hours">Hours</FieldLabel>
                <Input
                  id="rolling-vwap-fixed-hours"
                  type="number"
                  min={0}
                  max={23}
                  disabled={fixedDisabled}
                  value={draft.fixedTimePeriod.hours}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      fixedTimePeriod: {
                        ...current.fixedTimePeriod,
                        hours: Number(event.target.value),
                      },
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rolling-vwap-fixed-minutes">Minutes</FieldLabel>
                <Input
                  id="rolling-vwap-fixed-minutes"
                  type="number"
                  min={0}
                  max={59}
                  disabled={fixedDisabled}
                  value={draft.fixedTimePeriod.minutes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      fixedTimePeriod: {
                        ...current.fixedTimePeriod,
                        minutes: Number(event.target.value),
                      },
                    }))
                  }
                />
              </Field>
            </div>
          </section>

          <section className="space-y-2">
            <p className="font-medium text-foreground">Minimum window size</p>
            <Field>
              <FieldLabel htmlFor="rolling-vwap-min-bars">Bars</FieldLabel>
              <Input
                id="rolling-vwap-min-bars"
                type="number"
                min={1}
                value={draft.minBars}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    minBars: Number(event.target.value),
                  }))
                }
              />
            </Field>
          </section>

          <section className="space-y-2">
            <p className="font-medium text-foreground">Line</p>
            <LineChartStrokeSelectFields
              widthId="rolling-vwap-line-width"
              lineWidth={draft.lineWidth}
              onLineWidthChange={(lineWidth) =>
                setDraft((current) => ({ ...current, lineWidth }))
              }
            />
          </section>

          <section className="space-y-2">
            <p className="font-medium text-foreground">Center line</p>
            <ColorOpacityField
              id="rolling-vwap-line-color"
              label="Color"
              color={draft.lineColor}
              opacityPercent={draft.lineOpacity}
              lineStyle={draft.lineStyle}
              onColorChange={(lineColor) =>
                setDraft((current) => ({ ...current, lineColor }))
              }
              onOpacityChange={(lineOpacity) =>
                setDraft((current) => ({ ...current, lineOpacity }))
              }
              onLineStyleChange={(lineStyle) =>
                setDraft((current) => ({
                  ...current,
                  lineStyle,
                }))
              }
            />
          </section>

          <section className="space-y-3">
            <p className="font-medium text-foreground">Bands</p>
            <Field>
              <FieldLabel htmlFor="rolling-vwap-band-type">Band type</FieldLabel>
              <Select
                value={draft.bandType}
                onValueChange={(value) =>
                  setDraft((current) =>
                    withRollingVwapBandType(current, value as RollingVwapBandType),
                  )
                }
              >
                <SelectTrigger id="rolling-vwap-band-type" className="w-full" size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="stdev">Standard deviation</SelectItem>
                    <SelectItem value="percentage">Percentage of VWAP</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <p className="text-muted-foreground">
              {draft.bandType === 'percentage'
                ? 'Upper = VWAP × (1 + p/100), lower = VWAP × (1 − p/100). A 0 distance hides that band pair.'
                : 'Upper = VWAP + σ × multiplier, lower = VWAP − σ × multiplier. A 0 multiplier hides that band pair.'}
            </p>
            <ColorOpacityField
              id="rolling-vwap-fill-color"
              opacityId="rolling-vwap-fill-opacity"
              label="Background"
              color={draft.fillColor}
              opacityPercent={draft.fillOpacity}
              onColorChange={(fillColor) =>
                setDraft((current) => ({ ...current, fillColor }))
              }
              onOpacityChange={(fillOpacity) =>
                setDraft((current) => ({ ...current, fillOpacity }))
              }
            />
            {(['Band 1', 'Band 2', 'Band 3'] as const).map((label, index) => {
              const bandKey = `band${index + 1}` as 'band1' | 'band2' | 'band3'
              const multKey = `multiplier${index + 1}` as keyof RollingVwapSettings['multipliers']
              const percentageMode = draft.bandType === 'percentage'
              // One selected offset control per band: the label, unit and value
              // source follow the band type, while the other mode's parameters
              // stay in the draft untouched for a later switch back.
              const distanceId = `rolling-vwap-${bandKey}-${percentageMode ? 'percentage' : 'multiplier'}`
              const distanceValue = percentageMode
                ? draft.bandPercentages[bandKey]
                : draft.multipliers[multKey]
              return (
                <div key={bandKey} className="space-y-1">
                  <div className="grid grid-cols-[4rem_1fr] items-end gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <Field>
                      <FieldLabel htmlFor={distanceId}>
                        {percentageMode ? 'Percentage (%)' : 'Multiplier (σ)'}
                      </FieldLabel>
                      <Input
                        id={distanceId}
                        type="number"
                        min={0}
                        max={percentageMode ? MAX_ROLLING_VWAP_BAND_PERCENTAGE : undefined}
                        step={percentageMode ? 0.1 : 0.5}
                        value={distanceValue}
                        onChange={(event) =>
                          setDraft((current) =>
                            percentageMode
                              ? {
                                  ...current,
                                  bandPercentages: {
                                    ...current.bandPercentages,
                                    [bandKey]: Number(event.target.value),
                                  },
                                }
                              : {
                                  ...current,
                                  multipliers: {
                                    ...current.multipliers,
                                    [multKey]: Number(event.target.value),
                                  },
                                },
                          )
                        }
                      />
                    </Field>
                  </div>
                  <ColorOpacityField
                    id={`rolling-vwap-${bandKey}-color`}
                    label="Color"
                    color={draft.bandColors[bandKey]}
                    opacityPercent={draft.bandOpacities[bandKey]}
                    lineStyle={draft.bandLineStyles[bandKey]}
                    onColorChange={(color) =>
                      setDraft((current) => ({
                        ...current,
                        bandColors: { ...current.bandColors, [bandKey]: color },
                      }))
                    }
                    onOpacityChange={(opacity) =>
                      setDraft((current) => ({
                        ...current,
                        bandOpacities: { ...current.bandOpacities, [bandKey]: opacity },
                      }))
                    }
                    onLineStyleChange={(lineStyle) =>
                      setDraft((current) => ({
                        ...current,
                        bandLineStyles: { ...current.bandLineStyles, [bandKey]: lineStyle },
                      }))
                    }
                  />
                  <LineChartStrokeSelectFields
                    widthId={`rolling-vwap-${bandKey}-width`}
                    lineWidth={draft.bandLineWidths[bandKey]}
                    onLineWidthChange={(lineWidth) =>
                      setDraft((current) => ({
                        ...current,
                        bandLineWidths: { ...current.bandLineWidths, [bandKey]: lineWidth },
                      }))
                    }
                  />
                </div>
              )
            })}
          </section>
        </div>

      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave}>
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

export function RollingVwapSettingsDialog({
  open,
  instanceLabel,
  savedSettings,
  returnFocusId,
  onOpenChange,
  onSave,
}: RollingVwapSettingsDialogProps) {
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
        {open ? (
          <RollingVwapSettingsDialogBody
            instanceLabel={instanceLabel}
            savedSettings={savedSettings}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
