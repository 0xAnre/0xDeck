import { useMemo } from 'react'
import { useWidgetSettingsRegistration } from '@/hooks/useWidgetSettingsRegistration'
import { buildMarketIndicatorOptions, type MarketIndicatorId } from '@/market/indicators'
import type { ChartObjectSettingsTarget } from '@/market/chartObjectSettingsTypes'
import type { FixedRangeVolumeProfileInstance } from '@/market/fixedRangeVolumeProfileInstances'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'
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
  onLineWidthChange?: (instanceId: string, lineWidth: LineChartStrokeWidth) => void
  onLineStyleChange?: (instanceId: string, lineStyle: LineChartStrokeStyle) => void
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
    onFixedRangeVolumeProfileLevelStrokeColorChange,
    onFixedRangeVolumeProfileLevelLineWidthChange,
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
    onLineWidthChange,
    onLineStyleChange,
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
      onFixedRangeVolumeProfileLevelStrokeColorChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileLevelStrokeColorChange : undefined,
      onFixedRangeVolumeProfileLevelLineWidthChange:
        headerSettings.tools === true ? onFixedRangeVolumeProfileLevelLineWidthChange : undefined,
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
      onLineWidthChange: headerSettings.tools === true ? onLineWidthChange : undefined,
      onLineStyleChange: headerSettings.tools === true ? onLineStyleChange : undefined,
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
      headerSettings,
      marketIndicators,
      marketInterval,
      onFixedRangeVolumeProfileArm,
      onFixedRangeVolumeProfileDelete,
      onFixedRangeVolumeProfileToggle,
      onFixedRangeVolumeProfileLockToggle,
      onFixedRangeVolumeProfileRowCountChange,
      onFixedRangeVolumeProfileValueAreaChange,
      onFixedRangeVolumeProfileLevelStrokeColorChange,
      onFixedRangeVolumeProfileLevelLineWidthChange,
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
      onLineWidthChange,
      onLineStyleChange,
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
