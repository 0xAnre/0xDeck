import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  sanitizeRollingVwapSettings,
  type RollingVwapSettings,
} from '@/market/rollingVwapSettings'

const inputClassName =
  'h-8 w-full rounded-md border border-input bg-input/20 px-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30'

type RollingVwapSettingsDialogProps = {
  open: boolean
  savedSettings: RollingVwapSettings
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
        <DialogHeader>
          <DialogTitle>Rolling VWAP settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-xs">
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

          <section className="space-y-3">
            <p className="font-medium text-foreground">Deviation bands</p>
            {(['Band 1', 'Band 2', 'Band 3'] as const).map((label, index) => {
              const bandKey = `band${index + 1}` as 'band1' | 'band2' | 'band3'
              const multKey = `multiplier${index + 1}` as keyof RollingVwapSettings['multipliers']
              return (
                <div key={bandKey} className="grid grid-cols-[4rem_1fr_5rem] items-end gap-2">
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
                  <label className="space-y-1">
                    <span className="text-muted-foreground">Color</span>
                    <input
                      type="color"
                      className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                      value={draft.bandColors[bandKey]}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          bandColors: {
                            ...current.bandColors,
                            [bandKey]: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              )
            })}
          </section>
        </div>

      <DialogFooter>
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
  onOpenChange,
  onSave,
}: RollingVwapSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClick={(event) => event.stopPropagation()}>
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
