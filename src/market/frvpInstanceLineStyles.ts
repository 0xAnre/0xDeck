import { rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'
import { isLineChartHexColor, isLineChartStrokeWidth, type LineChartStrokeWidth } from './lineChartStroke.ts'
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

function defaultStrokeStyleForKind(kind: FrvpLevelLineKind): string {
  if (kind === 'poc') {
    return readFrvpPocLineStrokeStyle()
  }
  return rgbaFromResolvedCssColor(FRVP_VAH_VAL_DEFAULT_HEX, FRVP_VAH_VAL_STROKE_OPACITY)
}

function strokeStyleFromHex(hex: string, opacity: number): string {
  return rgbaFromResolvedCssColor(hex, opacity)
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

export function frvpInstanceLevelLineStrokeStyle(
  instance: FixedRangeVolumeProfileInstance,
  kind: FrvpLevelLineKind,
): string {
  const colorKey = LEVEL_STROKE_COLOR_KEY[kind]
  const custom = instance[colorKey]
  if (isLineChartHexColor(custom)) {
    const opacity = kind === 'poc' ? FRVP_POC_LINE_STROKE_OPACITY : FRVP_VAH_VAL_STROKE_OPACITY
    return strokeStyleFromHex(custom, opacity)
  }
  return defaultStrokeStyleForKind(kind)
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

export function sanitizeFrvpInstanceLevelLineStyles(
  record: Record<string, unknown>,
  instance: FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileInstance {
  let next = instance
  for (const kind of ['poc', 'vah', 'val'] as const) {
    const colorKey = LEVEL_STROKE_COLOR_KEY[kind]
    const widthKey = LEVEL_LINE_WIDTH_KEY[kind]
    if (isLineChartHexColor(record[colorKey])) {
      next = { ...next, [colorKey]: record[colorKey] }
    }
    if (isLineChartStrokeWidth(record[widthKey])) {
      next = { ...next, [widthKey]: record[widthKey] }
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
    vahStrokeStyle: defaultStrokeStyleForKind('vah'),
    vahLineWidthCssPx: defaultWidth,
    valStrokeStyle: defaultStrokeStyleForKind('val'),
    valLineWidthCssPx: defaultWidth,
  }
}

export function frvpDrawStyleForInstance(
  instance: FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileDrawStyleInput {
  return {
    pocStrokeStyle: frvpInstanceLevelLineStrokeStyle(instance, 'poc'),
    pocLineWidthCssPx: frvpLevelLineWidthCssPx(frvpInstanceLevelLineWidth(instance, 'poc')),
    vahStrokeStyle: frvpInstanceLevelLineStrokeStyle(instance, 'vah'),
    vahLineWidthCssPx: frvpLevelLineWidthCssPx(frvpInstanceLevelLineWidth(instance, 'vah')),
    valStrokeStyle: frvpInstanceLevelLineStrokeStyle(instance, 'val'),
    valLineWidthCssPx: frvpLevelLineWidthCssPx(frvpInstanceLevelLineWidth(instance, 'val')),
  }
}
