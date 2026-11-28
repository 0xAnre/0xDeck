/**
 * Canvas renderer for the liquidation ladder.
 *
 * Geometry: one price gutter, one shared magnitude scale, one bar origin. Every
 * bar — red short or green long — is right-aligned on the gutter and grows
 * leftwards, each row's length proportional to the size liquidating at that
 * price and its brightness proportional to the same magnitude. A single top
 * magnitude axis labels that shared leftward scale.
 *
 * This is an independently authored renderer: the reference view is a compiled
 * Svelte + custom WebGL2 application with no published package or licence (see
 * docs/MARKETLENS-LIQUIDATIONS-DEMO.md), so its binaries are not reused. The
 * palette, bar/quantity encoding and hover language are reproduced here; the
 * reference panel places its price axis on the right, while this page is a
 * full-width single-panel adaptation of that language.
 */
import { formatPriceAxis, formatQuantity } from './format.ts'
import {
  barSegments,
  scaleDomain,
  type BarSegment,
  type Layout,
} from './geometry.ts'
import type { Profile } from './model.ts'
import { niceTicks, spanOf } from './view.ts'

export interface Theme {
  canvas: string
  grid: string
  axis: string
  label: string
  labelStrong: string
  longFrom: [number, number, number]
  longTo: [number, number, number]
  shortFrom: [number, number, number]
  shortTo: [number, number, number]
  highlight: string
  highlightText: string
}

/** Palette sampled from the reference view's rendered pixels. */
export const THEME: Theme = {
  canvas: '#070b09',
  grid: '#141b18',
  axis: '#242e29',
  label: '#9ca89e',
  labelStrong: '#f1f7f2',
  longFrom: [20, 66, 32],
  longTo: [58, 176, 86],
  shortFrom: [78, 12, 15],
  shortTo: [198, 44, 46],
  highlight: '#beeb3f',
  highlightText: '#0b1206',
}

const FONT_STACK = '"Inter Variable", Inter, system-ui, sans-serif'

export interface RenderInput {
  layout: Layout
  profile: Profile
  /** Row currently under the pointer, or null. */
  hoverRow: number | null
  dpr: number
  /** No book at all: draw the empty canvas, no axes (they would be meaningless). */
  empty?: boolean
}

export function renderChart(
  canvas: HTMLCanvasElement,
  input: RenderInput,
): void {
  const { layout, profile, hoverRow, dpr } = input
  const width = Math.max(1, Math.floor(layout.width))
  const height = Math.max(1, Math.floor(layout.height))
  const pixelWidth = Math.max(1, Math.round(width * dpr))
  const pixelHeight = Math.max(1, Math.round(height * dpr))
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = THEME.canvas
  ctx.fillRect(0, 0, width, height)
  if (input.empty) return

  const span = spanOf(profile.view)
  const priceTicks = niceTicks(profile.view, 8)
  const domain = scaleDomain(profile.maxLong, profile.maxShort)
  drawGrid(ctx, layout, profile, priceTicks)
  drawBars(ctx, layout, profile, hoverRow, domain)
  drawPriceLabels(ctx, layout, profile, span, priceTicks)
  drawMagnitudeAxis(ctx, layout, domain)
  drawBarOrigin(ctx, layout)
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  profile: Profile,
  ticks: readonly number[],
): void {
  ctx.strokeStyle = THEME.grid
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const price of ticks) {
    const y = priceToRowY(profile, price)
    if (y < layout.plotTop || y > layout.plotBottom) continue
    const snapped = Math.round(y) + 0.5
    ctx.moveTo(layout.anchor - layout.maxBarWidth, snapped)
    ctx.lineTo(layout.anchor, snapped)
  }
  ctx.stroke()
}

