import { useWidgetSettings } from '@/hooks/useWidgetSettings'
import { KPI_AGG_OPTIONS, type KpiAggregation } from '@/kpiStorage'
import { MARKET_INTERVAL_OPTIONS } from '@/marketIntervalStorage'
import type { CandleInterval } from '@/market/types'
import { TIME_RANGE_OPTIONS, type TimeRange } from '@/timeRangeStorage'
import { HeaderColumnsSelect } from '@/widgetSettings/HeaderColumnsSelect'
import { HeaderIndicatorsMenu } from '@/widgetSettings/HeaderIndicatorsMenu'
import { HeaderToolsMenu } from '@/widgetSettings/HeaderToolsMenu'
import { HeaderSelect } from '@/widgetSettings/HeaderSelect'

function datasetLabel(name: string) {
  return name.replace(/\.parquet$/i, '')
}

type PanelHeaderControlsProps = {
  panelId: string
}

export function PanelHeaderControls({ panelId }: PanelHeaderControlsProps) {
  const { getSettings, settingsRevision } = useWidgetSettings()
  void settingsRevision

  const settings = getSettings(panelId)
  if (!settings) return null

  const datasetOptions = settings.datasets.map((dataset) => ({
    value: dataset.name,
    label: datasetLabel(dataset.name),
  }))

  const metricOptions =
    settings.availableColumns?.map((column) => ({ value: column, label: column })) ?? []

  return (
    <div
      className="panel-controls flex min-w-0 shrink cursor-default items-center gap-1 overflow-x-auto [&_button]:cursor-pointer"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {settings.fields.dataset && (
        <HeaderSelect
          id={`${panelId}-dataset`}
          aria-label="Dataset"
          value={settings.selectedDataset ?? undefined}
          placeholder="Dataset"
          disabled={settings.disabled}
          options={datasetOptions}
          onValueChange={settings.onDatasetChange}
        />
      )}

      {settings.fields.columns && (
        <HeaderColumnsSelect
          id={`${panelId}-columns`}
          columns={settings.availableColumns ?? []}
          selectedColumns={settings.selectedColumns ?? []}
          disabled={settings.disabled}
          onColumnsChange={settings.onColumnsChange}
        />
      )}

      {settings.fields.metric && (
        <HeaderSelect
          id={`${panelId}-metric`}
          aria-label="Column"
          value={settings.metricColumn ?? undefined}
          placeholder="Column"
          disabled={settings.disabled}
          options={metricOptions}
          onValueChange={settings.onMetricChange}
        />
      )}

      {settings.fields.timeRange && (
        <HeaderSelect
          id={`${panelId}-range`}
          aria-label="Time range"
          value={settings.timeRange}
          placeholder="Range"
          disabled={settings.disabled}
          className="w-[3.25rem]"
          options={TIME_RANGE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onValueChange={(value) => settings.onTimeRangeChange(value as TimeRange)}
        />
      )}

      {settings.fields.aggregation && (
        <HeaderSelect
          id={`${panelId}-aggregation`}
          aria-label="Aggregation"
          value={settings.aggregation}
          placeholder="Agg"
          disabled={settings.disabled}
          className="w-[4.25rem]"
          options={KPI_AGG_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onValueChange={(value) =>
            settings.onAggregationChange?.(value as KpiAggregation)
          }
        />
      )}

      {settings.fields.interval && (
        <HeaderSelect
          id={`${panelId}-interval`}
          aria-label="Interval"
          value={settings.marketInterval}
          placeholder="Interval"
          disabled={settings.disabled}
          className="w-[3.25rem]"
          options={MARKET_INTERVAL_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onValueChange={(value) =>
            settings.onMarketIntervalChange?.(value as CandleInterval)
          }
        />
      )}

      {settings.fields.indicators &&
        settings.marketIndicatorOptions &&
        settings.marketIndicators &&
        settings.onMarketIndicatorsChange && (
          <HeaderIndicatorsMenu
            id={`${panelId}-indicators`}
            disabled={settings.disabled}
            options={settings.marketIndicatorOptions}
            activeIndicators={settings.marketIndicators}
            onActiveIndicatorsChange={settings.onMarketIndicatorsChange}
            marketInterval={settings.marketInterval}
            rollingVwapInstances={settings.rollingVwapInstances}
            onRollingVwapAdd={settings.onRollingVwapAdd}
            onRollingVwapToggle={settings.onRollingVwapToggle}
            onRollingVwapSettingsClick={settings.onRollingVwapSettingsClick}
            onRollingVwapDelete={settings.onRollingVwapDelete}
          />
        )}

      {settings.fields.tools === true &&
        settings.fixedRangeVolumeProfileInstances &&
        settings.onFixedRangeVolumeProfileArm &&
        settings.onFixedRangeVolumeProfileDelete &&
        settings.rectangleInstances &&
        settings.onRectangleArm &&
        settings.onRectangleDelete &&
        settings.lineInstances &&
        settings.onLineArm &&
        settings.onLineDelete && (
          <HeaderToolsMenu
            id={`${panelId}-tools`}
            disabled={settings.disabled}
            fixedRangeVolumeProfileInstances={settings.fixedRangeVolumeProfileInstances}
            onFixedRangeVolumeProfileArm={settings.onFixedRangeVolumeProfileArm}
            onFixedRangeVolumeProfileDelete={settings.onFixedRangeVolumeProfileDelete}
            rectangleInstances={settings.rectangleInstances}
            onRectangleArm={settings.onRectangleArm}
            onRectangleDelete={settings.onRectangleDelete}
            lineInstances={settings.lineInstances}
            onLineArm={settings.onLineArm}
            onLineDelete={settings.onLineDelete}
          />
        )}
    </div>
  )
}
