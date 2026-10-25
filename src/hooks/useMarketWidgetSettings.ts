import { useMemo } from 'react'
import { useWidgetSettingsRegistration } from '@/hooks/useWidgetSettingsRegistration'
import { buildMarketIndicatorOptions, type MarketIndicatorId } from '@/market/indicators'
import type { ChartObjectSettingsTarget } from '@/market/chartObjectSettingsTypes'
import type { FixedRangeVolumeProfileInstance } from '@/market/fixedRangeVolumeProfileInstances'
import type { FrvpHistogramDirection } from '@/market/frvpHistogramStyles'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'
import type { AnchoredVwapInstance } from '@/market/anchoredVwapInstances'
import type { LineInstance } from '@/market/lineInstances'
import type { RectangleInstance } from '@/market/rectangleInstances'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { CandleInterval } from '@/market/types'
import {
  type WidgetSettingsFields,
  type WidgetSettingsRegistration,
} from '@/widgetSettings/types'
import type { TimeRange } from '@/timeRangeStorage'
import { DEFAULT_TIME_RANGE } from '@/timeRangeStorage'

type UseMarketWidgetSettingsArgs = {
  headerSettings: WidgetSettingsFields
  panelId: string
  marketInterval: CandleInterval
  onMarketIntervalChange: (interval: CandleInterval) => void
  marketIndicators: MarketIndicatorId[]
  onMarketIndicatorsChange: (indicators: MarketIndicatorId[]) => void
  rollingVwapInstances: RollingVwapInstance[]
  onRollingVwapAdd: () => void
  onRollingVwapToggle: (instanceId: string, enabled: boolean) => void
  onRollingVwapSettingsClick: (instanceId: string) => void
  onRollingVwapDelete: (instanceId: string) => void
  onRollingVwapLockToggle?: (instanceId: string, locked: boolean) => void
  onMarketIndicatorSettingsClick?: (indicatorId: MarketIndicatorId) => void
  fixedRangeVolumeProfileInstances: FixedRangeVolumeProfileInstance[]
  onFixedRangeVolumeProfileArm: () => void
  onFixedRangeVolumeProfileDelete: (instanceId: string) => void
  onFixedRangeVolumeProfileToggle?: (instanceId: string, enabled: boolean) => void
  onFixedRangeVolumeProfileLockToggle?: (instanceId: string, locked: boolean) => void
  onFixedRangeVolumeProfileRowCountChange?: (instanceId: string, rowCount: number) => void
  onFixedRangeVolumeProfileValueAreaChange?: (instanceId: string, valueAreaPercent: number) => void
  onFixedRangeVolumeProfileExtendRightChange?: (
    instanceId: string,
    extendRight: boolean,
  ) => void
  onFixedRangeVolumeProfileLevelStrokeColorChange?: (
    instanceId: string,
    kind: 'poc' | 'vah' | 'val',
    strokeColor: string,
  ) => void
  onFixedRangeVolumeProfileLevelLineWidthChange?: (
    instanceId: string,
    kind: 'poc' | 'vah' | 'val',
    lineWidth: LineChartStrokeWidth,
  ) => void
  onFixedRangeVolumeProfileLevelLineStyleChange?: (
    instanceId: string,
    kind: 'poc' | 'vah' | 'val',
    lineStyle: LineChartStrokeStyle,
  ) => void
  onFixedRangeVolumeProfileLevelStrokeOpacityChange?: (
    instanceId: string,
    kind: 'poc' | 'vah' | 'val',
    opacityPercent: number,
  ) => void
  onFixedRangeVolumeProfileHistogramColorChange?: (
    instanceId: string,
    direction: FrvpHistogramDirection,
    color: string,
  ) => void
  onFixedRangeVolumeProfileHistogramOpacityChange?: (
    instanceId: string,
    direction: FrvpHistogramDirection,
    opacityPercent: number,
  ) => void
  rectangleInstances: RectangleInstance[]
  onRectangleArm: () => void
  onRectangleDelete: (instanceId: string) => void
  onRectangleLockToggle: (instanceId: string, locked: boolean) => void
  onRectangleVisibilityToggle?: (instanceId: string, hidden: boolean) => void
  onRectangleFillColorChange: (instanceId: string, fillColor: string) => void
  onRectangleFillOpacityChange: (instanceId: string, fillOpacity: number) => void
  lineInstances: LineInstance[]
  onLineArm: () => void
  onLineDelete: (instanceId: string) => void
  onLineLockToggle?: (instanceId: string, locked: boolean) => void
  onLineVisibilityToggle?: (instanceId: string, hidden: boolean) => void
  onLineStrokeColorChange?: (instanceId: string, strokeColor: string) => void
  onLineStrokeOpacityChange?: (instanceId: string, strokeOpacity: number) => void
  onLineWidthChange?: (instanceId: string, lineWidth: LineChartStrokeWidth) => void
  onLineStyleChange?: (instanceId: string, lineStyle: LineChartStrokeStyle) => void
  anchoredVwapInstances: AnchoredVwapInstance[]
  onAnchoredVwapArm: () => void
  onAnchoredVwapDelete: (instanceId: string) => void
  onAnchoredVwapLockToggle?: (instanceId: string, locked: boolean) => void
  onAnchoredVwapVisibilityToggle?: (instanceId: string, hidden: boolean) => void
  chartObjectSettingsTarget?: ChartObjectSettingsTarget | null
  onChartObjectSettingsTargetChange?: (target: ChartObjectSettingsTarget | null) => void
  disabled: boolean
}

