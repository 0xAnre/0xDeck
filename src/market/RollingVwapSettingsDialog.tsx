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
  sanitizeRollingVwapSettings,
  type RollingVwapSettings,
} from '@/market/rollingVwapSettings'
import { ColorOpacityField } from '@/widgetSettings/ColorOpacityField'
import { LineChartStrokeSelectFields } from '@/widgetSettings/LineChartStrokeSelectFields'
import {
  CHART_SETTINGS_DIALOG_BODY_CLASS,
  CHART_SETTINGS_DIALOG_CONTENT_CLASS,
  CHART_SETTINGS_DIALOG_OVERLAY_CLASS,
} from '@/widgetSettings/chartSettingsDialogLayout'

const inputClassName =
  'h-8 w-full rounded-md border border-input bg-input/20 px-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30'

type RollingVwapSettingsDialogProps = {
  open: boolean
  savedSettings: RollingVwapSettings
  returnFocusId: string
  onOpenChange: (open: boolean) => void
  onSave: (settings: RollingVwapSettings) => void
}

function RollingVwapSettingsDialogBody({
  savedSettings,
  onClose,
  onSave,
}: {
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
          <DialogDescription>Rolling VWAP overlay presentation</DialogDescription>
        </DialogHeader>

        <div className={`${CHART_SETTINGS_DIALOG_BODY_CLASS} text-xs`}>
          <section className="space-y-2">
            <p className="font-medium text-foreground">Time period</p>
            <label className="flex items-center gap-2">
              <input
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
              <span>Use a fixed time period</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground">Days</span>
                <input
                  type="number"
                  min={0}
                  className={inputClassName}
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
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">Hours</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  className={inputClassName}
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
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">Minutes</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  className={inputClassName}
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
              </label>
            </div>
          </section>

          <section className="space-y-2">
            <p className="font-medium text-foreground">Minimum window size</p>
            <label className="space-y-1">
              <span className="text-muted-foreground">Bars</span>
              <input
                type="number"
                min={1}
                className={inputClassName}
                value={draft.minBars}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    minBars: Number(event.target.value),
                  }))
                }
              />
            </label>
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
            <p className="font-medium text-foreground">Deviation bands</p>
            {(['Band 1', 'Band 2', 'Band 3'] as const).map((label, index) => {
              const bandKey = `band${index + 1}` as 'band1' | 'band2' | 'band3'
              const multKey = `multiplier${index + 1}` as keyof RollingVwapSettings['multipliers']
              return (
                <div key={bandKey} className="space-y-1">
                  <div className="grid grid-cols-[4rem_1fr] items-end gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <label className="space-y-1">
                      <span className="text-muted-foreground">Multiplier</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className={inputClassName}
                        value={draft.multipliers[multKey]}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            multipliers: {
                              ...current.multipliers,
                              [multKey]: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <ColorOpacityField
                    id={`rolling-vwap-${bandKey}-color`}
                    label="Color"
                    color={draft.bandColors[bandKey]}
                    opacityPercent={draft.bandOpacities[bandKey]}
                    // Deviation bands are stroke lines, but this overlay stores a single
                    // center-line `lineStyle` and always renders band lines solid, so a
                    // style row here would edit the center line only and mislead.
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
                  />
                </div>
              )
            })}
          </section>

          <section className="space-y-2">
            <p className="font-medium text-foreground">Info box</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.infoBox.visible}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    infoBox: { ...current.infoBox, visible: event.target.checked },
                  }))
                }
              />
              <span>Visible</span>
            </label>
            <ColorOpacityField
              id="rolling-vwap-info-box-background"
              label="Background color"
              color={draft.infoBox.backgroundColor}
              opacityPercent={draft.infoBox.backgroundColorOpacity}
              onColorChange={(backgroundColor) =>
                setDraft((current) => ({
                  ...current,
                  infoBox: { ...current.infoBox, backgroundColor },
                }))
              }
              onOpacityChange={(backgroundColorOpacity) =>
                setDraft((current) => ({
                  ...current,
                  infoBox: { ...current.infoBox, backgroundColorOpacity },
                }))
              }
            />
            <ColorOpacityField
              id="rolling-vwap-info-box-text"
              label="Text color"
              color={draft.infoBox.textColor}
              opacityPercent={draft.infoBox.textColorOpacity}
              onColorChange={(textColor) =>
                setDraft((current) => ({
                  ...current,
                  infoBox: { ...current.infoBox, textColor },
                }))
              }
              onOpacityChange={(textColorOpacity) =>
                setDraft((current) => ({
                  ...current,
                  infoBox: { ...current.infoBox, textColorOpacity },
                }))
              }
            />
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
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(returnFocusId)?.focus()
        }}
      >
        {open ? (
          <RollingVwapSettingsDialogBody
            savedSettings={savedSettings}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
