import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { CheckIcon, PlusIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  LINE_CHART_STROKE_STYLE_LABELS,
  LINE_CHART_STROKE_STYLES,
  isLineChartStrokeStyle,
  type LineChartStrokeStyle,
} from '@/market/lineChartStroke'
import {
  COLOR_PICKER_COLUMNS,
  COLOR_PICKER_CONTENT_STYLE,
  COLOR_PICKER_CUSTOM_HEX_EXAMPLE,
  COLOR_PICKER_GRID_STYLE,
  COLOR_PICKER_LINE_PREVIEW_HEIGHT_PX,
  COLOR_PICKER_LINE_PREVIEW_WIDTH_PX,
  COLOR_PICKER_ROWS,
  COLOR_PICKER_SWATCH_STYLE,
  colorPickerLinePreview,
  colorPickerLineStyleToggleValue,
  colorPickerNextSwatchIndex,
  colorPickerPaletteMatch,
  colorPickerSwatchLabel,
  colorPickerSwatchUsesDarkCheck,
  normalizeColorPickerHexInput,
  normalizeColorPickerOpacityPercent,
} from '@/widgetSettings/colorPickerPalette'

type ColorOpacityFieldProps = {
  /** Base id for the color trigger; the slider gets `${id}-opacity` by default. */
  id: string
  /** Explicit slider id when a dialog needs a stable legacy id. */
  opacityId?: string
  label: string
  color: string
  opacityPercent: number
  onColorChange: (color: string) => void
  onOpacityChange: (opacityPercent: number) => void
  className?: string
  /**
   * Current stroke style, shown as a `Line` / `Dot` row at the bottom of the
   * popover. The row only renders when `onLineStyleChange` is passed, so
   * fill-only color fields (rectangle fill, FRVP histogram, VWAP fills, info
   * box background/text) keep a color + opacity popover without a style row.
   */
  lineStyle?: LineChartStrokeStyle
  /**
   * Mixed/indeterminate style state: the row renders with nothing selected
   * instead of falsely claiming the first series' style.
   */
  lineStyleMixed?: boolean
  /** Opt-in line-style row; omitted for fill-only controls. Receives `'solid' | 'dotted'`. */
  onLineStyleChange?: (style: LineChartStrokeStyle) => void
}

/**
 * Transparency checkerboard behind the current color; chrome uses theme tokens.
 *
 * Uses the raw per-theme custom properties (`--muted`, `--popover`) that every
 * `[data-theme]` block in `index.css` defines, rather than the `--color-*`
 * aliases that `@theme inline` only emits for utilities actually generated.
 */
const CHECKERBOARD_STYLE: CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(var(--muted) 0% 25%, var(--popover) 0% 50%)',
  backgroundSize: '6px 6px',
}

/**
 * Solid or dotted stroke preview for the in-popover line-style toggles.
 *
 * Painted in the field's current color and opacity so the two options read as a
 * preview of the line they style, and dotted uses the renderer's own dash
 * pattern (`lineChartStrokeDashPattern('dotted')` = `[2, 3]`).
 */