const noop = () => {}

export function useMarketWidgetSettings(args: UseMarketWidgetSettingsArgs) {
  const {
    headerSettings,
    panelId,
    marketInterval,
    onMarketIntervalChange,
    marketIndicators,
    onMarketIndicatorsChange,
    rollingVwapInstances,
    onRollingVwapAdd,
    onRollingVwapToggle,
    onRollingVwapSettingsClick,
    onRollingVwapDelete,
    onRollingVwapLockToggle,
    onMarketIndicatorSettingsClick,
    fixedRangeVolumeProfileInstances,
    onFixedRangeVolumeProfileArm,
    onFixedRangeVolumeProfileDelete,
    onFixedRangeVolumeProfileToggle,
    onFixedRangeVolumeProfileLockToggle,
    onFixedRangeVolumeProfileRowCountChange,
    onFixedRangeVolumeProfileValueAreaChange,
    onFixedRangeVolumeProfileExtendRightChange,
    onFixedRangeVolumeProfileLevelStrokeColorChange,
    onFixedRangeVolumeProfileLevelLineWidthChange,
    onFixedRangeVolumeProfileLevelLineStyleChange,
    onFixedRangeVolumeProfileLevelStrokeOpacityChange,
    onFixedRangeVolumeProfileHistogramColorChange,
    onFixedRangeVolumeProfileHistogramOpacityChange,
    rectangleInstances,
    onRectangleArm,
    onRectangleDelete,
    onRectangleLockToggle,
    onRectangleVisibilityToggle,
    onRectangleFillColorChange,
    onRectangleFillOpacityChange,
    lineInstances,
    onLineArm,
    onLineDelete,
    onLineLockToggle,
    onLineVisibilityToggle,
    onLineStrokeColorChange,
    onLineStrokeOpacityChange,
    onLineWidthChange,
    onLineStyleChange,
    anchoredVwapInstances,
    onAnchoredVwapArm,
    onAnchoredVwapDelete,
    onAnchoredVwapLockToggle,
    onAnchoredVwapVisibilityToggle,
    chartObjectSettingsTarget,
    onChartObjectSettingsTargetChange,
    disabled,
  } = args

  const registration = useMemo<WidgetSettingsRegistration>(
    () => ({
      panelId,
      disabled,
      fields: headerSettings,
      datasets: [],
      selectedDataset: null,
      onDatasetChange: noop,
      timeRange: DEFAULT_TIME_RANGE,
      onTimeRangeChange: noop as (range: TimeRange) => void,
      marketInterval,
      onMarketIntervalChange,
      marketIndicators: headerSettings.indicators ? marketIndicators : undefined,
      marketIndicatorOptions: headerSettings.indicators
        ? buildMarketIndicatorOptions(marketInterval).filter(
            (option) => option.value !== 'rolling-vwap',
          )
        : undefined,
      onMarketIndicatorsChange: headerSettings.indicators ? onMarketIndicatorsChange : undefined,
      rollingVwapInstances: headerSettings.indicators ? rollingVwapInstances : undefined,
      onRollingVwapAdd: headerSettings.indicators ? onRollingVwapAdd : undefined,
      onRollingVwapToggle: headerSettings.indicators ? onRollingVwapToggle : undefined,
      onRollingVwapSettingsClick: headerSettings.indicators
        ? onRollingVwapSettingsClick
        : undefined,
      onRollingVwapDelete: headerSettings.indicators ? onRollingVwapDelete : undefined,
      onRollingVwapLockToggle: headerSettings.indicators ? onRollingVwapLockToggle : undefined,
      onMarketIndicatorSettingsClick: headerSettings.indicators
        ? onMarketIndicatorSettingsClick
        : undefined,
      fixedRangeVolumeProfileInstances: headerSettings.tools === true
        ? fixedRangeVolumeProfileInstances
        : undefined,
      onFixedRangeVolumeProfileArm:
        headerSettings.tools === true ? onFixedRangeVolumeProfileArm : undefined,
      onFixedRangeVolumeProfileDelete:
        headerSettings.tools === true ? onFixedRangeVolumeProfileDelete : undefined,
      onFixedRangeVolumeProfileToggle:
        headerSettings.tools === true ? onFixedRangeVolumeProfileToggle : undefined,
      onFixedRangeVolumeProfileLockToggle:
        headerSettings.tools === true ? onFixedRangeVolumeProfileLockToggle : undefined,
      onFixedRangeVolumeProfileRowCountChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileRowCountChange : undefined,
      onFixedRangeVolumeProfileValueAreaChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileValueAreaChange : undefined,
      onFixedRangeVolumeProfileExtendRightChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileExtendRightChange : undefined,
      onFixedRangeVolumeProfileLevelStrokeColorChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileLevelStrokeColorChange : undefined,
      onFixedRangeVolumeProfileLevelLineWidthChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileLevelLineWidthChange : undefined,
      onFixedRangeVolumeProfileLevelLineStyleChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileLevelLineStyleChange : undefined,
      onFixedRangeVolumeProfileLevelStrokeOpacityChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileLevelStrokeOpacityChange : undefined,
      onFixedRangeVolumeProfileHistogramColorChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileHistogramColorChange : undefined,
      onFixedRangeVolumeProfileHistogramOpacityChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileHistogramOpacityChange : undefined,
      rectangleInstances: headerSettings.tools === true ? rectangleInstances : undefined,
      onRectangleArm: headerSettings.tools === true ? onRectangleArm : undefined,
      onRectangleDelete: headerSettings.tools === true ? onRectangleDelete : undefined,
      onRectangleLockToggle: headerSettings.tools === true ? onRectangleLockToggle : undefined,
      onRectangleVisibilityToggle:
        headerSettings.tools === true ? onRectangleVisibilityToggle : undefined,
      onRectangleFillColorChange:
        headerSettings.tools === true ? onRectangleFillColorChange : undefined,
      onRectangleFillOpacityChange:
        headerSettings.tools === true ? onRectangleFillOpacityChange : undefined,
      lineInstances: headerSettings.tools === true ? lineInstances : undefined,
      onLineArm: headerSettings.tools === true ? onLineArm : undefined,
      onLineDelete: headerSettings.tools === true ? onLineDelete : undefined,
      onLineLockToggle: headerSettings.tools === true ? onLineLockToggle : undefined,
      onLineVisibilityToggle: headerSettings.tools === true ? onLineVisibilityToggle : undefined,
      onLineStrokeColorChange: headerSettings.tools === true ? onLineStrokeColorChange : undefined,
      onLineStrokeOpacityChange:
        headerSettings.tools === true ? onLineStrokeOpacityChange : undefined,
      onLineWidthChange: headerSettings.tools === true ? onLineWidthChange : undefined,
      onLineStyleChange: headerSettings.tools === true ? onLineStyleChange : undefined,
      anchoredVwapInstances: headerSettings.tools === true ? anchoredVwapInstances : undefined,
      onAnchoredVwapArm: headerSettings.tools === true ? onAnchoredVwapArm : undefined,
      onAnchoredVwapDelete: headerSettings.tools === true ? onAnchoredVwapDelete : undefined,
      onAnchoredVwapLockToggle: headerSettings.tools === true ? onAnchoredVwapLockToggle : undefined,
      onAnchoredVwapVisibilityToggle:
        headerSettings.tools === true ? onAnchoredVwapVisibilityToggle : undefined,
      chartObjectSettingsTarget:
        headerSettings.tools === true ? chartObjectSettingsTarget : undefined,
      onChartObjectSettingsTargetChange:
        headerSettings.tools === true ? onChartObjectSettingsTargetChange : undefined,
    }),
    [
      disabled,
      fixedRangeVolumeProfileInstances,
      rectangleInstances,
      lineInstances,
      anchoredVwapInstances,
      headerSettings,
      marketIndicators,
      marketInterval,
      onFixedRangeVolumeProfileArm,
      onFixedRangeVolumeProfileDelete,
      onFixedRangeVolumeProfileToggle,
      onFixedRangeVolumeProfileLockToggle,
      onFixedRangeVolumeProfileRowCountChange,
      onFixedRangeVolumeProfileValueAreaChange,
      onFixedRangeVolumeProfileExtendRightChange,
      onFixedRangeVolumeProfileLevelStrokeColorChange,
      onFixedRangeVolumeProfileLevelLineWidthChange,
      onFixedRangeVolumeProfileLevelLineStyleChange,
      onFixedRangeVolumeProfileLevelStrokeOpacityChange,
      onFixedRangeVolumeProfileHistogramColorChange,
      onFixedRangeVolumeProfileHistogramOpacityChange,
      onRectangleArm,
      onRectangleDelete,
      onRectangleLockToggle,
      onRectangleVisibilityToggle,
      onRectangleFillColorChange,
      onRectangleFillOpacityChange,
      onLineArm,
      onLineDelete,
      onLineLockToggle,
      onLineVisibilityToggle,
      onLineStrokeColorChange,
      onLineStrokeOpacityChange,
      onLineWidthChange,
      onLineStyleChange,
      onAnchoredVwapArm,
      onAnchoredVwapDelete,
      onAnchoredVwapLockToggle,
      onAnchoredVwapVisibilityToggle,
      onMarketIndicatorsChange,
      onRollingVwapAdd,
      onRollingVwapDelete,
      onRollingVwapSettingsClick,
      onRollingVwapToggle,
      onRollingVwapLockToggle,
      onMarketIndicatorSettingsClick,
      onMarketIntervalChange,
      panelId,
      rollingVwapInstances,
      chartObjectSettingsTarget,
      onChartObjectSettingsTargetChange,
    ],
  )

  useWidgetSettingsRegistration(registration)
}
