/**
 * Canvas renderer for the liquidation ladder.
 *
 * Layout: a central price gutter runs the full plot height, shorts (red) grow
 * leftwards out of it and longs (green) grow rightwards, each row's bar length
 * proportional to the position size liquidating at that price and its
 * brightness proportional to the same magnitude. Magnitude axes sit at the top
 * (shorts, mirrored like the reference order-book top axis) and at the bottom
 * (longs).
 *
 * This is an independently authored renderer: the reference view is a compiled
 * Svelte + custom WebGL2 application with no published package or licence (see
 * docs/MARKETLENS-LIQUIDATIONS-DEMO.md), so its binaries cannot be reused. The
 * visual language (palette, axis placement, bar/price/quantity encoding) is
 * reproduced here; the drawing is plain Canvas 2D.
 */
import { formatPriceAxis, formatQuantity } from './format.ts'
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

export interface Layout {
  width: number
  height: number
  plotTop: number
  plotBottom: number
  /** Vertical centre line that shorts grow left from and longs right from. */
  spine: number
  /** Width of the central price-label gutter. */
  gutter: number
  /** Shorts are right-aligned here. */
  barLeftEnd: number
  /** Longs are left-aligned here. */
  barRightStart: number
  maxBarWidth: number
}

const PAD_X = 14
const PAD_TOP = 26
const PAD_BOTTOM = 28
const GUTTER = 86

export function computeLayout(width: number, height: number): Layout {
  const plotTop = PAD_TOP
  const plotBottom = Math.max(plotTop + 40, height - PAD_BOTTOM)
  const spine = width / 2
  const barLeftEnd = spine - GUTTER / 2
  const barRightStart = spine + GUTTER / 2
  const maxBarWidth = Math.max(
    16,
    Math.min(barLeftEnd - PAD_X, width - PAD_X - barRightStart),
  )
  return {
    width,
    height,
    plotTop,
    plotBottom,
    spine,
    gutter: GUTTER,
    barLeftEnd,
    barRightStart,
    maxBarWidth,
  }
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
  drawGrid(ctx, layout, profile, priceTicks)
  drawBars(ctx, layout, profile, hoverRow)
  drawPriceLabels(ctx, layout, profile, span, priceTicks)
  drawMagnitudeAxes(ctx, layout, profile)
  drawCentreLine(ctx, layout)
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
    ctx.moveTo(PAD_X, snapped)
    ctx.lineTo(layout.width - PAD_X, snapped)
  }
  ctx.stroke()
}

function drawCentreLine(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void {
  ctx.strokeStyle = THEME.axis
  ctx.lineWidth = 1
  ctx.beginPath()
  const x = Math.round(layout.spine) + 0.5
  ctx.moveTo(x, layout.plotTop)
  ctx.lineTo(x, layout.plotBottom)
  ctx.stroke()
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  profile: Profile,
  hoverRow: number | null,
): void {
  if (hoverRow !== null && hoverRow >= 0 && hoverRow < profile.rowCount) {
    const guideY = Math.round(profile.top + hoverRow * profile.rowHeight) + 0.5
    ctx.save()
    ctx.globalAlpha = 0.45
    ctx.strokeStyle = THEME.highlight
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_X, guideY)
    ctx.lineTo(layout.width - PAD_X, guideY)
    ctx.stroke()
    ctx.restore()
  }
  const { long, short, maxLong, maxShort, rowCount, rowHeight, top } = profile
  const leftEnd = layout.barLeftEnd
  const rightStart = layout.barRightStart
  const maxWidth = layout.maxBarWidth
  const barHeight = Math.max(1, rowHeight)

  for (let row = 0; row < rowCount; row += 1) {
    const y = top + row * rowHeight
    if (y < layout.plotTop - barHeight || y > layout.plotBottom) continue
    const isHover = hoverRow === row
    const longValue = long[row]
    const shortValue = short[row]
    if (longValue === 0 && shortValue === 0) continue

    if (shortValue > 0) {
      const ratio = maxShort > 0 ? shortValue / maxShort : 0
      const width = Math.max(1, ratio * maxWidth)
      ctx.fillStyle = isHover
        ? THEME.highlight
        : rampColor(THEME.shortFrom, THEME.shortTo, ratio)
      ctx.fillRect(leftEnd - width, y, width, barHeight)
    }
    if (longValue > 0) {
      const ratio = maxLong > 0 ? longValue / maxLong : 0
      const width = Math.max(1, ratio * maxWidth)
      ctx.fillStyle = isHover
        ? THEME.highlight
        : rampColor(THEME.longFrom, THEME.longTo, ratio)
      ctx.fillRect(rightStart, y, width, barHeight)
    }
  }
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

function drawMagnitudeAxes(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  profile: Profile,
): void {
  ctx.font = `500 10px ${FONT_STACK}`
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = THEME.axis
  ctx.lineWidth = 1

  // Top axis: shorts, mirrored (0 at the price gutter, growing leftwards).
  const topY = layout.plotTop - 12
  ctx.beginPath()
  ctx.moveTo(layout.barLeftEnd - layout.maxBarWidth, topY + 8)
  ctx.lineTo(layout.barLeftEnd, topY + 8)
  ctx.stroke()
  for (const value of magnitudeTicks(profile.maxShort)) {
    const fraction = profile.maxShort > 0 ? value / profile.maxShort : 0
    const x = layout.barLeftEnd - layout.maxBarWidth * fraction
    ctx.fillStyle = THEME.label
    ctx.textAlign = fraction === 0 ? 'left' : fraction === 1 ? 'right' : 'center'
    ctx.fillText(formatQuantity(value), x, topY - 2)
  }

  // Bottom axis: longs, 0 at the price gutter, growing rightwards.
  const bottomY = layout.plotBottom + 12
  ctx.beginPath()
  ctx.moveTo(layout.barRightStart, bottomY - 8)
  ctx.lineTo(layout.barRightStart + layout.maxBarWidth, bottomY - 8)
  ctx.stroke()
  for (const value of magnitudeTicks(profile.maxLong)) {
    const fraction = profile.maxLong > 0 ? value / profile.maxLong : 0
    const x = layout.barRightStart + layout.maxBarWidth * fraction
    ctx.fillStyle = THEME.label
    ctx.textAlign = fraction === 0 ? 'left' : fraction === 1 ? 'right' : 'center'
    ctx.fillText(formatQuantity(value), x, bottomY + 2)
  }
}

/** Round 1/2/2.5/5 ticks from 0 up to `max`, always including 0. */
function magnitudeTicks(max: number): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0]
  const ticks = niceTicks({ min: 0, max }, 3).filter((value) => value <= max)
  if (ticks.length === 0) return [0]
  if (ticks[0] !== 0) ticks.unshift(0)
  return ticks
}

function priceToRowY(profile: Profile, price: number): number {
  const height = Math.max(1, profile.bottom - profile.top)
  const span = spanOf(profile.view)
  return profile.bottom - ((price - profile.view.min) / span) * height
}

/** Dark-to-bright ramp: the same number drives bar length and intensity. */
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