function LineStylePreview({
  style,
  color,
  opacityPercent,
}: {
  style: LineChartStrokeStyle
  color: string
  opacityPercent: number
}) {
  const preview = colorPickerLinePreview(style)

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${COLOR_PICKER_LINE_PREVIEW_WIDTH_PX} ${COLOR_PICKER_LINE_PREVIEW_HEIGHT_PX}`}
      // The shared button styles size every descendant `<svg>` like an icon, so
      // the preview geometry is set inline from the palette constants instead of
      // with a size class.
      style={{
        width: `${COLOR_PICKER_LINE_PREVIEW_WIDTH_PX}px`,
        height: `${COLOR_PICKER_LINE_PREVIEW_HEIGHT_PX}px`,
      }}
      className="block"
    >
      <line
        x1={preview.x1}
        y1={preview.y1}
        x2={preview.x2}
        y2={preview.y2}
        stroke={color}
        strokeOpacity={opacityPercent / 100}
        strokeWidth={preview.strokeWidth}
        strokeDasharray={preview.strokeDasharray}
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Shared `Color + Opacity` field used by every BTC Perp style dialog.
 *
 * The trigger opens a compact TradingView-inspired palette popover that owns
 * the custom HEX input and the 0–100 opacity slider. Props and emitted values
 * stay identical to the previous native color input: `#RRGGBB` and an integer
 * percentage, so chart style pipelines need no changes.
 *
 * Stroke controls may additionally opt into a `Line` / `Dot` row at the bottom
 * of the popover (`lineStyle` + `onLineStyleChange`); fill-only controls omit
 * both.
 */
export function ColorOpacityField({
  id,
  opacityId,
  label,
  color,
  opacityPercent,
  onColorChange,
  onOpacityChange,
  className,
  lineStyle,
  lineStyleMixed = false,
  onLineStyleChange,
}: ColorOpacityFieldProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [customOpen, setCustomOpen] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [customInvalid, setCustomInvalid] = useState(false)
  const swatchRefs = useRef<Array<HTMLButtonElement | null>>([])

  const percent = normalizeColorPickerOpacityPercent(opacityPercent)
  const sliderId = opacityId ?? `${id}-opacity`
  const sliderLabelId = `${sliderId}-label`
  const lineStyleHintId = `${id}-line-style-hint`
  const customInputId = `${id}-custom`
  const currentHex = normalizeColorPickerHexInput(color) ?? color
  const paletteMatch = colorPickerPaletteMatch(currentHex)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) return

    const match = colorPickerPaletteMatch(currentHex)
    setActiveIndex(match ? match.row * COLOR_PICKER_COLUMNS + match.column : 0)
    setCustomInput(normalizeColorPickerHexInput(currentHex) ?? currentHex)
    setCustomInvalid(false)
  }

  function commitCustomInput(value: string) {
    const normalized = normalizeColorPickerHexInput(value)
    if (normalized === null) {
      setCustomInvalid(true)
      return
    }

    setCustomInvalid(false)
    setCustomInput(normalized)
    if (normalized !== currentHex) onColorChange(normalized)
  }

  function handleSwatchKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = colorPickerNextSwatchIndex(index, event.key)
    if (nextIndex === null) return

    event.preventDefault()
    setActiveIndex(nextIndex)
    swatchRefs.current[nextIndex]?.focus()
  }

  return (
    <Field className={cn('gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              size="lg"
              aria-label={`${label} color`}
              aria-haspopup="dialog"
              className="h-8 w-12 shrink-0 justify-center p-1"
            >
              <span
                aria-hidden="true"
                className="relative block size-6 overflow-hidden rounded-[3px] border border-border"
              >
                <span className="absolute inset-0" style={CHECKERBOARD_STYLE} />
                <span
                  className="absolute inset-0"
                  style={{ backgroundColor: currentHex, opacity: percent / 100 }}
                />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            collisionPadding={12}
            sticky="always"
            // Explicit palette-derived width, not `w-fit`: the popover's first child
            // is a `@container/field-group` (`container-type: inline-size`) which
            // contributes no intrinsic inline size, so `fit-content` collapsed the
            // content to its padding and clipped the palette. The width, viewport cap
            // and padding all come from `COLOR_PICKER_CONTENT_STYLE` (single source
            // of truth with the grid geometry); Radix `collisionPadding`/flip/shift
            // handle the rest.
            style={COLOR_PICKER_CONTENT_STYLE}
            className="max-h-[min(70vh,var(--radix-popover-content-available-height))] gap-0 overflow-y-auto overscroll-contain"
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              const match = colorPickerPaletteMatch(currentHex)
              const index = match ? match.row * COLOR_PICKER_COLUMNS + match.column : 0
              setActiveIndex(index)
              swatchRefs.current[index]?.focus()
            }}
            aria-label={`${label} color picker`}
          >
            <FieldGroup className="gap-2">
              <div
                role="grid"
                aria-label={`${label} color palette`}
                className="flex flex-col gap-1"
              >
                {COLOR_PICKER_ROWS.map((row, rowIndex) => (
                  <div
                    key={row.id}
                    role="row"
                    // Tracks never shrink below one swatch, so the grid can't be
                    // squeezed into the collapsed width that caused the clipping.
                    className="grid"
                    style={COLOR_PICKER_GRID_STYLE}
                  >
                    {row.colors.map((hex, columnIndex) => {
                      const index = rowIndex * COLOR_PICKER_COLUMNS + columnIndex
                      const selected =
                        paletteMatch !== null &&
                        paletteMatch.row === rowIndex &&
                        paletteMatch.column === columnIndex
                      return (
                        <Button
                          key={hex}
                          ref={(node) => {
                            swatchRefs.current[index] = node
                          }}
                          type="button"
                          variant="outline"
                          // Cell size comes from `COLOR_PICKER_SWATCH_STYLE` (inline),
                          // not from this size variant, so the palette constants own
                          // the rendered 24px track; `icon-sm` only supplies the
                          // component-owned check-glyph scale.
                          size="icon-sm"
                          role="gridcell"
                          aria-label={colorPickerSwatchLabel(row, columnIndex)}
                          aria-selected={selected}
                          tabIndex={activeIndex === index ? 0 : -1}
                          className={cn(
                            'rounded-[4px]',
                            // Hover cue: a chrome-only ring, because the inline
                            // `backgroundColor` in `style` defeats `hover:bg-input/50`
                            // from the outline variant. The swatch color itself stays
                            // untouched, so palette semantics do not change.
                            'hover:ring-2 hover:ring-ring/40',
                            selected && 'ring-2 ring-ring ring-offset-1 ring-offset-popover',
                            // Button's base `focus-visible:ring-ring/30` (and `hover`
                            // above) sort after the plain `ring-ring`, so re-assert the
                            // selection ring at full opacity instead of dropping it to
                            // 30% / 40% while focused or hovered.
                            selected && 'hover:ring-ring/100 focus-visible:ring-ring/100',
                          )}
                          style={{ ...COLOR_PICKER_SWATCH_STYLE, backgroundColor: hex }}
                          onClick={() => {
                            setActiveIndex(index)
                            setCustomInvalid(false)
                            onColorChange(hex)
                          }}
                          onKeyDown={(event) => handleSwatchKeyDown(event, index)}
                        >
                          {selected ? (
                            <CheckIcon
                              aria-hidden="true"
                              className={
                                colorPickerSwatchUsesDarkCheck(hex)
                                  ? 'text-background'
                                  : 'text-foreground'
                              }
                            />
                          ) : null}
                        </Button>
                      )
                    })}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {paletteMatch === null ? (
                  <Badge
                    variant="outline"
                    aria-current="true"
                    className="gap-1.5 px-1.5 text-xs font-medium uppercase"
                  >
                    <span
                      aria-hidden="true"
                      className="size-3 rounded-[2px] border border-border"
                      style={{ backgroundColor: currentHex }}
                    />
                    {currentHex}
                    <CheckIcon aria-hidden="true" />
                  </Badge>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-expanded={customOpen}
                  onClick={() => setCustomOpen((current) => !current)}
                >
                  <PlusIcon data-icon="inline-start" />
                  Custom HEX
                </Button>
              </div>

              {customOpen ? (
                <form
                  className="flex flex-col gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    commitCustomInput(customInput)
                  }}
                >
                  <Field data-invalid={customInvalid || undefined} className="gap-1.5">
                    <FieldLabel htmlFor={customInputId}>Custom HEX</FieldLabel>
                    <div className="flex items-center gap-1.5">
                      {/* No `maxLength`: `normalizeColorPickerHexInput` trims surrounding
                          whitespace, so a pasted `  d15F5b  ` must reach validation intact. */}
                      <Input
                        id={customInputId}
                        value={customInput}
                        placeholder={COLOR_PICKER_CUSTOM_HEX_EXAMPLE}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={customInvalid || undefined}
                        onChange={(event) => {
                          setCustomInput(event.target.value)
                          if (customInvalid) setCustomInvalid(false)
                        }}
                        onBlur={() => commitCustomInput(customInput)}
                      />
                      <Button type="submit" variant="secondary" size="xs">
                        Set
                      </Button>
                    </div>
                    {customInvalid ? (
                      <FieldError>{`Enter a 6-digit hex color, e.g. ${COLOR_PICKER_CUSTOM_HEX_EXAMPLE}.`}</FieldError>
                    ) : null}
                  </Field>
                </form>
              ) : null}

              <Field className="gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  {/* `aria-labelledby` wins over `aria-label`, so the visible text is
                      hidden from the accessible name and the sliders are announced
                      precisely (e.g. "Rolling VWAP line opacity") instead of just
                      "Opacity" in each of the field instances. */}
                  <FieldLabel id={sliderLabelId}>
                    <span aria-hidden="true">Opacity</span>
                    <span className="sr-only">{`${label} opacity`}</span>
                  </FieldLabel>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="relative block size-6 shrink-0 overflow-hidden rounded-[3px] border border-border"
                  >
                    <span className="absolute inset-0" style={CHECKERBOARD_STYLE} />
                    <span
                      className="absolute inset-0"
                      style={{ backgroundColor: currentHex, opacity: percent / 100 }}
                    />
                  </span>
                  <Slider
                    id={sliderId}
                    aria-labelledby={sliderLabelId}
                    aria-label={`${label} opacity`}
                    min={0}
                    max={100}
                    step={1}
                    value={[percent]}
                    onValueChange={(value) => {
                      const next = value[0]
                      if (next === undefined || !Number.isFinite(next)) return
                      onOpacityChange(normalizeColorPickerOpacityPercent(next))
                    }}
                    className="flex-1"
                  />
                </div>
              </Field>

              {onLineStyleChange ? (
                <>
                  {/* Screen-reader-only mixed-state hint: the row stays unpressed, so
                      the indeterminate state needs a text alternative. */}
                  {lineStyleMixed ? (
                    <span id={lineStyleHintId} className="sr-only">
                      Multiple line styles on chart
                    </span>
                  ) : null}
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    aria-label="Line style"
                    aria-describedby={lineStyleMixed ? lineStyleHintId : undefined}
                    className="grid w-full grid-cols-2"
                    value={colorPickerLineStyleToggleValue(lineStyle, lineStyleMixed)}
                    onValueChange={(value) => {
                      // A radio-style group reports `''` when the checked item is
                      // re-clicked; keep the current style instead of clearing it.
                      if (!isLineChartStrokeStyle(value)) return
                      onLineStyleChange(value)
                    }}
                  >
                    {LINE_CHART_STROKE_STYLES.map((style) => (
                      <ToggleGroupItem
                        key={style}
                        value={style}
                        aria-label={LINE_CHART_STROKE_STYLE_LABELS[style]}
                        title={LINE_CHART_STROKE_STYLE_LABELS[style]}
                        className="w-full"
                      >
                        <LineStylePreview
                          style={style}
                          color={currentHex}
                          opacityPercent={percent}
                        />
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </>
              ) : null}
            </FieldGroup>
          </PopoverContent>
        </Popover>
      </div>
    </Field>
  )
}