/** Vertical rule at the shared bar origin. */
function drawBarOrigin(ctx: CanvasRenderingContext2D, layout: Layout): void {
  ctx.strokeStyle = THEME.axis
  ctx.lineWidth = 1
  ctx.beginPath()
  const x = Math.round(layout.anchor) + 0.5
  ctx.moveTo(x, layout.plotTop)
  ctx.lineTo(x, layout.plotBottom)
  ctx.stroke()
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  profile: Profile,
  hoverRow: number | null,
  domain: number,
): void {
  const { long, short, rowCount, rowHeight, top } = profile
  const barHeight = Math.max(1, rowHeight)

  if (hoverRow !== null && hoverRow >= 0 && hoverRow < rowCount) {
    const guideY = Math.round(profile.top + hoverRow * profile.rowHeight) + 0.5
    ctx.save()
    ctx.globalAlpha = 0.45
    ctx.strokeStyle = THEME.highlight
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(layout.anchor - layout.maxBarWidth, guideY)
    ctx.lineTo(layout.anchor, guideY)
    ctx.stroke()
    ctx.restore()
  }

  for (let row = 0; row < rowCount; row += 1) {
    const y = top + row * rowHeight
    if (y < layout.plotTop - barHeight || y > layout.plotBottom) continue
    const longValue = long[row]
    const shortValue = short[row]
    if (longValue === 0 && shortValue === 0) continue
    const isHover = hoverRow === row
    const segments = barSegments(
      { long: longValue, short: shortValue },
      domain,
      layout,
    )
    for (const segment of segments) {
      ctx.fillStyle = isHover
        ? THEME.highlight
        : segmentColor(segment, domain)
      ctx.fillRect(segment.x, y, segment.width, barHeight)
    }
  }
}

/** Dark-to-bright ramp: the same number drives bar length and intensity. */
function segmentColor(segment: BarSegment, domain: number): string {
  const ratio = domain > 0 ? segment.value / domain : 0
  const [from, to] =
    segment.side === 'long'
      ? [THEME.longFrom, THEME.longTo]
      : [THEME.shortFrom, THEME.shortTo]
  return rampColor(from, to, ratio)
}

function rampColor(
  from: [number, number, number],
  to: [number, number, number],
  ratio: number,
): string {
  const t = Math.min(1, Math.max(0, Math.sqrt(ratio)))
  const r = Math.round(from[0] + (to[0] - from[0]) * t)
  const g = Math.round(from[1] + (to[1] - from[1]) * t)
  const b = Math.round(from[2] + (to[2] - from[2]) * t)
  return `rgb(${r} ${g} ${b})`
}

function drawPriceLabels(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  profile: Profile,
  span: number,
  ticks: readonly number[],
): void {
  const labelWidth = layout.gutter - 10
  ctx.font = `500 10px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const price of ticks) {
    const y = priceToRowY(profile, price)
    if (y < layout.plotTop + 6 || y > layout.plotBottom - 6) continue
    const text = formatPriceAxis(price, span)
    const snapped = Math.round(y) + 0.5
    ctx.fillStyle = THEME.canvas
    ctx.globalAlpha = 0.92
    ctx.fillRect(layout.spine - labelWidth / 2, snapped - 6, labelWidth, 12)
    ctx.globalAlpha = 1
    ctx.fillStyle = THEME.label
    ctx.fillText(text, layout.spine, snapped)
  }
}

/**
 * One axis for the shared leftward scale: 0 at the bar origin, the largest
 * in-view row at the far left. The same numbers apply to both colours.
 */
function drawMagnitudeAxis(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  domain: number,
): void {
  ctx.font = `500 10px ${FONT_STACK}`
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = THEME.axis
  ctx.lineWidth = 1

  const axisY = layout.plotTop - 12
  ctx.beginPath()
  ctx.moveTo(layout.anchor - layout.maxBarWidth, axisY + 8)
  ctx.lineTo(layout.anchor, axisY + 8)
  ctx.stroke()

  for (const value of axisTicks(domain)) {
    const fraction = domain > 0 ? value / domain : 0
    const x = layout.anchor - layout.maxBarWidth * fraction
    ctx.fillStyle = fraction === 0 ? THEME.labelStrong : THEME.label
    ctx.textAlign =
      fraction === 0 ? 'left' : fraction === 1 ? 'right' : 'center'
    ctx.fillText(formatQuantity(value), x, axisY - 2)
  }
}

/** Round 1/2/2.5/5 ticks from 0 to `domain`, always including 0. */
function axisTicks(domain: number): number[] {
  if (!Number.isFinite(domain) || domain <= 0) return [0]
  const ticks = niceTicks({ min: 0, max: domain }, 3).filter(
    (value) => value <= domain,
  )
  if (ticks.length === 0) return [0]
  if (ticks[0] !== 0) ticks.unshift(0)
  return ticks
}

function priceToRowY(profile: Profile, price: number): number {
  const height = Math.max(1, profile.bottom - profile.top)
  const span = spanOf(profile.view)
  return profile.bottom - ((price - profile.view.min) / span) * height
}
