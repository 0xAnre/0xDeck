import { rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'
import {
  isLineChartHexColor,
  isLineChartStrokeStyle,
  isLineChartStrokeWidth,
  lineChartStrokeDashPattern,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from './lineChartStroke.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileDrawStyleInput } from './fixedRangeVolumeProfileRenderGeometry.ts'
import {
  FRVP_POC_LINE_STROKE_OPACITY,
  readFrvpPocLineColorInputHex,
  readFrvpPocLineStrokeStyle,
} from './frvpLevelLineColors.ts'

export type FrvpLevelLineKind = 'poc' | 'vah' | 'val'

export const FRVP_VAH_VAL_DEFAULT_HEX = '#a0a0a0'
export const FRVP_VAH_VAL_STROKE_OPACITY = 0.55
export const DEFAULT_FRVP_LEVEL_LINE_WIDTH: LineChartStrokeWidth = 3

export const DEFAULT_FRVP_POC_LINE_STYLE: LineChartStrokeStyle = 'solid'
export const DEFAULT_FRVP_VAH_LINE_STYLE: LineChartStrokeStyle = 'dashed'
export const DEFAULT_FRVP_VAL_LINE_STYLE: LineChartStrokeStyle = 'dashed'

export const DEFAULT_FRVP_POC_STROKE_OPACITY_PERCENT = Math.round(
  FRVP_POC_LINE_STROKE_OPACITY * 100,
)
export const DEFAULT_FRVP_VAH_VAL_STROKE_OPACITY_PERCENT = Math.round(
  FRVP_VAH_VAL_STROKE_OPACITY * 100,
)

const LEVEL_STROKE_COLOR_KEY: Record<
  FrvpLevelLineKind,
  'pocStrokeColor' | 'vahStrokeColor' | 'valStrokeColor'
> = {
  poc: 'pocStrokeColor',
  vah: 'vahStrokeColor',
  val: 'valStrokeColor',
}

const LEVEL_LINE_WIDTH_KEY: Record<
  FrvpLevelLineKind,
  'pocLineWidth' | 'vahLineWidth' | 'valLineWidth'
> = {
  poc: 'pocLineWidth',
  vah: 'vahLineWidth',
  val: 'valLineWidth',
}

const LEVEL_LINE_STYLE_KEY: Record<
  FrvpLevelLineKind,
  'pocLineStyle' | 'vahLineStyle' | 'valLineStyle'
> = {
  poc: 'pocLineStyle',
  vah: 'vahLineStyle',
  val: 'valLineStyle',
}

const LEVEL_STROKE_OPACITY_KEY: Record<
  FrvpLevelLineKind,
  'pocStrokeOpacityPercent' | 'vahStrokeOpacityPercent' | 'valStrokeOpacityPercent'
> = {
  poc: 'pocStrokeOpacityPercent',
  vah: 'vahStrokeOpacityPercent',
  val: 'valStrokeOpacityPercent',
}

const DEFAULT_LINE_STYLE: Record<FrvpLevelLineKind, LineChartStrokeStyle> = {
  poc: DEFAULT_FRVP_POC_LINE_STYLE,
  vah: DEFAULT_FRVP_VAH_LINE_STYLE,
  val: DEFAULT_FRVP_VAL_LINE_STYLE,
}

const DEFAULT_OPACITY_PERCENT: Record<FrvpLevelLineKind, number> = {
  poc: DEFAULT_FRVP_POC_STROKE_OPACITY_PERCENT,
  vah: DEFAULT_FRVP_VAH_VAL_STROKE_OPACITY_PERCENT,
  val: DEFAULT_FRVP_VAH_VAL_STROKE_OPACITY_PERCENT,
}

function defaultStrokeStyleForKind(kind: FrvpLevelLineKind): string {
  if (kind === 'poc') {
    return readFrvpPocLineStrokeStyle()
  }
  return rgbaFromResolvedCssColor(FRVP_VAH_VAL_DEFAULT_HEX, FRVP_VAH_VAL_STROKE_OPACITY)
}

function strokeStyleFromHex(hex: string, opacityPercent: number): string {
  const opacity = Math.min(100, Math.max(0, opacityPercent)) / 100
  return rgbaFromResolvedCssColor(hex, opacity)
}

export function isFrvpStrokeOpacityPercent(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
  )
}

export function frvpLevelStrokeColorInputValue(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
): string {
  const colorKey = LEVEL_STROKE_COLOR_KEY[kind]
  const custom = instance[colorKey]
  if (isLineChartHexColor(custom)) return custom
  if (kind === 'poc') return readFrvpPocLineColorInputHex()
  return FRVP_VAH_VAL_DEFAULT_HEX
}

export function frvpInstanceLevelLineWidth(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
): LineChartStrokeWidth {
  const value = instance[LEVEL_LINE_WIDTH_KEY[kind]]
  if (isLineChartStrokeWidth(value)) return value
  return DEFAULT_FRVP_LEVEL_LINE_WIDTH
}

export function frvpInstanceLevelLineStyle(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
): LineChartStrokeStyle {
  const value = instance[LEVEL_LINE_STYLE_KEY[kind]]
  if (isLineChartStrokeStyle(value)) return value
  return DEFAULT_LINE_STYLE[kind]
}

export function frvpInstanceLevelStrokeOpacityPercent(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
): number {
  const value = instance[LEVEL_STROKE_OPACITY_KEY[kind]]
  if (isFrvpStrokeOpacityPercent(value)) return value
  return DEFAULT_OPACITY_PERCENT[kind]
}

export function frvpInstanceLevelLineDash(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
): readonly number[] {
  return lineChartStrokeDashPattern(frvpInstanceLevelLineStyle(instance, kind))
}

export function frvpInstanceLevelLineStrokeStyle(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
): string {
  const colorKey = LEVEL_STROKE_COLOR_KEY[kind]
  const custom = instance[colorKey]
  const opacityPercent = frvpInstanceLevelStrokeOpacityPercent(instance, kind)
  if (isLineChartHexColor(custom)) {
    return strokeStyleFromHex(custom, opacityPercent)
  }
  if (
    opacityPercent === DEFAULT_OPACITY_PERCENT[kind] &&
    frvpInstanceLevelLineStyle(instance, kind) === DEFAULT_LINE_STYLE[kind]
  ) {
    return defaultStrokeStyleForKind(kind)
  }
  return strokeStyleFromHex(frvpLevelStrokeColorInputValue(instance, kind), opacityPercent)
}

export function setFrvpInstanceLevelStrokeColor(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
  strokeColor: string,
): FixedRangeVolumeProfileInstance {
  if (!isLineChartHexColor(strokeColor)) return instance
  const key = LEVEL_STROKE_COLOR_KEY[kind]
  return { ...instance, [key]: strokeColor }
}

export function setFrvpInstanceLevelLineWidth(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
  lineWidth: LineChartStrokeWidth,
): FixedRangeVolumeProfileInstance {
  if (!isLineChartStrokeWidth(lineWidth)) return instance
  const key = LEVEL_LINE_WIDTH_KEY[kind]
  if (lineWidth === DEFAULT_FRVP_LEVEL_LINE_WIDTH) {
    const next = { ...instance }
    delete next[key]
    return next
  }
  return { ...instance, [key]: lineWidth }
}

export function setFrvpInstanceLevelLineStyle(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
  lineStyle: LineChartStrokeStyle,
): FixedRangeVolumeProfileInstance {
  if (!isLineChartStrokeStyle(lineStyle)) return instance
  const key = LEVEL_LINE_STYLE_KEY[kind]
  if (lineStyle === DEFAULT_LINE_STYLE[kind]) {
    const next = { ...instance }
    delete next[key]
    return next
  }
  return { ...instance, [key]: lineStyle }
}

export function setFrvpInstanceLevelStrokeOpacityPercent(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
  opacityPercent: number,
): FixedRangeVolumeProfileInstance {
  if (!isFrvpStrokeOpacityPercent(opacityPercent)) return instance
  const key = LEVEL_STROKE_OPACITY_KEY[kind]
  if (opacityPercent === DEFAULT_OPACITY_PERCENT[kind]) {
    const next = { ...instance }
    delete next[key]
    return next
  }
  return { ...instance, [key]: opacityPercent }
}

export function sanitizeFrvpInstanceLevelLineStyles(
  record: Record<string, unknown>,
  instance: FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileInstance {
  let next = instance
  for (const kind of ['poc', 'vah', 'val'] as const) {
    const colorKey = LEVEL_STROKE_COLOR_KEY[kind]
    const widthKey = LEVEL_LINE_WIDTH_KEY[kind]
    const styleKey = LEVEL_LINE_STYLE_KEY[kind]
    const opacityKey = LEVEL_STROKE_OPACITY_KEY[kind]
    if (isLineChartHexColor(record[colorKey])) {
      next = { ...next, [colorKey]: record[colorKey] }
    }
    if (isLineChartStrokeWidth(record[widthKey])) {
      next = { ...next, [widthKey]: record[widthKey] }
    }
    if (isLineChartStrokeStyle(record[styleKey])) {
      next = { ...next, [styleKey]: record[styleKey] }
    }
    if (isFrvpStrokeOpacityPercent(record[opacityKey])) {
      next = { ...next, [opacityKey]: record[opacityKey] }
    }
  }
  return next
}

export function frvpLevelLineWidthCssPx(width: LineChartStrokeWidth): number {
  return width
}

export function frvpDefaultDrawStyle(): FixedRangeVolumeProfileDrawStyleInput {
  const defaultWidth = frvpLevelLineWidthCssPx(DEFAULT_FRVP_LEVEL_LINE_WIDTH)
  return {
    pocStrokeStyle: defaultStrokeStyleForKind('poc'),
    pocLineWidthCssPx: defaultWidth,
    pocLineDash: lineChartStrokeDashPattern(DEFAULT_FRVP_POC_LINE_STYLE),
    vahStrokeStyle: defaultStrokeStyleForKind('vah'),
    vahLineWidthCssPx: defaultWidth,
    vahLineDash: lineChartStrokeDashPattern(DEFAULT_FRVP_VAH_LINE_STYLE),
    valStrokeStyle: defaultStrokeStyleForKind('val'),
    valLineWidthCssPx: defaultWidth,
    valLineDash: lineChartStrokeDashPattern(DEFAULT_FRVP_VAL_LINE_STYLE),
  }
}

export function frvpDrawStyleForInstance(
  instance: FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileDrawStyleInput {
  return {
    pocStrokeStyle: frvpInstanceLevelLineStrokeStyle(instance, 'poc'),
    pocLineWidthCssPx: frvpLevelLineWidthCssPx(frvpInstanceLevelLineWidth(instance, 'poc')),
    pocLineDash: frvpInstanceLevelLineDash(instance, 'poc'),
    vahStrokeStyle: frvpInstanceLevelLineStrokeStyle(instance, 'vah'),
    vahLineWidthCssPx: frvpLevelLineWidthCssPx(frvpInstanceLevelLineWidth(instance, 'vah')),
    vahLineDash: frvpInstanceLevelLineDash(instance, 'vah'),
    valStrokeStyle: frvpInstanceLevelLineStrokeStyle(instance, 'val'),
    valLineWidthCssPx: frvpLevelLineWidthCssPx(frvpInstanceLevelLineWidth(instance, 'val')),
    valLineDash: frvpInstanceLevelLineDash(instance, 'val'),
  }
}
