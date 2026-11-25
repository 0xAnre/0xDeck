import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LogicalRange,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import { useMarketWidgetSettings } from '@/hooks/useMarketWidgetSettings'
import { nextLiveRefreshDelayMs } from '@/lib/liveRefresh'
import { cn } from '@/lib/utils'
import {
  applyChartHistorySeries,
  hydratePlannedChartIndicatorSeries,
  resetChartIndicatorSeriesApplication,
  retainPlannedChartIndicatorSeries,
} from '@/market/applyChartHistorySeries'
import { applyChartLiveCandle, type ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import { resolveChartIndicatorSeriesPlan } from '@/market/chartIndicatorSeriesPlan'
import {
  candleCandlestickSeriesOptions,
  type CandleColors,
} from '@/market/candleColors'
import { useCandleColors } from '@/market/useCandleColors'
import { btcPerpetualCrosshairOptions } from '@/market/btcPerpetualCrosshairOptions'
import { btcPerpetualCurrentPriceLineOptions } from '@/market/btcPerpetualCurrentPriceLineOptions'
import {
  countPrependedCandles,
  fetchBtcPerpKlinesForContextLevel,
  mergeVwapContextCandles,
  shiftVisibleLogicalRange,
  shouldApplyVwapContextResponse,
  vwapContextLevelSatisfiesLoaded,
} from '@/market/btcPerpetualVwapContext'
import {
  cancelActiveVwapContextRequest,
  finalizeOwnedVwapContextRequest,
  isVwapContextAbortError,
  releaseOwnedVwapContextRequest,
} from '@/market/btcPerpetualVwapContextRequest'
import { hideAllAnchoredVwapSeries, syncVwapSeriesVisibility } from '@/market/btcPerpetualChartVwapSync'
import {
  applyEmaIndicatorSeriesVisibility,
  getEmaIndicatorSeriesVisibility,
} from '@/market/chartEmaIndicatorVisibility'
import {
  applyDefaultMarketChartPresentation,
  applySavedVisibleTimeRange,
  captureMarketChartViewport,
  restoreMarketChartViewport,
  savedVisibleTimeRangeIsRestorable,
} from '@/market/marketChartViewport'
import { loadOlderHistoryUntilVisibleFrom } from '@/market/btcPerpetualViewportHistory'
import {
  loadWidgetMarketChartViewport,
  saveWidgetMarketChartViewport,
} from '@/marketChartViewportStorage'
import {
  createInfiniteHistoryState,
  loadOlderBtcPerpHistory,
  maybeRequestOlderBtcPerpHistory,
  resetInfiniteHistoryState,
} from '@/market/btcPerpetualInfiniteHistory'
import {
  describeIndicatorHistoryStatus,
  evaluateIndicatorHistoryPlan,
  resolveIndicatorHistoryPlan,
} from '@/market/indicatorHistoryRequirements'
import { preloadIndicatorHistory } from '@/market/indicatorHistoryPreload'
import {
  clearDailyVwapLineSeriesData,
  createDailyVwapLineSeries,
} from '@/market/dailyVwapChartSeries'
import {
  clearMonthlyVwapLineSeriesData,
  createMonthlyVwapLineSeries,
} from '@/market/monthlyVwapChartSeries'
import {
  clearQuarterlyVwapLineSeriesData,
  createQuarterlyVwapLineSeries,
} from '@/market/quarterlyVwapChartSeries'
import {
  clearWeeklyVwapLineSeriesData,
  createWeeklyVwapLineSeries,
} from '@/market/weeklyVwapChartSeries'
import {
  clearYearlyVwapLineSeriesData,
  createYearlyVwapLineSeries,
} from '@/market/yearlyVwapChartSeries'
import { RollingVwapSettingsDialog } from '@/market/RollingVwapSettingsDialog'
import { FixedRangeVolumeProfileSettingsDialog } from '@/widgetSettings/FixedRangeVolumeProfileSettingsDialog'
import {
  applyRollingVwapInstanceHistory,
  applyRollingVwapInstanceSettingsToChart,
  clearAllRollingVwapChartInstanceData,
  createEmptyRollingVwapChartInstanceMap,
  reconcileRollingVwapChartBundles,
} from '@/market/rollingVwapChartInstances'
import { applyRollingVwapChartInstancePresentation } from '@/market/rollingVwapChartSeries'
import {
  addDefaultRollingVwapPanelInstance,
  deleteRollingVwapPanelInstance,
  persistRollingVwapPanelInstances,
  saveRollingVwapPanelInstanceSettings,
  toggleRollingVwapPanelInstance,
} from '@/market/rollingVwapInstancePanelActions'
import { bootstrapRollingVwapPanelState } from '@/market/rollingVwapPanelBootstrap'
import {
  findRollingVwapInstance,
  rollingVwapInstanceDisplayLabel,
  updateRollingVwapInstance,
  type RollingVwapInstance,
} from '@/market/rollingVwapInstances'
import {
  loadWidgetMarketIndicatorPresentation,
  saveWidgetMarketIndicatorPresentation,
  type MarketIndicatorPresentation,
} from '@/marketIndicatorPresentationStorage'
import {
  readMarketIndicatorSeriesColors,
  readMarketIndicatorSeriesLineStyles,
  readMarketIndicatorSeriesLineWidths,
  readSessionVwapSeriesStyleInputs,
  type SessionVwapSeriesStyleInputs,
} from '@/market/marketIndicatorSeriesColors'
import { MarketIndicatorStyleDialog } from '@/widgetSettings/MarketIndicatorStyleDialog'
import { usePositionWallet } from '@/market/usePositionWallet'
import { positionWalletSelectionKey } from '@/market/positionWallet'
import {
  getLighterPositionMarkersSnapshot,
  subscribeLighterPositionMarkers,
} from '@/market/lighterFillsStore'
import { MarketPositionMarkerSettingsDialog } from '@/widgetSettings/MarketPositionMarkerSettingsDialog'
import { createDefaultRollingVwapSettings } from '@/market/rollingVwapSettings'
import { saveWidgetRollingVwapInstances } from '@/rollingVwapInstancesStorage'
import {
  loadWidgetAnchoredVwapInstances,
  saveWidgetAnchoredVwapInstances,
} from '@/anchoredVwapInstancesStorage'
import {
  applyAnchoredVwapDrawingInstancesHistory,
  reconcileAnchoredVwapDrawingChartBundles,
  syncAnchoredVwapDrawingInstancesVisibility,
} from '@/market/anchoredVwapDrawingChartInstances'
import {
  attachAnchoredVwapDrawingChartTool,
  type AnchoredVwapDrawingChartToolController,
} from '@/market/anchoredVwapDrawingChartTool'
import {
  armAnchoredVwapDrawingTool,
  cancelAnchoredVwapDrawingInteraction,
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  type AnchoredVwapDrawingInteractionState,
} from '@/market/anchoredVwapDrawingInteraction'
import { attachAnchoredVwapDrawingSeriesPrimitive } from '@/market/anchoredVwapDrawingSeriesPrimitive'
import { AnchoredVwapSettingsDialog } from '@/market/AnchoredVwapSettingsDialog'
import { createDefaultAnchoredVwapDrawingSettings } from '@/market/anchoredVwapDrawingSettings'
import {
  formatAnchoredVwapInstanceLabel,
  sanitizeAnchoredVwapInstances,
  setAnchoredVwapInstanceHidden,
  setAnchoredVwapInstanceLocked,
  updateAnchoredVwapInstancesById,
  type AnchoredVwapInstance,
} from '@/market/anchoredVwapInstances'
import { createEmptyAnchoredVwapDrawingChartInstanceMap } from '@/market/anchoredVwapDrawingChartInstances'
import {
  loadWidgetFixedRangeVolumeProfileInstances,
  saveWidgetFixedRangeVolumeProfileInstances,
} from '@/fixedRangeVolumeProfileInstancesStorage'
import {
  attachFixedRangeVolumeProfileChartTool,
  isFixedRangeVolumeProfileChartInteractionLocked,
  type FixedRangeVolumeProfileChartToolController,
} from '@/market/fixedRangeVolumeProfileChartTool'
import {
  armFixedRangeVolumeProfileTool,
  cancelFixedRangeVolumeProfileInteraction,
  INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
  resolveFixedRangeVolumeProfileInstancesForDisplay,
  type FixedRangeVolumeProfileInteractionState,
} from '@/market/fixedRangeVolumeProfileInteraction'
import { isAnchoredVwapDrawingBlockingPeerTools } from '@/market/anchoredVwapDrawingInteraction'
import { isLineDrawingBlockingPeerTools } from '@/market/lineInteraction'
import { isRectangleDrawingBlockingPeerTools } from '@/market/rectanglePeerTools'
import {
  sanitizeFixedRangeVolumeProfileInstances,
  setFixedRangeVolumeProfileInstanceExtendRight,
  type FixedRangeVolumeProfileInstance,
} from '@/market/fixedRangeVolumeProfileInstances'
import { useFixedRangeVolumeProfileRuntime } from '@/hooks/useFixedRangeVolumeProfileRuntime'
import { attachFixedRangeVolumeProfileSeriesPrimitive } from '@/market/fixedRangeVolumeProfileSeriesPrimitive'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from '@/market/fixedRangeVolumeProfileRuntimeTypes'
import {
  loadWidgetRectangleInstances,
  saveWidgetRectangleInstances,
} from '@/rectangleInstancesStorage'
import {
  attachRectangleChartTool,
  type RectangleChartToolController,
} from '@/market/rectangleChartTool'
import {
  clearDrawingSelections,
  clearFixedRangeVolumeProfileSelectionForPeerClaim,
  clearLineAndRectangleSelectionForFrvpClaim,
  releaseAnchoredVwapDrawingInteractionForPeerTool,
  releaseFixedRangeVolumeProfileInteractionForPeerTool,
  releaseLineInteractionForPeerTool,
  releaseRectangleInteractionForPeerTool,
  withExclusiveLineSelection,
  withExclusiveRectangleSelection,
} from '@/market/drawingSelection'
import {
  applyRectangleSelection,
  armRectangleTool,
  cancelRectangleInteraction,
  INITIAL_RECTANGLE_INTERACTION_STATE,
  type RectangleInteractionState,
} from '@/market/rectangleInteraction'
import {
  claimRectangleKeyboardPanel,
  isActiveRectangleKeyboardPanel,
  isRectangleKeyboardFocusOnOutsideControl,
} from '@/market/rectangleKeyboardScope'
import {
  sanitizeRectangleInstances,
  setRectangleInstanceFillColor,
  setRectangleInstanceFillOpacity,
  setRectangleInstanceHidden,
  setRectangleInstanceLocked,
  updateRectangleInstancesById,
  type RectangleInstance,
} from '@/market/rectangleInstances'
import { latestCandleUnixTime } from '@/market/rectangleChartTime'
import { attachRectangleSeriesPrimitive } from '@/market/rectangleSeriesPrimitive'
import {
  loadWidgetLineInstances,
  saveWidgetLineInstances,
} from '@/lineInstancesStorage'
import {
  attachLineChartTool,
  type LineChartToolController,
} from '@/market/lineChartTool'
import {
  applyLineSelection,
  armLineTool,
  cancelLineInteraction,
  INITIAL_LINE_INTERACTION_STATE,
  type LineInteractionState,
} from '@/market/lineInteraction'
import type { ChartObjectSettingsTarget } from '@/market/chartObjectSettingsTypes'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'
import {
  sanitizeLineInstances,
  setLineInstanceHidden,
  setLineInstanceLocked,
  setLineInstanceStrokeColor,
  setLineInstanceStrokeOpacity,
  setLineInstanceStrokeStyle,
  setLineInstanceStrokeWidth,
  updateLineInstancesById,
  type LineInstance,
} from '@/market/lineInstances'
import {
  setFixedRangeVolumeProfileInstanceEnabled,
  setFixedRangeVolumeProfileInstanceLocked,
  updateFixedRangeVolumeProfileInstancesById,
} from '@/market/fixedRangeVolumeProfileInstances'
import {
  setFrvpInstanceLevelLineStyle,
  setFrvpInstanceLevelLineWidth,
  setFrvpInstanceLevelStrokeColor,
  setFrvpInstanceLevelStrokeOpacityPercent,
  type FrvpLevelLineKind,
} from '@/market/frvpInstanceLineStyles'
import {
  setFrvpInstanceHistogramBarHeightPercent,
  setFrvpInstanceHistogramColor,
  setFrvpInstanceHistogramOpacityPercent,
  setFrvpInstanceHistogramWidthPercent,
  type FrvpHistogramDirection,
} from '@/market/frvpHistogramStyles'
import { attachLineSeriesPrimitive } from '@/market/lineSeriesPrimitive'
import { attachChartObjectSettingsPanePointer } from '@/market/chartObjectSettingsPanePointer'
import { isAnyChartDrawingNavigationLocked } from '@/market/chartDrawingInteractionMode'
import { attachRightDragChartScaling } from '@/market/rightDragChartScalingPointer'
import { attachDrawingPaneDeselect } from '@/market/drawingPaneDeselect'
import {
  applyOverlayIndicatorSelection,
  isOverlayIndicatorSelectionRendered,
  overlayIndicatorSelectionHostSeries,
  overlayIndicatorSelectionLineSeries,
  type OverlayIndicatorSelectionTarget,
} from '@/market/overlayIndicatorSelection'
import { attachOverlayIndicatorSelectionHalo } from '@/market/overlayIndicatorSelectionHalo'
import { isEditableKeyboardTarget } from '@/screenNavigationShortcuts'
import { EMA_PERIODS } from '@/market/ema'
import {
  applyMarketIndicatorPresentationToBundle,
  syncWidgetMarketIndicatorPresentations,
} from '@/market/marketIndicatorPresentationApply'
import {
  applyRsiPaneSettings,
  clearRsiPaneData,
  createRsiChartPane,
  moveRsiPaneAbove,
  removeRsiChartPane,
  rsiPaneHeightShare,
  setRsiPaneHistoryData,
} from '@/market/rsiChartPane'
import { sanitizeRsiSettings, type RsiSettings } from '@/market/rsi'
import {
  loadWidgetRsiSettings,
  saveWidgetRsiSettings,
} from '@/marketRsiSettingsStorage'
import {
  isIndicatorSupportedOnInterval,
  requiredVwapContextLevel,
  type MarketIndicatorId,
  type VwapContextLevel,
} from '@/market/indicators'
import {
  bufferStreamCandle,
  mergeHistoryWithStreamBuffer,
} from '@/market/mergeCandleHistoryBuffer'
import { parseMarketCandlePayload } from '@/market/parseMarketCandle'
import { candleIntervalDurationSeconds } from '@/market/candleIntervalDuration'
import {
  AGGREGATED_LIQUIDATIONS_CHANNEL,
  bucketAggregatedLiquidationEvents,
  filterAggregatedLiquidationBucketsToCandles,
  parseAggregatedLiquidationEvent,
  type AggregatedLiquidationEvent,
} from '@/market/aggregatedLiquidations'
import {
  AGGREGATED_LIQUIDATIONS_HISTORY_MAX_LIMIT,
  AGGREGATED_LIQUIDATIONS_HISTORY_MAX_PAGES,
  fetchAggregatedLiquidationsHistoryShared,
  fillAggregatedLiquidationsGap,
  mergeAggregatedLiquidationEvents,
} from '@/market/aggregatedLiquidationsHistory'
import {
  AGGREGATED_LIQUIDATIONS_BUCKETS_LIVE_REFRESH_MS,
  buildAggregatedLiquidationsBucketRequest,
  describeAggregatedLiquidationsBucketError,
  describeAggregatedLiquidationsBucketNotice,
  describeAggregatedLiquidationsEventNotice,
  fetchAggregatedLiquidationsBuckets,
  nextAggregatedLiquidationsBucketsAfterError,
  shouldUseAggregatedLiquidationBuckets,
  type AggregatedLiquidationsBucketsState,
} from '@/market/aggregatedLiquidationsBuckets'
import {
  createAggregatedLiquidationsChartOverlay,
  type AggregatedLiquidationsChartOverlay,
} from '@/market/aggregatedLiquidationsChartSeries'
import {
  type AggregatedLiquidationsSettings,
} from '@/market/aggregatedLiquidationsSettings'
import { AggregatedLiquidationsSettingsDialog } from '@/market/AggregatedLiquidationsSettingsDialog'
import { registerCandleChartSeries } from '@/market/candlePane'
import {
  loadWidgetLiquidationsSettings,
  saveWidgetLiquidationsSettings,
} from '@/liquidationsSettingsStorage'
import type { CandleInterval, MarketCandle, MarketExchange } from '@/market/types'
import { marketKlineChannelForInterval } from '@/market/types'
import { isMarketChartSelectionChange } from '@/market/marketChartSelection'
import {
  marketHistoryLimitNotice,
  marketSymbolForExchange,
} from '@/market/marketExchange'
import { fixedRangeVolumeProfileAvailabilityNotices } from '@/market/frvpHistoryAvailability'
import { saveWidgetMarketIndicators } from '@/marketIndicatorStorage'
import {
  loadWidgetMarketPositionMarkerSettings,
  saveWidgetMarketPositionMarkerSettings,
} from '@/marketPositionMarkersStorage'
import {
  POSITION_MARKER_BUY_COLOR,
  POSITION_MARKER_SELL_COLOR,
  sanitizePositionMarkerSettings,
  shouldShowPositionMarkers,
  type PositionMarkerSettings,
} from '@/market/positionMarkers'
import {
  loadWidgetMarketExchange,
  saveWidgetMarketExchange,
} from '@/marketExchanges'
import {
  loadWidgetMarketInterval,
  saveWidgetMarketInterval,
} from '@/marketIntervalStorage'
import {
  EMPTY_CANDLE_WINDOW,
  candleWindowEqual,
  candleWindowOf,
  type CandleWindow,
} from '@/market/candleWindow.ts'
import {
  applyLiquidationsGapFill,
  shouldStartLiquidationsWalk,
  type LiquidationsWalkCoverage,
} from '@/market/liquidationsCoverage.ts'
import { WidgetDataStateView } from '@/widgets/components/WidgetDataStateView'
import type { WidgetDataNotReadyState } from '@/widgets/data/types'
import type { WidgetInstanceProps } from '@/widgets/registry/types'
import type { WidgetStreamConnectionState } from '@/widgets/stream/client'
import { subscribeWidgetStream } from '@/widgets/stream/sharedClient'
import type { ServerEventMessage } from '@/widgets/stream/messages'
import { resolveThemeCssColor, rgbaFromResolvedCssColor } from '@/lib/resolveCssColor.ts'
import {
  MARKET_STYLE_DUAL_LINE_SHADES,
  MARKET_STYLE_MULTI_LINE_SHADES,
} from '@/market/marketStylePalette'
import { hyperliquidUserFillsChannel } from '@/market/hyperliquidAccount'
import { fetchHyperliquidAccountFillsByTime } from '@/market/hyperliquidAccountApi'
import {
  bucketHyperliquidFills,
  filterHyperliquidFillsToLoadedCandles,
  groupHyperliquidFillMarkers,
  hyperliquidFillIdentityKey,
  mergeHyperliquidFills,
  parseHyperliquidFill,
  type AccountFill,
  type BucketedHyperliquidFill,
} from '@/market/hyperliquidFills'
import {
  hyperliquidFillGroupsToMarkers,
  type HyperliquidMarkerColors,
} from '@/market/hyperliquidMarkers'
import { formatSeriesLabel } from '@/lib/formatTime'

/** Theme tokens only drive chart text/background; indicator defaults come from the palette. */
function readThemeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    // Shared theme token: dark palettes keep the previous transparent canvas (card shows through);
    // Cream paints a distinctly darker cream chart pane than the page. No per-widget override.
    background: resolveThemeCssColor(style.getPropertyValue('--chart-background'), 'transparent'),
    text: resolveThemeCssColor(style.getPropertyValue('--foreground'), '#d4d4d8'),
    ema: MARKET_STYLE_MULTI_LINE_SHADES,
    ema100: MARKET_STYLE_DUAL_LINE_SHADES[0],
    ema200: MARKET_STYLE_DUAL_LINE_SHADES[1],
  }
}

/**
 * Theme-derived chart chrome only: text/background, pane separators and crosshair. It is shared by
 * chart creation and the in-session theme refresh so both always apply the same chrome options.
 * Series/candle/indicator colors are deliberately not part of this object.
 */
function themeChartOptions(colors: ReturnType<typeof readThemeColors>) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.text,
      // Native pane separators: a faint theme-derived hairline instead of the
      // library's high-contrast default. `enableResize` keeps resize behaviour.
      panes: {
        enableResize: true,
        separatorColor: rgbaFromResolvedCssColor(colors.text, 0.12),
        separatorHoverColor: rgbaFromResolvedCssColor(colors.text, 0.24),
      },
    },
    crosshair: btcPerpetualCrosshairOptions(colors.text),
  }
}

/** Fixed account-marker colors (same in every theme, both wallet exchanges). */
const ACCOUNT_MARKER_COLORS: HyperliquidMarkerColors = {
  buy: POSITION_MARKER_BUY_COLOR,
  sell: POSITION_MARKER_SELL_COLOR,
}

/**
 * Account fills are tagged with the wallet that produced them. Reading through
 * the tag makes a previous wallet's fills/notice unreadable the moment the
 * global selection changes, instead of clearing state in an effect.
 */
type AccountFillState = {
  walletKey: string
  fills: AccountFill[]
  notice: string | null
}

type HoveredAccountFillState = {
  walletKey: string
  fills: BucketedHyperliquidFill[]
}

const NO_ACCOUNT_FILLS: AccountFill[] = []
const NO_HOVERED_ACCOUNT_FILLS: BucketedHyperliquidFill[] = []

/**
 * Mirror the applied candlestick series options onto the chart container.
 *
 * The chart body is canvas-only, so a browser test cannot inspect the series
 * otherwise; these attributes report the actual series options after
 * `applyOptions`, not the stored preference. They have no visual or pointer
 * behaviour.
 */
function publishCandleSeriesColorOptions(
  container: HTMLElement,
  series: ISeriesApi<'Candlestick'>,
) {
  const options = series.options()
  container.dataset.candleRisingColor = String(options.upColor)
  container.dataset.candleFallingColor = String(options.downColor)
  container.dataset.candleRisingWickColor = String(options.wickUpColor)
  container.dataset.candleFallingWickColor = String(options.wickDownColor)
  container.dataset.candleRisingBorderColor = String(options.borderUpColor)
  container.dataset.candleFallingBorderColor = String(options.borderDownColor)
  container.dataset.candleBorderVisible = String(options.borderVisible)
  container.dataset.candleWickVisible = String(options.wickVisible)
}

function streamStatusLabel(state: WidgetStreamConnectionState): string | null {
  switch (state) {
    case 'connecting':
    case 'reconnecting':
      return 'Live reconnecting…'
    case 'error':
      return 'Live connection error'
    case 'closed':
      return 'Live disconnected'
    default:
      return null
  }
}

type LoadedVwapContext = {
  level: VwapContextLevel
  interval: CandleInterval
}

export function BtcPerpetualChartPanel({ panelId, headerSettings }: WidgetInstanceProps) {
  const candleColors = useCandleColors()
  const [exchange, setExchange] = useState<MarketExchange>(() =>
    loadWidgetMarketExchange(panelId),
  )
  const [interval, setInterval] = useState<CandleInterval>(() =>
    loadWidgetMarketInterval(panelId),
  )
  const [rollingVwapPanelBoot] = useState(() => bootstrapRollingVwapPanelState(panelId))
  const [activeIndicators, setActiveIndicators] = useState<MarketIndicatorId[]>(
    rollingVwapPanelBoot.activeIndicators,
  )
  const [rollingVwapInstances, setRollingVwapInstances] = useState<RollingVwapInstance[]>(
    rollingVwapPanelBoot.instances,
  )
  const [dataState, setDataState] = useState<WidgetDataNotReadyState>({ status: 'loading' })
  const [chartReady, setChartReady] = useState(false)
  const [indicatorHistoryNotices, setIndicatorHistoryNotices] = useState<string[]>([])
  const [streamState, setStreamState] = useState<WidgetStreamConnectionState>('idle')
  const [rollingVwapSettingsOpen, setRollingVwapSettingsOpen] = useState(false)
  const [editingRollingVwapInstanceId, setEditingRollingVwapInstanceId] = useState<string | null>(
    null,
  )
  const [chartObjectSettingsTarget, setChartObjectSettingsTarget] =
    useState<ChartObjectSettingsTarget | null>(null)
  /**
   * Transient single-click selection of an overlay indicator (gap G3). It is
   * never persisted and never written back into the object's stored style; the
   * settings dialogs below stay the only writers of indicator settings.
   */
  const [overlayIndicatorSelection, setOverlayIndicatorSelection] =
    useState<OverlayIndicatorSelectionTarget | null>(null)
  const [editingMarketIndicatorId, setEditingMarketIndicatorId] =
    useState<MarketIndicatorId | null>(null)
  const [rsiSettings, setRsiSettings] = useState<RsiSettings>(() =>
    loadWidgetRsiSettings(panelId),
  )
  const [marketIndicatorPresentation, setMarketIndicatorPresentation] =
    useState<MarketIndicatorPresentation>({})
  const [editingMarketIndicatorSeriesColors, setEditingMarketIndicatorSeriesColors] = useState<
    readonly string[]
  >([])
  const [editingMarketIndicatorSeriesLineWidths, setEditingMarketIndicatorSeriesLineWidths] =
    useState<readonly LineChartStrokeWidth[]>([])
  const [editingMarketIndicatorSeriesLineStyles, setEditingMarketIndicatorSeriesLineStyles] =
    useState<readonly LineChartStrokeStyle[]>([])
  const [editingSessionVwapSeriesInputs, setEditingSessionVwapSeriesInputs] =
    useState<SessionVwapSeriesStyleInputs | null>(null)
  const [fixedRangeVolumeProfileInstances, setFixedRangeVolumeProfileInstances] = useState<
    FixedRangeVolumeProfileInstance[]
  >(() =>
    loadWidgetFixedRangeVolumeProfileInstances(panelId, {
      selectionIntervalFallback: loadWidgetMarketInterval(panelId),
    }),
  )
  const [fixedRangeVolumeProfileInteraction, setFixedRangeVolumeProfileInteraction] =
    useState<FixedRangeVolumeProfileInteractionState>(INITIAL_FIXED_RANGE_VP_INTERACTION_STATE)
  const [fixedRangeVolumeProfileLiveRightEdge, setFixedRangeVolumeProfileLiveRightEdge] = useState<
    number | null
  >(null)
  const fixedRangeVolumeProfileLiveRightEdgeRef = useRef<number | null>(null)
  const [rectangleInstances, setRectangleInstances] = useState<RectangleInstance[]>(() =>
    loadWidgetRectangleInstances(panelId),
  )
  const [rectangleInteraction, setRectangleInteraction] = useState<RectangleInteractionState>(
    INITIAL_RECTANGLE_INTERACTION_STATE,
  )
  const [lineInstances, setLineInstances] = useState<LineInstance[]>(() =>
    loadWidgetLineInstances(panelId),
  )
  const [lineInteraction, setLineInteraction] = useState<LineInteractionState>(
    INITIAL_LINE_INTERACTION_STATE,
  )
  const [anchoredVwapInstances, setAnchoredVwapInstances] = useState<AnchoredVwapInstance[]>(() =>
    loadWidgetAnchoredVwapInstances(panelId),
  )
  const [anchoredVwapInteraction, setAnchoredVwapInteraction] =
    useState<AnchoredVwapDrawingInteractionState>(INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE)
  const [anchoredVwapSettingsOpen, setAnchoredVwapSettingsOpen] = useState(false)
  const [editingAnchoredVwapInstanceId, setEditingAnchoredVwapInstanceId] = useState<string | null>(
    null,
  )
  /**
   * Global Position Markers wallet from the app header. It is independent of
   * the candle exchange, so this panel renders whatever wallet is selected on
   * its own candles; no per-widget wallet input exists.
   */
  const positionWallet = usePositionWallet()
  const positionWalletKey = positionWalletSelectionKey(positionWallet)
  const [accountFillState, setAccountFillState] = useState<AccountFillState>({
    walletKey: '',
    fills: NO_ACCOUNT_FILLS,
    notice: null,
  })
  const accountFills =
    accountFillState.walletKey === positionWalletKey ? accountFillState.fills : NO_ACCOUNT_FILLS
  const accountFillsNotice =
    accountFillState.walletKey === positionWalletKey ? accountFillState.notice : null
  const mergeAccountFills = useCallback(
    (incoming: AccountFill[]) => {
      setAccountFillState((current) => {
        const fills = current.walletKey === positionWalletKey ? current.fills : NO_ACCOUNT_FILLS
        return {
          walletKey: positionWalletKey,
          fills: mergeHyperliquidFills(fills, incoming),
          notice: current.walletKey === positionWalletKey ? current.notice : null,
        }
      })
    },
    [positionWalletKey],
  )
  const setAccountFillsNotice = useCallback(
    (notice: string | null) => {
      setAccountFillState((current) => ({
        walletKey: positionWalletKey,
        fills: current.walletKey === positionWalletKey ? current.fills : NO_ACCOUNT_FILLS,
        notice,
      }))
    },
    [positionWalletKey],
  )
  const replaceAccountFills = useCallback(
    (fills: AccountFill[], notice: string | null) => {
      setAccountFillState({ walletKey: positionWalletKey, fills, notice })
    },
    [positionWalletKey],
  )
  const clearAccountFills = useCallback(() => {
    setAccountFillState({ walletKey: positionWalletKey, fills: NO_ACCOUNT_FILLS, notice: null })
  }, [positionWalletKey])
  const [positionMarkerSettings, setPositionMarkerSettings] =
    useState<PositionMarkerSettings>(() => loadWidgetMarketPositionMarkerSettings(panelId))
  const [positionMarkerSettingsOpen, setPositionMarkerSettingsOpen] = useState(false)
  /** Marker size only changes rendering; it never changes what a marker means. */
  const positionMarkersEnabled = positionMarkerSettings.enabled
  const [liquidationSettings, setLiquidationSettings] = useState<AggregatedLiquidationsSettings>(
    () => loadWidgetLiquidationsSettings(panelId),
  )
  const [liquidationsSettingsOpen, setLiquidationsSettingsOpen] = useState(false)
  const [liquidationEvents, setLiquidationEvents] = useState<AggregatedLiquidationEvent[]>([])
  const [liquidationBuckets, setLiquidationBuckets] =
    useState<AggregatedLiquidationsBucketsState | null>(null)
  // Stamp the notice with the interval that produced it so a notice from the
  // events path can never be shown next to buckets for another interval.
  const [liquidationCoverageNotice, setLiquidationCoverageNotice] = useState<{
    interval: CandleInterval
    message: string | null
  } | null>(null)
  const [liquidationHistoryRevision, setLiquidationHistoryRevision] = useState(0)
  const [liquidationBucketsRevision, setLiquidationBucketsRevision] = useState(0)
  const [hoveredAccountFillState, setHoveredAccountFillState] =
    useState<HoveredAccountFillState>({
      walletKey: '',
      fills: NO_HOVERED_ACCOUNT_FILLS,
    })
  const hoveredAccountFills =
    hoveredAccountFillState.walletKey === positionWalletKey
      ? hoveredAccountFillState.fills
      : NO_HOVERED_ACCOUNT_FILLS
  const clearHoveredAccountFills = useCallback(() => {
    setHoveredAccountFillState({
      walletKey: positionWalletKey,
      fills: NO_HOVERED_ACCOUNT_FILLS,
    })
  }, [positionWalletKey])
  const [candleRangeRevision, setCandleRangeRevision] = useState(0)
  /**
   * Window last published through `candleRangeRevision`. The revision exists to
   * tell range-scoped reads (liquidation walk, buckets, account fills) that the
   * loaded range moved; it must not fire for a notice re-render (#238).
   */
  const candleWindowRef = useRef<CandleWindow>(EMPTY_CANDLE_WINDOW)
  /**
   * Range already covered by a completed liquidation walk. Kept per interval so
   * a new candle or an unchanged window never re-walks the same pages, and an
   * interval change does (#238).
   */
  const liquidationWalkCoverageRef = useRef<LiquidationsWalkCoverage | null>(null)
  /** Last live-socket revision this panel has already gap-filled. */
  const liquidationSocketRevisionRef = useRef(0)
  /** Newest liquidation event already in the buffer, for the handshake gap fill. */
  const newestLiquidationTradeTimeRef = useRef<number | null>(null)

  const liquidationsEnabled = activeIndicators.includes('aggregated-liquidations')

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ChartSeriesBundle | null>(null)
  /** Latest global colors for chart creation, without re-running the creation effect. */
  const candleColorsRef = useRef<CandleColors>(candleColors)
  const overlayIndicatorSelectionRef = useRef<OverlayIndicatorSelectionTarget | null>(null)
  const chartObjectSettingsTargetRef = useRef<ChartObjectSettingsTarget | null>(null)
  const candlesRef = useRef<MarketCandle[]>([])
  const loadGenerationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  /**
   * Releases this panel's subscription to the shared kline channel. The socket
   * itself is owned by `subscribeWidgetStream`, so another panel on the same
   * symbol and interval keeps the feed alive while this one reloads (Issue #238:
   * two panels on one interval used to dial two identical sockets).
   */
  const streamUnsubscribeRef = useRef<(() => void) | null>(null)
  const stopKlineStream = useCallback(() => {
    streamUnsubscribeRef.current?.()
    streamUnsubscribeRef.current = null
  }, [])
  const activeExchangeRef = useRef<MarketExchange>(exchange)
  const activeIntervalRef = useRef<CandleInterval>(interval)
  const providerHistoryAvailableFromRef = useRef<number | null>(null)
  const activeIndicatorsRef = useRef<MarketIndicatorId[]>(activeIndicators)
  const rsiSettingsRef = useRef<RsiSettings>(rsiSettings)
  /**
   * Plot-height share of the RSI pane when it was last removed, so toggling the
   * indicator off and on again restores the user's layout instead of snapping
   * back to the default share.
   */
  const rsiPaneHeightShareRef = useRef<number | null>(null)
  const historyReadyRef = useRef(false)
  const infiniteHistoryRef = useRef(createInfiniteHistoryState())
  const indicatorHistoryAbortRef = useRef<AbortController | null>(null)
  const indicatorHistoryPreloadLimitRef = useRef(false)
  const loadedVwapContextRef = useRef<LoadedVwapContext | null>(null)
  const vwapContextAbortRef = useRef<AbortController | null>(null)
  const vwapContextLatestRequestIdRef = useRef(0)
  const rollingVwapInstancesRef = useRef(rollingVwapInstances)
  const positionMarkerSettingsRef = useRef(positionMarkerSettings)
  const fixedRangeVolumeProfileInstancesRef = useRef(fixedRangeVolumeProfileInstances)
  const fixedRangeVolumeProfileInteractionRef = useRef(fixedRangeVolumeProfileInteraction)
  const fixedRangeVolumeProfileToolControllerRef =
    useRef<FixedRangeVolumeProfileChartToolController | null>(null)
  const fixedRangeVolumeProfileRuntimeById = useFixedRangeVolumeProfileRuntime(
    fixedRangeVolumeProfileInstances,
    fixedRangeVolumeProfileLiveRightEdge,
    exchange,
  )
  const fixedRangeVolumeProfileRuntimeRef = useRef<FixedRangeVolumeProfileRuntimeSnapshot>(
    fixedRangeVolumeProfileRuntimeById,
  )
  const fixedRangeVolumeProfileSeriesAttachmentRef = useRef<{
    update: () => void
    dispose: () => void
  } | null>(null)
  const rectangleInstancesRef = useRef(rectangleInstances)
  const rectangleInteractionRef = useRef(rectangleInteraction)
  const rectangleToolControllerRef = useRef<RectangleChartToolController | null>(null)
  const rectangleSeriesAttachmentRef = useRef<{
    update: () => void
    dispose: () => void
  } | null>(null)
  const rectanglePointerPreviewRef = useRef<{ pointerTime: number | null; pointerPrice: number | null }>({
    pointerTime: null,
    pointerPrice: null,
  })
  const rectangleArmClaimTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const lineInstancesRef = useRef(lineInstances)
  const lineInteractionRef = useRef(lineInteraction)
  const lineToolControllerRef = useRef<LineChartToolController | null>(null)
  const lineSeriesAttachmentRef = useRef<{
    update: () => void
    dispose: () => void
  } | null>(null)
  const linePointerPreviewRef = useRef<{ pointerTime: number | null; pointerPrice: number | null }>({
    pointerTime: null,
    pointerPrice: null,
  })
  const lineArmClaimTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const anchoredVwapInstancesRef = useRef(anchoredVwapInstances)
  const anchoredVwapInteractionRef = useRef(anchoredVwapInteraction)
  const anchoredVwapToolControllerRef = useRef<AnchoredVwapDrawingChartToolController | null>(null)
  const anchoredVwapSeriesAttachmentRef = useRef<{
    update: () => void
    dispose: () => void
  } | null>(null)
  const anchoredVwapArmClaimTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const frvpArmClaimTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const suppressViewportPersistRef = useRef(false)
  const viewportPersistTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const accountMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const accountFillsRangeRef = useRef<string | null>(null)
  const accountMarkersByBucketRef = useRef<Map<number, BucketedHyperliquidFill[]>>(
    new Map(),
  )
  const liquidationOverlayRef = useRef<AggregatedLiquidationsChartOverlay | null>(null)
  const liquidationSettingsRef = useRef(liquidationSettings)

  const flushMarketChartViewportPersist = useCallback(
    (
      intervalOverride?: CandleInterval,
      options?: { allowWhileHistoryNotReady?: boolean },
    ) => {
      if (suppressViewportPersistRef.current) return
      if (!options?.allowWhileHistoryNotReady && !historyReadyRef.current) return
      const chart = chartRef.current
      if (!chart) return
      const captured = captureMarketChartViewport(chart, candlesRef.current)
      if (!captured) return
      saveWidgetMarketChartViewport(
        panelId,
        intervalOverride ?? activeIntervalRef.current,
        captured,
      )
    },
    [panelId],
  )

  const refreshIndicatorHistoryNotices = useCallback(() => {
    // Candle windows change on initial load, older-history pages and VWAP
    // context merges. Account fills are scoped to those windows, so they must
    // refresh with the chart instead of staying on a stale range.
    //
    // Only a *changed* window may bump the revision. This function is also the
    // display-notice refresher, called for notice-only updates (a preload step,
    // a repeated merge); bumping unconditionally restarted the full liquidation
    // walk (`liquidations/history` x12) from the newest cursor on every call,
    // which is the duplicate paging Issue #238 measured.
    const nextWindow = candleWindowOf(candlesRef.current)
    if (!candleWindowEqual(candleWindowRef.current, nextWindow)) {
      candleWindowRef.current = nextWindow
      setCandleRangeRevision((revision) => revision + 1)
    }
    if (!historyReadyRef.current) {
      setIndicatorHistoryNotices((current) => (current.length === 0 ? current : []))
      return
    }
    const plan = resolveIndicatorHistoryPlan({
      interval: activeIntervalRef.current,
      indicators: activeIndicatorsRef.current,
      rollingVwapInstances: rollingVwapInstancesRef.current,
      anchoredVwapInstances: anchoredVwapInstancesRef.current,
    })
    const evaluated = evaluateIndicatorHistoryPlan(plan, candlesRef.current)
    const notices = evaluated
      .map((entry) =>
        describeIndicatorHistoryStatus(entry, {
          preloadLimitReached: indicatorHistoryPreloadLimitRef.current,
        }),
      )
      .filter((notice): notice is string => notice !== null)
    const limitNotice = marketHistoryLimitNotice({
      exchange: activeExchangeRef.current,
      interval: activeIntervalRef.current,
      oldestCandleTime: candlesRef.current[0]?.time ?? null,
      availableFrom: providerHistoryAvailableFromRef.current,
      hasUnmetRequirements: evaluated.some((entry) => entry.status !== 'ready'),
      historyUnavailable: infiniteHistoryRef.current.historyUnavailable,
    })
    if (limitNotice !== null && !notices.includes(limitNotice)) {
      notices.push(limitNotice)
    }
    // Keep the array identity when nothing changed: a new array re-rendered the
    // panel (and every child) on each notice refresh for no visible change.
    setIndicatorHistoryNotices((current) =>
      current.length === notices.length &&
      current.every((notice, index) => notice === notices[index])
        ? current
        : notices,
    )
  }, [])

  const scheduleMarketChartViewportPersist = useCallback(() => {
    if (suppressViewportPersistRef.current) return
    const intervalAtSchedule = activeIntervalRef.current
    if (viewportPersistTimerRef.current) {
      clearTimeout(viewportPersistTimerRef.current)
    }
    viewportPersistTimerRef.current = setTimeout(() => {
      viewportPersistTimerRef.current = null
      flushMarketChartViewportPersist(intervalAtSchedule)
    }, 250)
  }, [flushMarketChartViewportPersist])

  useEffect(() => {
    candleColorsRef.current = candleColors
  }, [candleColors])

  /**
   * Apply the global candle Body/Border/Wick appearance in place. This effect
   * never calls `createChart`, reloads candles, touches the time scale or
   * persists the viewport: it only writes candlestick series options, so Save
   * cannot reset zoom/drawings or trigger a history refetch.
   */
  useEffect(() => {
    const candleSeries = seriesRef.current?.candle
    const container = containerRef.current
    if (!candleSeries || !container) return
    candleSeries.applyOptions(candleCandlestickSeriesOptions(candleColors))
    publishCandleSeriesColorOptions(container, candleSeries)
  }, [candleColors, chartReady])

  useEffect(() => {
    rollingVwapInstancesRef.current = rollingVwapInstances
  }, [rollingVwapInstances])

  useEffect(() => {
    fixedRangeVolumeProfileInstancesRef.current = fixedRangeVolumeProfileInstances
  }, [fixedRangeVolumeProfileInstances])

  // The live right edge is the last loaded candle time. It only changes when a
  // new candle opens (not per price tick), and drives Extend Right recalcs.
  const syncFixedRangeVolumeProfileLiveRightEdge = useCallback(() => {
    const next = latestCandleUnixTime(candlesRef.current)
    if (fixedRangeVolumeProfileLiveRightEdgeRef.current === next) return
    fixedRangeVolumeProfileLiveRightEdgeRef.current = next
    setFixedRangeVolumeProfileLiveRightEdge(next)
  }, [])

  useEffect(() => {
    fixedRangeVolumeProfileInteractionRef.current = fixedRangeVolumeProfileInteraction
  }, [fixedRangeVolumeProfileInteraction])

  useEffect(() => {
    rectangleInstancesRef.current = rectangleInstances
  }, [rectangleInstances])

  useEffect(() => {
    rectangleInteractionRef.current = rectangleInteraction
  }, [rectangleInteraction])

  useEffect(() => {
    lineInstancesRef.current = lineInstances
  }, [lineInstances])

  useEffect(() => {
    lineInteractionRef.current = lineInteraction
  }, [lineInteraction])

  useEffect(() => {
    anchoredVwapInstancesRef.current = anchoredVwapInstances
  }, [anchoredVwapInstances])

  useEffect(() => {
    anchoredVwapInteractionRef.current = anchoredVwapInteraction
  }, [anchoredVwapInteraction])

  /**
   * Deselect every drawing tool through the shared selection helpers. Used by
   * the candle-pane pointer modules' empty-space click and by the RSI /
   * liquidation pane click, so both paths clear the same selection state and
   * skip a re-render when nothing was selected.
   */
  const clearDrawingSelection = useCallback(() => {
    const cleared = clearDrawingSelections({
      rectangle: rectangleInteractionRef.current,
      line: lineInteractionRef.current,
      fixedRangeVolumeProfile: fixedRangeVolumeProfileInteractionRef.current,
      anchoredVwap: anchoredVwapInteractionRef.current,
    })
    if (!cleared) return
    if (cleared.rectangle !== rectangleInteractionRef.current) {
      rectangleInteractionRef.current = cleared.rectangle
      setRectangleInteraction(cleared.rectangle)
      rectangleSeriesAttachmentRef.current?.update()
    }
    if (cleared.line !== lineInteractionRef.current) {
      lineInteractionRef.current = cleared.line
      setLineInteraction(cleared.line)
      lineSeriesAttachmentRef.current?.update()
    }
    if (cleared.fixedRangeVolumeProfile !== fixedRangeVolumeProfileInteractionRef.current) {
      fixedRangeVolumeProfileInteractionRef.current = cleared.fixedRangeVolumeProfile
      setFixedRangeVolumeProfileInteraction(cleared.fixedRangeVolumeProfile)
      fixedRangeVolumeProfileToolControllerRef.current?.sync()
      fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
    }
    if (cleared.anchoredVwap !== anchoredVwapInteractionRef.current) {
      anchoredVwapInteractionRef.current = cleared.anchoredVwap
      setAnchoredVwapInteraction(cleared.anchoredVwap)
      anchoredVwapToolControllerRef.current?.sync()
      anchoredVwapSeriesAttachmentRef.current?.update()
    }
  }, [])

  useEffect(() => {
    overlayIndicatorSelectionRef.current = overlayIndicatorSelection
  }, [overlayIndicatorSelection])

  useEffect(() => {
    chartObjectSettingsTargetRef.current = chartObjectSettingsTarget
  }, [chartObjectSettingsTarget])

  /** Release the transient overlay-indicator selection (same message as drawings). */
  const clearOverlayIndicatorSelection = useCallback(() => {
    setOverlayIndicatorSelection((current) => applyOverlayIndicatorSelection(current, null))
  }, [])

  /**
   * `Esc` deselects the overlay indicator — but only when no settings dialog or
   * popover is open: Radix dismissal handles those first (capture-phase
   * `preventDefault`), and an open settings dialog is reported through
   * `chartObjectSettingsTarget`. Keyboard ownership stays gated on the shared
   * active-panel scope, so exactly one panel reacts.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.defaultPrevented) return
      if (chartObjectSettingsTargetRef.current !== null) return
      if (!isActiveRectangleKeyboardPanel(panelId)) return
      if (isEditableKeyboardTarget(event.target)) return
      if (overlayIndicatorSelectionRef.current === null) return
      event.preventDefault()
      setOverlayIndicatorSelection(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [panelId])

  /**
   * A selection may not outlive its object: hiding (indicator toggle off, an
   * interval that does not support it, rolling VWAP `enabled: false`) or
   * removing the object clears it.
   */
  useEffect(() => {
    const loaded = loadedVwapContextRef.current
    setOverlayIndicatorSelection((current) =>
      isOverlayIndicatorSelectionRendered(current, {
        activeIndicators,
        interval,
        loadedVwapLevel: loaded?.interval === interval ? loaded.level : null,
        loadedVwapInterval: loaded?.interval ?? null,
        rollingVwapInstances,
      })
        ? current
        : null,
    )
  }, [activeIndicators, interval, rollingVwapInstances])

  /**
   * Temporary selection feedback: the selected overlay lines are stroked wider
   * by a chart primitive. Nothing is written to the series options or storage,
   * so the persisted color/opacity/width/style can never be overwritten.
   */
  useEffect(() => {
    if (!chartReady || overlayIndicatorSelection === null) return
    const host = overlayIndicatorSelectionHostSeries(seriesRef.current, overlayIndicatorSelection)
    if (!host) return

    const attachment = attachOverlayIndicatorSelectionHalo(host, () =>
      overlayIndicatorSelectionLineSeries(
        seriesRef.current,
        overlayIndicatorSelection,
        rollingVwapInstancesRef.current,
      ),
    )

    return () => {
      attachment.dispose()
    }
  }, [chartReady, overlayIndicatorSelection])

  /**
   * Band-part selection feedback is painted by the Rolling VWAP band primitive
   * itself, so only the selected band pair is stroked. The shared halo above
   * still strokes the native centre line for a centre/whole-instance part.
   */
  useEffect(() => {
    if (!chartReady) return
    const bundle = seriesRef.current
    if (!bundle) return
    for (const [instanceId, chartBundle] of bundle.rollingVwaps) {
      const part =
        overlayIndicatorSelection?.kind === 'rolling-vwap' &&
        overlayIndicatorSelection.instanceId === instanceId
          ? (overlayIndicatorSelection.part ?? 'all')
          : null
      chartBundle.bands.setHaloPart(part)
    }
  }, [chartReady, overlayIndicatorSelection])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const controller = attachDrawingPaneDeselect(chart, {
      shouldHandle: () => isActiveRectangleKeyboardPanel(panelId),
      onEmptyPanePointerDown: clearDrawingSelection,
    })

    return () => {
      controller.dispose()
    }
  }, [chartReady, panelId, clearDrawingSelection])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current
      if (!container) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (container.contains(target)) {
        claimRectangleKeyboardPanel(panelId)
        return
      }
      if (isActiveRectangleKeyboardPanel(panelId)) {
        claimRectangleKeyboardPanel(null)
      }
      clearDrawingSelection()
      clearOverlayIndicatorSelection()
    }

    const onFocusIn = (event: FocusEvent) => {
      const container = containerRef.current
      if (!container) return
      if (!isRectangleKeyboardFocusOnOutsideControl(event.target, container)) return
      if (isActiveRectangleKeyboardPanel(panelId)) {
        claimRectangleKeyboardPanel(null)
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      if (rectangleArmClaimTimerRef.current !== null) {
        window.clearTimeout(rectangleArmClaimTimerRef.current)
        rectangleArmClaimTimerRef.current = null
      }
      if (lineArmClaimTimerRef.current !== null) {
        window.clearTimeout(lineArmClaimTimerRef.current)
        lineArmClaimTimerRef.current = null
      }
      if (frvpArmClaimTimerRef.current !== null) {
        window.clearTimeout(frvpArmClaimTimerRef.current)
        frvpArmClaimTimerRef.current = null
      }
      if (anchoredVwapArmClaimTimerRef.current !== null) {
        window.clearTimeout(anchoredVwapArmClaimTimerRef.current)
        anchoredVwapArmClaimTimerRef.current = null
      }
      if (isActiveRectangleKeyboardPanel(panelId)) {
        claimRectangleKeyboardPanel(null)
      }
    }
  }, [panelId, clearDrawingSelection, clearOverlayIndicatorSelection])

  useEffect(() => {
    fixedRangeVolumeProfileRuntimeRef.current = fixedRangeVolumeProfileRuntimeById
    fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
  }, [fixedRangeVolumeProfileRuntimeById])

  const persistFixedRangeVolumeProfileInstances = useCallback(
    (next: FixedRangeVolumeProfileInstance[]) => {
      const sanitized = sanitizeFixedRangeVolumeProfileInstances(next)
      fixedRangeVolumeProfileInstancesRef.current = sanitized
      setFixedRangeVolumeProfileInstances(sanitized)
      saveWidgetFixedRangeVolumeProfileInstances(panelId, sanitized)
      fixedRangeVolumeProfileToolControllerRef.current?.sync()
      return sanitized
    },
    [panelId],
  )

  const persistRectangleInstances = useCallback(
    (next: RectangleInstance[]) => {
      const sanitized = sanitizeRectangleInstances(next)
      rectangleInstancesRef.current = sanitized
      setRectangleInstances(sanitized)
      saveWidgetRectangleInstances(panelId, sanitized)
      rectangleToolControllerRef.current?.sync()
      rectangleSeriesAttachmentRef.current?.update()
      return sanitized
    },
    [panelId],
  )

  const persistLineInstances = useCallback(
    (next: LineInstance[]) => {
      const sanitized = sanitizeLineInstances(next)
      lineInstancesRef.current = sanitized
      setLineInstances(sanitized)
      saveWidgetLineInstances(panelId, sanitized)
      lineToolControllerRef.current?.sync()
      lineSeriesAttachmentRef.current?.update()
      return sanitized
    },
    [panelId],
  )

  const persistAnchoredVwapInstances = useCallback(
    (next: AnchoredVwapInstance[]) => {
      const sanitized = sanitizeAnchoredVwapInstances(next)
      anchoredVwapInstancesRef.current = sanitized
      setAnchoredVwapInstances(sanitized)
      saveWidgetAnchoredVwapInstances(panelId, sanitized)
      const chart = chartRef.current
      const bundle = seriesRef.current
      if (chart && bundle) {
        reconcileAnchoredVwapDrawingChartBundles(chart, bundle.anchoredVwaps, sanitized)
        syncAnchoredVwapDrawingInstancesVisibility(bundle, sanitized)
      }
      anchoredVwapSeriesAttachmentRef.current?.update()
      return sanitized
    },
    [panelId],
  )

  const handleRectangleArm = useCallback(() => {
    claimRectangleKeyboardPanel(panelId)
    if (rectangleArmClaimTimerRef.current !== null) {
      window.clearTimeout(rectangleArmClaimTimerRef.current)
    }
    // The portalled menu returns focus to the header trigger after this runs,
    // which releases the claim. Restore it once that focus move has settled.
    rectangleArmClaimTimerRef.current = window.setTimeout(() => {
      rectangleArmClaimTimerRef.current = null
      claimRectangleKeyboardPanel(panelId)
    }, 0)
    const releasedFrvp = releaseFixedRangeVolumeProfileInteractionForPeerTool(
      fixedRangeVolumeProfileInteractionRef.current,
    )
    if (releasedFrvp !== fixedRangeVolumeProfileInteractionRef.current) {
      fixedRangeVolumeProfileInteractionRef.current = releasedFrvp
      setFixedRangeVolumeProfileInteraction(releasedFrvp)
      fixedRangeVolumeProfileToolControllerRef.current?.sync()
      fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
    }
    const releasedLine = releaseLineInteractionForPeerTool(lineInteractionRef.current)
    if (releasedLine !== lineInteractionRef.current) {
      lineInteractionRef.current = releasedLine
      setLineInteraction(releasedLine)
      lineToolControllerRef.current?.sync()
      lineSeriesAttachmentRef.current?.update()
    }
    const releasedAnchored = releaseAnchoredVwapDrawingInteractionForPeerTool(
      anchoredVwapInteractionRef.current,
    )
    if (releasedAnchored !== anchoredVwapInteractionRef.current) {
      anchoredVwapInteractionRef.current = releasedAnchored
      setAnchoredVwapInteraction(releasedAnchored)
      anchoredVwapToolControllerRef.current?.sync()
      anchoredVwapSeriesAttachmentRef.current?.update()
    }
    const armed = armRectangleTool(rectangleInteractionRef.current)
    rectangleInteractionRef.current = armed
    setRectangleInteraction(armed)
    rectangleToolControllerRef.current?.sync()
    rectangleSeriesAttachmentRef.current?.update()
  }, [panelId])

  const handleRectangleDelete = useCallback(
    (instanceId: string) => {
      persistRectangleInstances(
        rectangleInstancesRef.current.filter((item) => item.id !== instanceId),
      )
    },
    [persistRectangleInstances],
  )

  const handleRectangleLockToggle = useCallback(
    (instanceId: string, locked: boolean) => {
      persistRectangleInstances(
        updateRectangleInstancesById(rectangleInstancesRef.current, instanceId, (instance) =>
          setRectangleInstanceLocked(instance, locked),
        ),
      )
    },
    [persistRectangleInstances],
  )

  const handleRectangleFillColorChange = useCallback(
    (instanceId: string, fillColor: string) => {
      persistRectangleInstances(
        updateRectangleInstancesById(rectangleInstancesRef.current, instanceId, (instance) =>
          setRectangleInstanceFillColor(instance, fillColor),
        ),
      )
    },
    [persistRectangleInstances],
  )

  const handleRectangleFillOpacityChange = useCallback(
    (instanceId: string, fillOpacity: number) => {
      persistRectangleInstances(
        updateRectangleInstancesById(rectangleInstancesRef.current, instanceId, (instance) =>
          setRectangleInstanceFillOpacity(instance, fillOpacity),
        ),
      )
    },
    [persistRectangleInstances],
  )

  const handleLineArm = useCallback(() => {
    claimRectangleKeyboardPanel(panelId)
    if (lineArmClaimTimerRef.current !== null) {
      window.clearTimeout(lineArmClaimTimerRef.current)
    }
    lineArmClaimTimerRef.current = window.setTimeout(() => {
      lineArmClaimTimerRef.current = null
      claimRectangleKeyboardPanel(panelId)
    }, 0)
    const releasedFrvp = releaseFixedRangeVolumeProfileInteractionForPeerTool(
      fixedRangeVolumeProfileInteractionRef.current,
    )
    if (releasedFrvp !== fixedRangeVolumeProfileInteractionRef.current) {
      fixedRangeVolumeProfileInteractionRef.current = releasedFrvp
      setFixedRangeVolumeProfileInteraction(releasedFrvp)
      fixedRangeVolumeProfileToolControllerRef.current?.sync()
      fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
    }
    const releasedRectangle = releaseRectangleInteractionForPeerTool(
      rectangleInteractionRef.current,
    )
    if (releasedRectangle !== rectangleInteractionRef.current) {
      rectangleInteractionRef.current = releasedRectangle
      setRectangleInteraction(releasedRectangle)
      rectangleToolControllerRef.current?.sync()
      rectangleSeriesAttachmentRef.current?.update()
    }
    const releasedAnchored = releaseAnchoredVwapDrawingInteractionForPeerTool(
      anchoredVwapInteractionRef.current,
    )
    if (releasedAnchored !== anchoredVwapInteractionRef.current) {
      anchoredVwapInteractionRef.current = releasedAnchored
      setAnchoredVwapInteraction(releasedAnchored)
      anchoredVwapToolControllerRef.current?.sync()
      anchoredVwapSeriesAttachmentRef.current?.update()
    }
    const armed = armLineTool(lineInteractionRef.current)
    lineInteractionRef.current = armed
    setLineInteraction(armed)
    lineToolControllerRef.current?.sync()
    lineSeriesAttachmentRef.current?.update()
  }, [panelId])

  const handleLineDelete = useCallback(
    (instanceId: string) => {
      persistLineInstances(lineInstancesRef.current.filter((item) => item.id !== instanceId))
    },
    [persistLineInstances],
  )

  const handleAnchoredVwapArm = useCallback(() => {
    claimRectangleKeyboardPanel(panelId)
    if (anchoredVwapArmClaimTimerRef.current !== null) {
      window.clearTimeout(anchoredVwapArmClaimTimerRef.current)
    }
    // The portalled menu returns focus to the header trigger after this runs,
    // which releases the claim. Restore it once that focus move has settled.
    anchoredVwapArmClaimTimerRef.current = window.setTimeout(() => {
      anchoredVwapArmClaimTimerRef.current = null
      claimRectangleKeyboardPanel(panelId)
    }, 0)
    const releasedFrvp = releaseFixedRangeVolumeProfileInteractionForPeerTool(
      fixedRangeVolumeProfileInteractionRef.current,
    )
    if (releasedFrvp !== fixedRangeVolumeProfileInteractionRef.current) {
      fixedRangeVolumeProfileInteractionRef.current = releasedFrvp
      setFixedRangeVolumeProfileInteraction(releasedFrvp)
      fixedRangeVolumeProfileToolControllerRef.current?.sync()
    }
    const releasedRectangle = releaseRectangleInteractionForPeerTool(rectangleInteractionRef.current)
    if (releasedRectangle !== rectangleInteractionRef.current) {
      rectangleInteractionRef.current = releasedRectangle
      setRectangleInteraction(releasedRectangle)
      rectangleToolControllerRef.current?.sync()
    }
    const releasedLine = releaseLineInteractionForPeerTool(lineInteractionRef.current)
    if (releasedLine !== lineInteractionRef.current) {
      lineInteractionRef.current = releasedLine
      setLineInteraction(releasedLine)
      lineToolControllerRef.current?.sync()
    }
    const armed = armAnchoredVwapDrawingTool(anchoredVwapInteractionRef.current)
    anchoredVwapInteractionRef.current = armed
    setAnchoredVwapInteraction(armed)
    anchoredVwapToolControllerRef.current?.sync()
    anchoredVwapSeriesAttachmentRef.current?.update()
  }, [panelId])

  const handleAnchoredVwapDelete = useCallback(
    (instanceId: string) => {
      persistAnchoredVwapInstances(
        anchoredVwapInstancesRef.current.filter((item) => item.id !== instanceId),
      )
    },
    [persistAnchoredVwapInstances],
  )

  const handleAnchoredVwapLockToggle = useCallback(
    (instanceId: string, locked: boolean) => {
      persistAnchoredVwapInstances(
        updateAnchoredVwapInstancesById(anchoredVwapInstancesRef.current, instanceId, (instance) =>
          setAnchoredVwapInstanceLocked(instance, locked),
        ),
      )
    },
    [persistAnchoredVwapInstances],
  )

  const handleAnchoredVwapVisibilityToggle = useCallback(
    (instanceId: string, hidden: boolean) => {
      persistAnchoredVwapInstances(
        updateAnchoredVwapInstancesById(anchoredVwapInstancesRef.current, instanceId, (instance) =>
          setAnchoredVwapInstanceHidden(instance, hidden),
        ),
      )
    },
    [persistAnchoredVwapInstances],
  )

  const handleAnchoredVwapSettingsSave = useCallback(
    (settings: ReturnType<typeof createDefaultAnchoredVwapDrawingSettings>) => {
      if (!editingAnchoredVwapInstanceId) return
      persistAnchoredVwapInstances(
        updateAnchoredVwapInstancesById(
          anchoredVwapInstancesRef.current,
          editingAnchoredVwapInstanceId,
          (instance) => ({ ...instance, settings }),
        ),
      )
    },
    [editingAnchoredVwapInstanceId, persistAnchoredVwapInstances],
  )

  const openChartObjectSettings = useCallback((target: ChartObjectSettingsTarget) => {
    setChartObjectSettingsTarget(target)
    if (target.kind === 'aggregated-liquidations') {
      setLiquidationsSettingsOpen(true)
      return
    }
    if (target.kind === 'rolling-vwap') {
      setEditingRollingVwapInstanceId(target.instanceId)
      setRollingVwapSettingsOpen(true)
      return
    }
    if (target.kind === 'anchored-vwap') {
      setEditingAnchoredVwapInstanceId(target.instanceId)
      setAnchoredVwapSettingsOpen(true)
      return
    }
    if (target.kind === 'market-indicator') {
      const presentation = loadWidgetMarketIndicatorPresentation(panelId, target.indicatorId)
      setEditingMarketIndicatorId(target.indicatorId)
      setMarketIndicatorPresentation(presentation)
      const bundle = seriesRef.current
      setEditingMarketIndicatorSeriesColors(
        bundle ? readMarketIndicatorSeriesColors(bundle, target.indicatorId) : [],
      )
      setEditingMarketIndicatorSeriesLineWidths(
        bundle ? readMarketIndicatorSeriesLineWidths(bundle, target.indicatorId) : [],
      )
      setEditingMarketIndicatorSeriesLineStyles(
        bundle ? readMarketIndicatorSeriesLineStyles(bundle, target.indicatorId) : [],
      )
      setEditingSessionVwapSeriesInputs(
        bundle
          ? readSessionVwapSeriesStyleInputs(bundle, target.indicatorId, presentation)
          : null,
      )
    }
  }, [panelId])

  const handleChartObjectSettingsTargetChange = useCallback(
    (target: ChartObjectSettingsTarget | null) => {
      if (target === null) {
        setChartObjectSettingsTarget(null)
        return
      }
      openChartObjectSettings(target)
    },
    [openChartObjectSettings],
  )

  const handleRectangleVisibilityToggle = useCallback(
    (instanceId: string, hidden: boolean) => {
      persistRectangleInstances(
        updateRectangleInstancesById(rectangleInstancesRef.current, instanceId, (instance) =>
          setRectangleInstanceHidden(instance, hidden),
        ),
      )
    },
    [persistRectangleInstances],
  )

  const handleLineLockToggle = useCallback(
    (instanceId: string, locked: boolean) => {
      persistLineInstances(
        updateLineInstancesById(lineInstancesRef.current, instanceId, (instance) =>
          setLineInstanceLocked(instance, locked),
        ),
      )
    },
    [persistLineInstances],
  )

  const handleLineVisibilityToggle = useCallback(
    (instanceId: string, hidden: boolean) => {
      persistLineInstances(
        updateLineInstancesById(lineInstancesRef.current, instanceId, (instance) =>
          setLineInstanceHidden(instance, hidden),
        ),
      )
    },
    [persistLineInstances],
  )

  const handleLineStrokeColorChange = useCallback(
    (instanceId: string, strokeColor: string) => {
      persistLineInstances(
        updateLineInstancesById(lineInstancesRef.current, instanceId, (instance) =>
          setLineInstanceStrokeColor(instance, strokeColor),
        ),
      )
    },
    [persistLineInstances],
  )

  const handleLineStrokeOpacityChange = useCallback(
    (instanceId: string, strokeOpacity: number) => {
      persistLineInstances(
        updateLineInstancesById(lineInstancesRef.current, instanceId, (instance) =>
          setLineInstanceStrokeOpacity(instance, strokeOpacity),
        ),
      )
    },
    [persistLineInstances],
  )

  const handleLineWidthChange = useCallback(
    (instanceId: string, lineWidth: LineChartStrokeWidth) => {
      persistLineInstances(
        updateLineInstancesById(lineInstancesRef.current, instanceId, (instance) =>
          setLineInstanceStrokeWidth(instance, lineWidth),
        ),
      )
    },
    [persistLineInstances],
  )

  const handleLineStyleChange = useCallback(
    (instanceId: string, lineStyle: LineChartStrokeStyle) => {
      persistLineInstances(
        updateLineInstancesById(lineInstancesRef.current, instanceId, (instance) =>
          setLineInstanceStrokeStyle(instance, lineStyle),
        ),
      )
    },
    [persistLineInstances],
  )

  const handleFixedRangeVolumeProfileToggle = useCallback(
    (instanceId: string, enabled: boolean) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => setFixedRangeVolumeProfileInstanceEnabled(instance, enabled),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileLockToggle = useCallback(
    (instanceId: string, locked: boolean) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => setFixedRangeVolumeProfileInstanceLocked(instance, locked),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileRowCountChange = useCallback(
    (instanceId: string, rowCount: number) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => ({ ...instance, rowCount }),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileValueAreaChange = useCallback(
    (instanceId: string, valueAreaPercent: number) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => ({ ...instance, valueAreaPercent }),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileExtendRightChange = useCallback(
    (instanceId: string, extendRight: boolean) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => setFixedRangeVolumeProfileInstanceExtendRight(instance, extendRight),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileLevelStrokeColorChange = useCallback(
    (instanceId: string, kind: FrvpLevelLineKind, strokeColor: string) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => setFrvpInstanceLevelStrokeColor(instance, kind, strokeColor),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileLevelLineWidthChange = useCallback(
    (instanceId: string, kind: FrvpLevelLineKind, lineWidth: LineChartStrokeWidth) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => setFrvpInstanceLevelLineWidth(instance, kind, lineWidth),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileLevelLineStyleChange = useCallback(
    (instanceId: string, kind: FrvpLevelLineKind, lineStyle: LineChartStrokeStyle) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => setFrvpInstanceLevelLineStyle(instance, kind, lineStyle),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileLevelStrokeOpacityChange = useCallback(
    (instanceId: string, kind: FrvpLevelLineKind, opacityPercent: number) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) =>
            setFrvpInstanceLevelStrokeOpacityPercent(instance, kind, opacityPercent),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileHistogramColorChange = useCallback(
    (instanceId: string, direction: FrvpHistogramDirection, color: string) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => setFrvpInstanceHistogramColor(instance, direction, color),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileHistogramOpacityChange = useCallback(
    (instanceId: string, direction: FrvpHistogramDirection, opacityPercent: number) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) =>
            setFrvpInstanceHistogramOpacityPercent(instance, direction, opacityPercent),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileHistogramWidthChange = useCallback(
    (instanceId: string, widthPercent: number) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) => setFrvpInstanceHistogramWidthPercent(instance, widthPercent),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleFixedRangeVolumeProfileHistogramBarHeightChange = useCallback(
    (instanceId: string, barHeightPercent: number) => {
      persistFixedRangeVolumeProfileInstances(
        updateFixedRangeVolumeProfileInstancesById(
          fixedRangeVolumeProfileInstancesRef.current,
          instanceId,
          (instance) =>
            setFrvpInstanceHistogramBarHeightPercent(instance, barHeightPercent),
        ),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const handleMarketIndicatorSettingsClick = useCallback(
    (indicatorId: MarketIndicatorId) => {
      if (indicatorId === 'aggregated-liquidations') {
        openChartObjectSettings({ kind: 'aggregated-liquidations' })
        return
      }
      openChartObjectSettings({ kind: 'market-indicator', indicatorId })
    },
    [openChartObjectSettings],
  )

  const handleLiquidationSettingsChange = useCallback(
    (next: AggregatedLiquidationsSettings) => {
      saveWidgetLiquidationsSettings(panelId, next)
      setLiquidationSettings(next)
    },
    [panelId],
  )

  const handleMarketIndicatorPresentationChange = useCallback(
    (indicatorId: MarketIndicatorId, presentation: MarketIndicatorPresentation) => {
      setMarketIndicatorPresentation(presentation)
      saveWidgetMarketIndicatorPresentation(panelId, indicatorId, presentation)
      const bundle = seriesRef.current
      if (bundle) {
        applyMarketIndicatorPresentationToBundle(bundle, indicatorId, presentation)
      }
    },
    [panelId],
  )

  const handleFixedRangeVolumeProfileArm = useCallback(() => {
    claimRectangleKeyboardPanel(panelId)
    if (frvpArmClaimTimerRef.current !== null) {
      window.clearTimeout(frvpArmClaimTimerRef.current)
    }
    // The portalled menu returns focus to the header trigger after this runs,
    // which releases the claim. Restore it once that focus move has settled.
    frvpArmClaimTimerRef.current = window.setTimeout(() => {
      frvpArmClaimTimerRef.current = null
      claimRectangleKeyboardPanel(panelId)
    }, 0)
    const releasedRectangle = releaseRectangleInteractionForPeerTool(
      rectangleInteractionRef.current,
    )
    if (releasedRectangle !== rectangleInteractionRef.current) {
      rectangleInteractionRef.current = releasedRectangle
      setRectangleInteraction(releasedRectangle)
      rectangleToolControllerRef.current?.sync()
      rectangleSeriesAttachmentRef.current?.update()
    }
    const releasedLine = releaseLineInteractionForPeerTool(lineInteractionRef.current)
    if (releasedLine !== lineInteractionRef.current) {
      lineInteractionRef.current = releasedLine
      setLineInteraction(releasedLine)
      lineToolControllerRef.current?.sync()
      lineSeriesAttachmentRef.current?.update()
    }
    const releasedAnchored = releaseAnchoredVwapDrawingInteractionForPeerTool(
      anchoredVwapInteractionRef.current,
    )
    if (releasedAnchored !== anchoredVwapInteractionRef.current) {
      anchoredVwapInteractionRef.current = releasedAnchored
      setAnchoredVwapInteraction(releasedAnchored)
      anchoredVwapToolControllerRef.current?.sync()
      anchoredVwapSeriesAttachmentRef.current?.update()
    }
    const armed = armFixedRangeVolumeProfileTool()
    fixedRangeVolumeProfileInteractionRef.current = armed
    setFixedRangeVolumeProfileInteraction(armed)
    fixedRangeVolumeProfileToolControllerRef.current?.sync()
  }, [panelId])

  const handleFixedRangeVolumeProfileDelete = useCallback(
    (instanceId: string) => {
      persistFixedRangeVolumeProfileInstances(
        fixedRangeVolumeProfileInstancesRef.current.filter((item) => item.id !== instanceId),
      )
    },
    [persistFixedRangeVolumeProfileInstances],
  )

  const persistRollingVwapInstances = useCallback(
    (next: RollingVwapInstance[]) => {
      const sanitized = persistRollingVwapPanelInstances(next)
      rollingVwapInstancesRef.current = sanitized
      setRollingVwapInstances(sanitized)
      saveWidgetRollingVwapInstances(panelId, sanitized)
      return sanitized
    },
    [panelId],
  )

  const handleRollingVwapLockToggle = useCallback(
    (instanceId: string, locked: boolean) => {
      persistRollingVwapInstances(
        updateRollingVwapInstance(rollingVwapInstancesRef.current, instanceId, { locked }),
      )
    },
    [persistRollingVwapInstances],
  )

  const syncAllVwapVisibility = useCallback((bundle: ChartSeriesBundle) => {
    const loaded = loadedVwapContextRef.current
    syncVwapSeriesVisibility(bundle, {
      activeIndicators: activeIndicatorsRef.current,
      interval: activeIntervalRef.current,
      loadedLevel: loaded?.interval === activeIntervalRef.current ? loaded.level : null,
      loadedInterval: loaded?.interval ?? null,
      rollingVwapInstances: rollingVwapInstancesRef.current,
    })
  }, [])

  const handleRollingVwapAdd = useCallback(() => {
    const next = persistRollingVwapInstances(
      addDefaultRollingVwapPanelInstance(rollingVwapInstancesRef.current),
    )
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (chart && bundle) {
      reconcileRollingVwapChartBundles(
        chart,
        bundle.rollingVwaps,
        next,
        activeIntervalRef.current,
      )
      const created = next[next.length - 1]
      if (created && candlesRef.current.length > 0) {
        applyRollingVwapInstanceHistory(bundle, candlesRef.current, created)
      }
      syncAllVwapVisibility(bundle)
    }
  }, [persistRollingVwapInstances, syncAllVwapVisibility])

  const handleRollingVwapToggle = useCallback(
    (instanceId: string, enabled: boolean) => {
      persistRollingVwapInstances(
        toggleRollingVwapPanelInstance(rollingVwapInstancesRef.current, instanceId, enabled),
      )
      const bundle = seriesRef.current
      if (bundle) syncAllVwapVisibility(bundle)
    },
    [persistRollingVwapInstances, syncAllVwapVisibility],
  )

  const handleRollingVwapDelete = useCallback(
    (instanceId: string) => {
      const chart = chartRef.current
      const bundle = seriesRef.current
      const next = persistRollingVwapInstances(
        deleteRollingVwapPanelInstance(rollingVwapInstancesRef.current, instanceId),
      )
      if (chart && bundle) {
        reconcileRollingVwapChartBundles(
          chart,
          bundle.rollingVwaps,
          next,
          activeIntervalRef.current,
        )
      }
    },
    [persistRollingVwapInstances],
  )

  const handleRollingVwapSettingsClick = useCallback(
    (instanceId: string) => {
      openChartObjectSettings({ kind: 'rolling-vwap', instanceId })
    },
    [openChartObjectSettings],
  )

  const handleRollingVwapSettingsSave = useCallback(
    (nextSettings: ReturnType<typeof createDefaultRollingVwapSettings>) => {
      const instanceId = editingRollingVwapInstanceId
      if (!instanceId) return
      const next = persistRollingVwapInstances(
        saveRollingVwapPanelInstanceSettings(
          rollingVwapInstancesRef.current,
          instanceId,
          nextSettings,
        ),
      )
      const bundle = seriesRef.current
      const instance = findRollingVwapInstance(next, instanceId)
      const chartBundle = bundle?.rollingVwaps.get(instanceId)
      if (bundle && instance && chartBundle) {
        applyRollingVwapInstanceSettingsToChart(
          chartBundle,
          instance,
          activeIntervalRef.current,
        )
        applyRollingVwapInstanceHistory(bundle, candlesRef.current, instance)
      }
      setEditingRollingVwapInstanceId(null)
    },
    [editingRollingVwapInstanceId, persistRollingVwapInstances],
  )

  const liveVwapContext = useCallback(() => {
    const loaded = loadedVwapContextRef.current
    return {
      interval: activeIntervalRef.current,
      activeIndicators: activeIndicatorsRef.current,
      loadedLevel:
        loaded?.interval === activeIntervalRef.current ? loaded.level : null,
      loadedInterval: loaded?.interval ?? null,
    }
  }, [])

  /**
   * Which indicator series this panel shows right now. Read at apply time by
   * every history path (initial load, VWAP context, older pages, preload) so a
   * toggle made while a page is in flight never applies a stale plan.
   */
  const currentIndicatorSeriesPlan = useCallback(
    () =>
      resolveChartIndicatorSeriesPlan({
        activeIndicators: activeIndicatorsRef.current,
        interval: activeIntervalRef.current,
      }),
    [],
  )

  const handleMarketIndicatorsChange = useCallback(
    (next: MarketIndicatorId[]) => {
      saveWidgetMarketIndicators(panelId, next)
      if (!next.includes('aggregated-liquidations')) {
        setLiquidationEvents([])
      }
      setActiveIndicators(next)
    },
    [panelId],
  )

  /**
   * Create or remove the RSI pane to match the indicator selection. The pane is
   * created through its own `IPaneApi` reference, so removing it never relies on
   * a fixed pane index and leaves candles/other overlays untouched.
   */
  const syncRsiPane = useCallback(
    (chart: IChartApi, bundle: ChartSeriesBundle) => {
      const shouldShow =
        activeIndicatorsRef.current.includes('rsi') &&
        isIndicatorSupportedOnInterval('rsi', activeIntervalRef.current)
      if (!shouldShow) {
        if (bundle.rsi) {
          // Remember the current share (default or user-dragged) before the pane
          // is destroyed: `createRsiChartPane` restores it on re-add.
          rsiPaneHeightShareRef.current =
            rsiPaneHeightShare(chart, bundle.rsi.pane) ??
            rsiPaneHeightShareRef.current
          removeRsiChartPane(chart, bundle.rsi)
          bundle.rsi = null
        }
        return
      }
      if (bundle.rsi) return
      bundle.rsi = createRsiChartPane(
        chart,
        rsiSettingsRef.current,
        rsiPaneHeightShareRef.current,
      )
      // A new pane is appended after every existing pane, which would leave the
      // `Position: Bottom` liquidations pane above it. Move the RSI pane above
      // that pane so `Bottom` keeps meaning the last pane.
      const liquidationOverlay = liquidationOverlayRef.current
      if (liquidationOverlay?.getPosition() === 'bottom') {
        moveRsiPaneAbove(bundle.rsi, liquidationOverlay.getPaneIndex())
      }
      applyMarketIndicatorPresentationToBundle(
        bundle,
        'rsi',
        loadWidgetMarketIndicatorPresentation(panelId, 'rsi'),
      )
      setRsiPaneHistoryData(bundle.rsi, candlesRef.current)
    },
    [panelId],
  )

  const handleRsiSettingsChange = useCallback(
    (next: RsiSettings) => {
      const sanitized = sanitizeRsiSettings(next)
      rsiSettingsRef.current = sanitized
      setRsiSettings(sanitized)
      saveWidgetRsiSettings(panelId, sanitized)
      const bundle = seriesRef.current
      if (!bundle?.rsi) return
      applyRsiPaneSettings(bundle.rsi, sanitized)
      setRsiPaneHistoryData(bundle.rsi, candlesRef.current)
    },
    [panelId],
  )

  const handleIntervalChange = useCallback(
    (next: CandleInterval) => {
      // Re-selecting the active interval must not mark the chart as not-ready:
      // the load effect is keyed on [exchange, interval] and would not run again.
      if (
        !isMarketChartSelectionChange(
          { exchange: activeExchangeRef.current, interval: activeIntervalRef.current },
          { interval: next },
        )
      ) {
        return
      }

      const cancelled = cancelFixedRangeVolumeProfileInteraction(
        fixedRangeVolumeProfileInteractionRef.current,
      )
      if (cancelled !== fixedRangeVolumeProfileInteractionRef.current) {
        fixedRangeVolumeProfileInteractionRef.current = cancelled
        setFixedRangeVolumeProfileInteraction(cancelled)
        fixedRangeVolumeProfileToolControllerRef.current?.sync()
      }
      const cancelledRectangle = cancelRectangleInteraction(rectangleInteractionRef.current)
      if (cancelledRectangle !== rectangleInteractionRef.current) {
        rectangleInteractionRef.current = cancelledRectangle
        setRectangleInteraction(cancelledRectangle)
        rectanglePointerPreviewRef.current = { pointerTime: null, pointerPrice: null }
        rectangleToolControllerRef.current?.sync()
        rectangleSeriesAttachmentRef.current?.update()
      }
      const cancelledLine = cancelLineInteraction(lineInteractionRef.current)
      if (cancelledLine !== lineInteractionRef.current) {
        lineInteractionRef.current = cancelledLine
        setLineInteraction(cancelledLine)
        linePointerPreviewRef.current = { pointerTime: null, pointerPrice: null }
        lineToolControllerRef.current?.sync()
        lineSeriesAttachmentRef.current?.update()
      }
      const cancelledAnchored = cancelAnchoredVwapDrawingInteraction(
        anchoredVwapInteractionRef.current,
      )
      if (cancelledAnchored !== anchoredVwapInteractionRef.current) {
        anchoredVwapInteractionRef.current = cancelledAnchored
        setAnchoredVwapInteraction(cancelledAnchored)
        anchoredVwapSeriesAttachmentRef.current?.update()
      }
      saveWidgetMarketInterval(panelId, next)
      clearHoveredAccountFills()
      setDataState({ status: 'loading' })
      setChartReady(false)
      setStreamState('idle')
      setInterval(next)
    },
    [clearHoveredAccountFills, panelId],
  )

  const handleExchangeChange = useCallback(
    (next: MarketExchange) => {
      // Re-selecting the active provider must not mark the chart as not-ready.
      if (
        !isMarketChartSelectionChange(
          { exchange: activeExchangeRef.current, interval: activeIntervalRef.current },
          { exchange: next },
        )
      ) {
        return
      }

      // Invalidate and stop every old-provider request/stream before the new
      // provider state is rendered; stale responses are dropped by generation.
      saveWidgetMarketExchange(panelId, next)
      activeExchangeRef.current = next
      loadGenerationRef.current += 1
      historyReadyRef.current = false
      loadedVwapContextRef.current = null
      providerHistoryAvailableFromRef.current = null
      cancelActiveVwapContextRequest(
        vwapContextAbortRef,
        vwapContextLatestRequestIdRef,
      )
      indicatorHistoryAbortRef.current?.abort()
      indicatorHistoryAbortRef.current = null
      abortRef.current?.abort()
      abortRef.current = null
      stopKlineStream()

      setDataState({ status: 'loading' })
      setChartReady(false)
      setStreamState('idle')
      setIndicatorHistoryNotices([])
      accountFillsRangeRef.current = null
      clearAccountFills()
      clearHoveredAccountFills()
      setExchange(next)
    },
    [clearAccountFills, clearHoveredAccountFills, panelId, stopKlineStream],
  )

  const persistPositionMarkerSettings = useCallback(
    (next: PositionMarkerSettings) => {
      const sanitized = sanitizePositionMarkerSettings(next)
      positionMarkerSettingsRef.current = sanitized
      saveWidgetMarketPositionMarkerSettings(panelId, sanitized)
      setPositionMarkerSettings(sanitized)
      if (sanitized.enabled) return
      // Markers are OFF: drop the fills that only exist to render them.
      accountFillsRangeRef.current = null
      clearAccountFills()
      clearHoveredAccountFills()
    },
    [clearAccountFills, clearHoveredAccountFills, panelId],
  )

  const handlePositionMarkersChange = useCallback(
    (enabled: boolean) => {
      persistPositionMarkerSettings({ ...positionMarkerSettingsRef.current, enabled })
    },
    [persistPositionMarkerSettings],
  )

  const handlePositionMarkerSettingsChange = useCallback(
    (next: PositionMarkerSettings) => {
      persistPositionMarkerSettings(next)
    },
    [persistPositionMarkerSettings],
  )

  const handlePositionMarkersSettingsClick = useCallback(() => {
    setPositionMarkerSettingsOpen(true)
  }, [])

  useMarketWidgetSettings({
    headerSettings,
    panelId,
    marketExchange: exchange,
    onMarketExchangeChange: handleExchangeChange,
    marketInterval: interval,
    onMarketIntervalChange: handleIntervalChange,
    marketIndicators: activeIndicators,
    onMarketIndicatorsChange: handleMarketIndicatorsChange,
    marketPositionMarkersEnabled: positionMarkersEnabled,
    onMarketPositionMarkersChange: handlePositionMarkersChange,
    onMarketPositionMarkersSettingsClick: handlePositionMarkersSettingsClick,
    rollingVwapInstances,
    onRollingVwapAdd: handleRollingVwapAdd,
    onRollingVwapToggle: handleRollingVwapToggle,
    onRollingVwapSettingsClick: handleRollingVwapSettingsClick,
    onRollingVwapDelete: handleRollingVwapDelete,
    onRollingVwapLockToggle: handleRollingVwapLockToggle,
    onMarketIndicatorSettingsClick: handleMarketIndicatorSettingsClick,
    fixedRangeVolumeProfileInstances,
    onFixedRangeVolumeProfileArm: handleFixedRangeVolumeProfileArm,
    onFixedRangeVolumeProfileDelete: handleFixedRangeVolumeProfileDelete,
    onFixedRangeVolumeProfileToggle: handleFixedRangeVolumeProfileToggle,
    onFixedRangeVolumeProfileLockToggle: handleFixedRangeVolumeProfileLockToggle,
    rectangleInstances,
    onRectangleArm: handleRectangleArm,
    onRectangleDelete: handleRectangleDelete,
    onRectangleLockToggle: handleRectangleLockToggle,
    onRectangleVisibilityToggle: handleRectangleVisibilityToggle,
    onRectangleFillColorChange: handleRectangleFillColorChange,
    onRectangleFillOpacityChange: handleRectangleFillOpacityChange,
    lineInstances,
    onLineArm: handleLineArm,
    onLineDelete: handleLineDelete,
    onLineLockToggle: handleLineLockToggle,
    onLineVisibilityToggle: handleLineVisibilityToggle,
    onLineStrokeColorChange: handleLineStrokeColorChange,
    onLineStrokeOpacityChange: handleLineStrokeOpacityChange,
    onLineWidthChange: handleLineWidthChange,
    onLineStyleChange: handleLineStyleChange,
    anchoredVwapInstances,
    onAnchoredVwapArm: handleAnchoredVwapArm,
    onAnchoredVwapDelete: handleAnchoredVwapDelete,
    onAnchoredVwapLockToggle: handleAnchoredVwapLockToggle,
    onAnchoredVwapVisibilityToggle: handleAnchoredVwapVisibilityToggle,
    chartObjectSettingsTarget,
    onChartObjectSettingsTargetChange: handleChartObjectSettingsTargetChange,
    disabled: !chartReady && dataState.status === 'loading',
  })

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const controller = attachFixedRangeVolumeProfileChartTool(chart, {
      getSnapshot: () => ({
        interaction: fixedRangeVolumeProfileInteractionRef.current,
        instances: fixedRangeVolumeProfileInstancesRef.current,
        runtimeById: fixedRangeVolumeProfileRuntimeRef.current,
      }),
      getSelectionInterval: () => activeIntervalRef.current,
      getIntervalDurationSeconds: () =>
        candleIntervalDurationSeconds(activeIntervalRef.current),
      getLastBarUnixTime: () => latestCandleUnixTime(candlesRef.current),
      getSeries: () => seriesRef.current?.candle ?? null,
      isAlternateToolActive: () =>
        isRectangleDrawingBlockingPeerTools(rectangleInteractionRef.current) ||
        isLineDrawingBlockingPeerTools(lineInteractionRef.current) ||
        isAnchoredVwapDrawingBlockingPeerTools(anchoredVwapInteractionRef.current),
      getLineInteraction: () => lineInteractionRef.current,
      getLineInstances: () => lineInstancesRef.current,
      getRectangleInteraction: () => rectangleInteractionRef.current,
      getRectangleInstances: () => rectangleInstancesRef.current,
      onInteractionChange: (state) => {
        fixedRangeVolumeProfileInteractionRef.current = state
        setFixedRangeVolumeProfileInteraction(state)
        fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
      },
      onExclusivePointerClaim: () => {
        const peers = clearLineAndRectangleSelectionForFrvpClaim(
          lineInteractionRef.current,
          rectangleInteractionRef.current,
        )
        if (peers.line !== lineInteractionRef.current) {
          lineInteractionRef.current = peers.line
          setLineInteraction(peers.line)
          lineToolControllerRef.current?.sync()
          lineSeriesAttachmentRef.current?.update()
        }
        if (peers.rectangle !== rectangleInteractionRef.current) {
          rectangleInteractionRef.current = peers.rectangle
          setRectangleInteraction(peers.rectangle)
          rectangleToolControllerRef.current?.sync()
          rectangleSeriesAttachmentRef.current?.update()
        }
      },
      onInstanceCompleted: (instance) => {
        persistFixedRangeVolumeProfileInstances([
          ...fixedRangeVolumeProfileInstancesRef.current,
          instance,
        ])
      },
      onInstanceUpdated: (instance) => {
        persistFixedRangeVolumeProfileInstances(
          fixedRangeVolumeProfileInstancesRef.current.map((item) =>
            item.id === instance.id ? instance : item,
          ),
        )
      },
      onRequestRender: () => {
        fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
      },
      onInstancesChange: (instances) => {
        persistFixedRangeVolumeProfileInstances([...instances])
      },
      shouldHandleKeyboardShortcut: () => isActiveRectangleKeyboardPanel(panelId),
      getAnchoredVwapDrawingInteraction: () => anchoredVwapInteractionRef.current,
      getAnchoredVwapInstances: () => anchoredVwapInstancesRef.current,
      getAnchoredVwapCandles: () => candlesRef.current,
    })
    fixedRangeVolumeProfileToolControllerRef.current = controller
    controller.sync()
    return () => {
      controller.dispose()
      fixedRangeVolumeProfileToolControllerRef.current = null
    }
  }, [chartReady, panelId, persistFixedRangeVolumeProfileInstances])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const controller = attachRectangleChartTool(chart, {
      getSnapshot: () => ({
        interaction: rectangleInteractionRef.current,
        instances: rectangleInstancesRef.current,
      }),
      getPointerPreview: () => rectanglePointerPreviewRef.current,
      setPointerPreview: (pointerTime, pointerPrice) => {
        rectanglePointerPreviewRef.current = { pointerTime, pointerPrice }
      },
      onInteractionChange: (state) => {
        const next = withExclusiveRectangleSelection(
          state,
          lineInteractionRef.current,
          fixedRangeVolumeProfileInteractionRef.current,
        )
        rectangleInteractionRef.current = next.rectangle
        setRectangleInteraction(next.rectangle)
        if (next.line !== lineInteractionRef.current) {
          lineInteractionRef.current = next.line
          setLineInteraction(next.line)
          lineToolControllerRef.current?.sync()
          lineSeriesAttachmentRef.current?.update()
        }
        if (next.frvp !== fixedRangeVolumeProfileInteractionRef.current) {
          fixedRangeVolumeProfileInteractionRef.current = next.frvp
          setFixedRangeVolumeProfileInteraction(next.frvp)
          fixedRangeVolumeProfileToolControllerRef.current?.sync()
          fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
        }
      },
      onInstancesChange: (instances) => {
        persistRectangleInstances(instances)
      },
      onInstanceCompleted: (instance) => {
        persistRectangleInstances([...rectangleInstancesRef.current, instance])
      },
      onInstanceUpdated: (instance) => {
        persistRectangleInstances(
          rectangleInstancesRef.current.map((item) =>
            item.id === instance.id ? instance : item,
          ),
        )
      },
      onRequestRender: () => {
        rectangleSeriesAttachmentRef.current?.update()
      },
      getChart: () => chartRef.current,
      getSeries: () => seriesRef.current?.candle ?? null,
      getIntervalDurationSeconds: () =>
        candleIntervalDurationSeconds(activeIntervalRef.current),
      getLastBarUnixTime: () => latestCandleUnixTime(candlesRef.current),
      getFixedRangeVolumeProfileInteraction: () =>
        fixedRangeVolumeProfileInteractionRef.current,
      getLineInteraction: () => lineInteractionRef.current,
      getLineInstances: () => lineInstancesRef.current,
      getFixedRangeVolumeProfileInstances: () => fixedRangeVolumeProfileInstancesRef.current,
      getFixedRangeVolumeProfileRuntime: () => fixedRangeVolumeProfileRuntimeRef.current,
      getAnchoredVwapDrawingInteraction: () => anchoredVwapInteractionRef.current,
      getAnchoredVwapInstances: () => anchoredVwapInstancesRef.current,
      getAnchoredVwapCandles: () => candlesRef.current,
      shouldHandleKeyboardShortcut: () => isActiveRectangleKeyboardPanel(panelId),
    })
    rectangleToolControllerRef.current = controller
    controller.sync()
    return () => {
      controller.dispose()
      rectangleToolControllerRef.current = null
    }
  }, [chartReady, panelId, persistRectangleInstances])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const controller = attachLineChartTool(chart, {
      getSnapshot: () => ({
        interaction: lineInteractionRef.current,
        instances: lineInstancesRef.current,
      }),
      getPointerPreview: () => linePointerPreviewRef.current,
      setPointerPreview: (pointerTime, pointerPrice) => {
        linePointerPreviewRef.current = { pointerTime, pointerPrice }
      },
      onInteractionChange: (state) => {
        const next = withExclusiveLineSelection(
          state,
          rectangleInteractionRef.current,
          fixedRangeVolumeProfileInteractionRef.current,
        )
        lineInteractionRef.current = next.line
        setLineInteraction(next.line)
        if (next.rectangle !== rectangleInteractionRef.current) {
          rectangleInteractionRef.current = next.rectangle
          setRectangleInteraction(next.rectangle)
          rectangleToolControllerRef.current?.sync()
          rectangleSeriesAttachmentRef.current?.update()
        }
        if (next.frvp !== fixedRangeVolumeProfileInteractionRef.current) {
          fixedRangeVolumeProfileInteractionRef.current = next.frvp
          setFixedRangeVolumeProfileInteraction(next.frvp)
          fixedRangeVolumeProfileToolControllerRef.current?.sync()
          fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
        }
      },
      onInstancesChange: (instances) => {
        persistLineInstances(instances)
      },
      onInstanceCompleted: (instance) => {
        persistLineInstances([...lineInstancesRef.current, instance])
      },
      onInstanceUpdated: (instance) => {
        persistLineInstances(
          lineInstancesRef.current.map((item) => (item.id === instance.id ? instance : item)),
        )
      },
      onRequestRender: () => {
        lineSeriesAttachmentRef.current?.update()
      },
      getChart: () => chartRef.current,
      getSeries: () => seriesRef.current?.candle ?? null,
      getIntervalDurationSeconds: () =>
        candleIntervalDurationSeconds(activeIntervalRef.current),
      getLastBarUnixTime: () => latestCandleUnixTime(candlesRef.current),
      getFixedRangeVolumeProfileInteraction: () =>
        fixedRangeVolumeProfileInteractionRef.current,
      getRectangleInteraction: () => rectangleInteractionRef.current,
      getRectangleInstances: () => rectangleInstancesRef.current,
      getFixedRangeVolumeProfileInstances: () => fixedRangeVolumeProfileInstancesRef.current,
      getFixedRangeVolumeProfileRuntime: () => fixedRangeVolumeProfileRuntimeRef.current,
      getAnchoredVwapDrawingInteraction: () => anchoredVwapInteractionRef.current,
      getAnchoredVwapInstances: () => anchoredVwapInstancesRef.current,
      getAnchoredVwapCandles: () => candlesRef.current,
      shouldHandleKeyboardShortcut: () => isActiveRectangleKeyboardPanel(panelId),
    })
    lineToolControllerRef.current = controller
    controller.sync()
    return () => {
      controller.dispose()
      lineToolControllerRef.current = null
    }
  }, [chartReady, panelId, persistLineInstances])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const controller = attachAnchoredVwapDrawingChartTool(chart, {
      getSnapshot: () => ({
        interaction: anchoredVwapInteractionRef.current,
        instances: anchoredVwapInstancesRef.current,
        candles: candlesRef.current,
      }),
      onInteractionChange: (state) => {
        anchoredVwapInteractionRef.current = state
        setAnchoredVwapInteraction(state)
        if (state.selectedId !== null) {
          const clearedLine = applyLineSelection(lineInteractionRef.current, null)
          if (clearedLine !== lineInteractionRef.current) {
            lineInteractionRef.current = clearedLine
            setLineInteraction(clearedLine)
            lineSeriesAttachmentRef.current?.update()
          }
          const clearedRectangle = applyRectangleSelection(rectangleInteractionRef.current, null)
          if (clearedRectangle !== rectangleInteractionRef.current) {
            rectangleInteractionRef.current = clearedRectangle
            setRectangleInteraction(clearedRectangle)
            rectangleSeriesAttachmentRef.current?.update()
          }
          const clearedFrvp = clearFixedRangeVolumeProfileSelectionForPeerClaim(
            fixedRangeVolumeProfileInteractionRef.current,
          )
          if (clearedFrvp !== fixedRangeVolumeProfileInteractionRef.current) {
            fixedRangeVolumeProfileInteractionRef.current = clearedFrvp
            setFixedRangeVolumeProfileInteraction(clearedFrvp)
            fixedRangeVolumeProfileToolControllerRef.current?.sync()
            fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
          }
        }
        anchoredVwapSeriesAttachmentRef.current?.update()
      },
      onInstancesChange: (instances) => {
        persistAnchoredVwapInstances(instances)
      },
      onInstanceUpdated: (instance) => {
        persistAnchoredVwapInstances(
          anchoredVwapInstancesRef.current.map((item) =>
            item.id === instance.id ? instance : item,
          ),
        )
      },
      onRequestRender: () => {
        anchoredVwapSeriesAttachmentRef.current?.update()
      },
      getChart: () => chartRef.current,
      getSeries: () => seriesRef.current?.candle ?? null,
      getIntervalDurationSeconds: () =>
        candleIntervalDurationSeconds(activeIntervalRef.current),
      getLastBarUnixTime: () => latestCandleUnixTime(candlesRef.current),
      getLineInteraction: () => lineInteractionRef.current,
      getRectangleInteraction: () => rectangleInteractionRef.current,
      getFixedRangeVolumeProfileInteraction: () =>
        fixedRangeVolumeProfileInteractionRef.current,
      getLineInstances: () => lineInstancesRef.current,
      getRectangleInstances: () => rectangleInstancesRef.current,
      getFixedRangeVolumeProfileInstances: () => fixedRangeVolumeProfileInstancesRef.current,
      getFixedRangeVolumeProfileRuntime: () => fixedRangeVolumeProfileRuntimeRef.current,
      isAlternateToolActive: () =>
        isFixedRangeVolumeProfileChartInteractionLocked(
          fixedRangeVolumeProfileInteractionRef.current,
        ) ||
        isRectangleDrawingBlockingPeerTools(rectangleInteractionRef.current) ||
        isLineDrawingBlockingPeerTools(lineInteractionRef.current),
      shouldHandleKeyboardShortcut: () => isActiveRectangleKeyboardPanel(panelId),
    })
    anchoredVwapToolControllerRef.current = controller
    controller.sync()
    return () => {
      controller.dispose()
      anchoredVwapToolControllerRef.current = null
    }
  }, [chartReady, panelId, persistAnchoredVwapInstances])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const controller = attachChartObjectSettingsPanePointer(chart, {
      getHitTestContext: (paneX, paneY, paneRole) => {
        const bundle = seriesRef.current
        const candleSeries = bundle?.candle
        if (!bundle || !candleSeries) return null
        const loaded = loadedVwapContextRef.current
        return {
          chart,
          series: candleSeries,
          paneRole,
          paneX,
          paneY,
          interval: activeIntervalRef.current,
          intervalDurationSeconds: candleIntervalDurationSeconds(activeIntervalRef.current),
          lastBarUnixTime: latestCandleUnixTime(candlesRef.current),
          activeIndicators: activeIndicatorsRef.current,
          loadedVwapLevel:
            loaded?.interval === activeIntervalRef.current ? loaded.level : null,
          loadedVwapInterval: loaded?.interval ?? null,
          bundle,
          rectangleInteraction: rectangleInteractionRef.current,
          lineInteraction: lineInteractionRef.current,
          fixedRangeVolumeProfileInteraction: fixedRangeVolumeProfileInteractionRef.current,
          rectangleInstances: rectangleInstancesRef.current,
          lineInstances: lineInstancesRef.current,
          fixedRangeVolumeProfileInstances: fixedRangeVolumeProfileInstancesRef.current,
          fixedRangeVolumeProfileRuntime: fixedRangeVolumeProfileRuntimeRef.current,
          rollingVwapInstances: rollingVwapInstancesRef.current,
          anchoredVwapInstances: anchoredVwapInstancesRef.current,
          anchoredVwapDrawingInteraction: anchoredVwapInteractionRef.current,
        }
      },
      onActivate: (target) => {
        openChartObjectSettings(target)
      },
      onSelectOverlay: (target) => {
        setOverlayIndicatorSelection((current) =>
          applyOverlayIndicatorSelection(current, target),
        )
      },
      onDeselectOverlay: clearOverlayIndicatorSelection,
    })

    return () => {
      controller.dispose()
    }
  }, [chartReady, openChartObjectSettings, clearOverlayIndicatorSelection])

  /**
   * Right-button press-and-hold on the candle pane scales time and price around
   * the pressed chart point (Issue #236). The controller binds to the pane that
   * owns the registered candle series, so it follows pane reorder/resize and
   * never touches the RSI or Aggregated Liquidations panes. It stays idle while
   * a drawing is being created/moved/resized, and a finished drag reuses the
   * existing viewport capture so a manual price range survives reload.
   */
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const controller = attachRightDragChartScaling(chart, {
      getSeries: () => seriesRef.current?.candle ?? null,
      isBlocked: () => {
        if (
          isAnyChartDrawingNavigationLocked(
            rectangleInteractionRef.current,
            lineInteractionRef.current,
            anchoredVwapInteractionRef.current,
          )
        ) {
          return true
        }
        return isFixedRangeVolumeProfileChartInteractionLocked(
          fixedRangeVolumeProfileInteractionRef.current,
        )
      },
      onGestureEnd: scheduleMarketChartViewportPersist,
    })

    return () => {
      controller.dispose()
    }
  }, [chartReady, scheduleMarketChartViewportPersist])

  useEffect(() => {
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (!chart || !bundle || !chartReady) return

    const attachment = attachFixedRangeVolumeProfileSeriesPrimitive(bundle.candle, () => ({
      instances: resolveFixedRangeVolumeProfileInstancesForDisplay(
        fixedRangeVolumeProfileInstancesRef.current,
        fixedRangeVolumeProfileInteractionRef.current,
      ),
      runtimeById: fixedRangeVolumeProfileRuntimeRef.current,
      selectedId: fixedRangeVolumeProfileInteractionRef.current.selectedId,
      interaction: fixedRangeVolumeProfileInteractionRef.current,
      getIntervalDurationSeconds: () =>
        candleIntervalDurationSeconds(activeIntervalRef.current),
      getLastBarUnixTime: () => latestCandleUnixTime(candlesRef.current),
    }))
    fixedRangeVolumeProfileSeriesAttachmentRef.current = attachment

    const onVisibleRangeChange = () => {
      attachment.update()
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange)
    attachment.update()

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange)
      attachment.dispose()
      fixedRangeVolumeProfileSeriesAttachmentRef.current = null
    }
  }, [chartReady])

  useEffect(() => {
    fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
  }, [fixedRangeVolumeProfileInstances, fixedRangeVolumeProfileInteraction])

  useEffect(() => {
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (!chart || !bundle || !chartReady) return

    const attachment = attachRectangleSeriesPrimitive(bundle.candle, () => ({
      instances: rectangleInstancesRef.current,
      interaction: rectangleInteractionRef.current,
      pointerTime: rectanglePointerPreviewRef.current.pointerTime,
      pointerPrice: rectanglePointerPreviewRef.current.pointerPrice,
      intervalDurationSeconds: candleIntervalDurationSeconds(activeIntervalRef.current),
      lastBarUnixTime: latestCandleUnixTime(candlesRef.current),
    }))
    rectangleSeriesAttachmentRef.current = attachment

    const onVisibleRangeChange = () => {
      attachment.update()
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange)
    attachment.update()

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange)
      attachment.dispose()
      rectangleSeriesAttachmentRef.current = null
    }
  }, [chartReady])

  useEffect(() => {
    rectangleSeriesAttachmentRef.current?.update()
  }, [rectangleInstances, rectangleInteraction])

  useEffect(() => {
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (!chart || !bundle || !chartReady) return

    const attachment = attachLineSeriesPrimitive(bundle.candle, () => ({
      instances: lineInstancesRef.current,
      interaction: lineInteractionRef.current,
      pointerTime: linePointerPreviewRef.current.pointerTime,
      pointerPrice: linePointerPreviewRef.current.pointerPrice,
      intervalDurationSeconds: candleIntervalDurationSeconds(activeIntervalRef.current),
      lastBarUnixTime: latestCandleUnixTime(candlesRef.current),
    }))
    lineSeriesAttachmentRef.current = attachment

    const onVisibleRangeChange = () => {
      attachment.update()
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange)
    attachment.update()

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange)
      attachment.dispose()
      lineSeriesAttachmentRef.current = null
    }
  }, [chartReady])

  useEffect(() => {
    lineSeriesAttachmentRef.current?.update()
  }, [lineInstances, lineInteraction])

  useEffect(() => {
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (!chart || !bundle || !chartReady) return

    const attachment = attachAnchoredVwapDrawingSeriesPrimitive(
      bundle.candle,
      () => ({
        instances: anchoredVwapInstancesRef.current,
        interaction: anchoredVwapInteractionRef.current,
        candles: candlesRef.current,
        intervalDurationSeconds: candleIntervalDurationSeconds(activeIntervalRef.current),
        lastBarUnixTime: latestCandleUnixTime(candlesRef.current),
      }),
      () => chartRef.current,
    )
    anchoredVwapSeriesAttachmentRef.current = attachment

    const onVisibleRangeChange = () => {
      attachment.update()
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange)
    attachment.update()

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange)
      attachment.dispose()
      anchoredVwapSeriesAttachmentRef.current = null
    }
  }, [chartReady])

  useEffect(() => {
    anchoredVwapSeriesAttachmentRef.current?.update()
  }, [anchoredVwapInstances, anchoredVwapInteraction])

  useEffect(() => {
    activeIndicatorsRef.current = activeIndicators
  }, [activeIndicators])

  useEffect(() => {
    rsiSettingsRef.current = rsiSettings
  }, [rsiSettings])

  useEffect(() => {
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (!bundle) return
    const plan = resolveChartIndicatorSeriesPlan({ activeIndicators, interval })
    // Forget series that are switching off, so switching them back on hydrates
    // them from current candles instead of trusting data a live tick no longer
    // updated.
    retainPlannedChartIndicatorSeries(bundle, plan)
    const loadedCandles = candlesRef.current
    const candlesMatchInterval =
      loadedCandles.length > 0 &&
      loadedCandles[loadedCandles.length - 1]?.interval === interval
    if (chartReady && historyReadyRef.current && candlesMatchInterval) {
      // Hydrate before the visibility sync below, so a just-enabled indicator is
      // already populated when its series becomes visible.
      hydratePlannedChartIndicatorSeries(bundle, loadedCandles, plan)
    }
    applyEmaIndicatorSeriesVisibility(bundle, activeIndicators)
    syncAllVwapVisibility(bundle)
    if (chart) syncRsiPane(chart, bundle)
    syncWidgetMarketIndicatorPresentations(panelId, bundle)
  }, [
    activeIndicators,
    chartReady,
    interval,
    panelId,
    rollingVwapInstances,
    syncAllVwapVisibility,
    syncRsiPane,
  ])

  useEffect(() => {
    newestLiquidationTradeTimeRef.current =
      liquidationEvents.length === 0
        ? null
        : liquidationEvents[liquidationEvents.length - 1].tradeTime
  }, [liquidationEvents])

  const mergeLiquidationEventsIntoBuffer = useCallback(
    (incoming: AggregatedLiquidationEvent[]) => {
      if (incoming.length === 0) return
      setLiquidationEvents((current) =>
        mergeAggregatedLiquidationEvents(current, incoming, {
          candleTimes: candlesRef.current.map((candle) => candle.time),
          interval: activeIntervalRef.current,
        }),
      )
    },
    [],
  )

  useEffect(() => {
    if (!liquidationsEnabled) return

    // One shared `liquidations` socket for the page: every panel with the pane
    // enabled subscribes here instead of dialing its own relay connection.
    return subscribeWidgetStream(AGGREGATED_LIQUIDATIONS_CHANNEL, {
      onStateChange: (state) => {
        // Once the live socket is open, refresh the stored window so events
        // collected between page load and the socket handshake are included.
        if (state === 'open') {
          setLiquidationHistoryRevision((revision) => revision + 1)
        }
      },
      onMessage: (message) => {
        if (message.type !== 'event') return
        const event = parseAggregatedLiquidationEvent(
          (message as ServerEventMessage).payload,
        )
        if (!event) return
        mergeLiquidationEventsIntoBuffer([event])
      },
    })
  }, [liquidationsEnabled, mergeLiquidationEventsIntoBuffer])

  useEffect(() => {
    if (!liquidationsEnabled || !chartReady || !historyReadyRef.current) return
    // >= 30m intervals read backend buckets; the paged events walk would only
    // reach their newest ~12k events and silently leave the rest of the range
    // empty (Issue #210).
    if (shouldUseAggregatedLiquidationBuckets(interval)) return
    const candleTimes = candlesRef.current.map((candle) => candle.time)
    if (candleTimes.length === 0) return

    const generation = loadGenerationRef.current
    const oldestTimeMs = Math.min(...candleTimes) * 1000
    const socketOpened =
      liquidationHistoryRevision !== liquidationSocketRevisionRef.current
    liquidationSocketRevisionRef.current = liquidationHistoryRevision
    // The buffer is additive, so the walk is only needed when it has to reach
    // further back than the previous completed walk (Issue #238: every
    // notice-only refresh used to restart it from the newest cursor).
    const needsWalk = shouldStartLiquidationsWalk({
      coverage: liquidationWalkCoverageRef.current,
      interval,
      requestedOldestTimeMs: oldestTimeMs,
    })
    if (!socketOpened && !needsWalk) return
    const controller = new AbortController()

    void (async () => {
      try {
        // A freshly opened socket has to fill everything stored while it was
        // closed, not only the newest page: a disconnect that spans a cascade
        // leaves more than `AGGREGATED_LIQUIDATIONS_HISTORY_MAX_LIMIT` events
        // behind, and a one-page fill left that range permanently empty (Issue
        // #239 review, MINOR-A). The newest buffered event is the stop
        // condition, so this never re-reads the loaded candle range. Only the
        // uncursored newest page is read fresh; the cursored pages behind it
        // come from `liquidationHistoryPageCache`, so a page a fill or walk
        // already read within `AGGREGATED_LIQUIDATIONS_PAGE_CACHE_TTL_MS`
        // (30 s) is reused rather than re-requested.
        if (socketOpened) {
          const gapFill = await fillAggregatedLiquidationsGap({
            sinceTradeTimeMs: newestLiquidationTradeTimeRef.current,
            limit: AGGREGATED_LIQUIDATIONS_HISTORY_MAX_LIMIT,
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          if (generation !== loadGenerationRef.current) return
          mergeLiquidationEventsIntoBuffer(gapFill.events)
          // A gap wider than the page cap is still incomplete: forget the
          // covered range so the next window change walks again instead of
          // treating the pane as complete, and report the gap so the hole is
          // not silently discovered on the next pan (#239 review, NIT-1).
          const afterGapFill = applyLiquidationsGapFill({
            interval,
            coverage: liquidationWalkCoverageRef.current,
            fill: gapFill,
          })
          liquidationWalkCoverageRef.current = afterGapFill.coverage
          if (afterGapFill.notice) setLiquidationCoverageNotice(afterGapFill.notice)
        }

        if (!needsWalk) return

        const history = await fetchAggregatedLiquidationsHistoryShared({
          oldestTimeMs,
          limit: AGGREGATED_LIQUIDATIONS_HISTORY_MAX_LIMIT,
          maxPages: AGGREGATED_LIQUIDATIONS_HISTORY_MAX_PAGES,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (generation !== loadGenerationRef.current) return
        mergeLiquidationEventsIntoBuffer(history.events)
        // A page-capped walk does not cover the requested range, so the next
        // window change must be allowed to walk again from the newest cursor.
        liquidationWalkCoverageRef.current = history.truncated
          ? null
          : { interval, oldestTimeMs }
        // Replaces the previously dropped `truncated` flag: a page-capped
        // event walk is surfaced with the range it actually covers.
        setLiquidationCoverageNotice({
          interval,
          message: describeAggregatedLiquidationsEventNotice(
            history.events,
            history.truncated,
          ),
        })
      } catch {
        // History is additive evidence, not a prerequisite: a failed read
        // leaves the existing live-only buffer untouched.
      }
    })()

    return () => controller.abort()
  }, [
    candleRangeRevision,
    chartReady,
    interval,
    exchange,
    liquidationHistoryRevision,
    liquidationsEnabled,
    mergeLiquidationEventsIntoBuffer,
  ])

  // The bucket query replaces its whole array, so refreshing the live edge
  // cannot double-count. A fixed interval (rather than a per-event debounce)
  // keeps the current bucket fresh during a liquidation cascade, where events
  // can arrive faster than any debounce would fire.
  useEffect(() => {
    if (!liquidationsEnabled) return
    if (!shouldUseAggregatedLiquidationBuckets(interval)) return
    const tick = () =>
      setLiquidationBucketsRevision((revision) => revision + 1)
    // The first tick is anchored to a wall-clock period boundary and the fixed
    // interval then keeps that phase, so every panel reads the same window at
    // the same moment and the shared request cache sees one caller rather than
    // one per panel. The period itself is unchanged: one live refresh per
    // `AGGREGATED_LIQUIDATIONS_BUCKETS_LIVE_REFRESH_MS`.
    let repeatTimer: number | null = null
    const firstTimer = window.setTimeout(() => {
      tick()
      repeatTimer = window.setInterval(
        tick,
        AGGREGATED_LIQUIDATIONS_BUCKETS_LIVE_REFRESH_MS,
      )
    }, nextLiveRefreshDelayMs(Date.now(), AGGREGATED_LIQUIDATIONS_BUCKETS_LIVE_REFRESH_MS))
    return () => {
      window.clearTimeout(firstTimer)
      if (repeatTimer !== null) window.clearInterval(repeatTimer)
    }
  }, [interval, liquidationsEnabled])

  useEffect(() => {
    if (!liquidationsEnabled || !chartReady || !historyReadyRef.current) return
    if (!shouldUseAggregatedLiquidationBuckets(interval)) return
    const candleTimes = candlesRef.current.map((candle) => candle.time)
    const request = buildAggregatedLiquidationsBucketRequest(candleTimes, interval)
    if (!request) return

    const generation = loadGenerationRef.current
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetchAggregatedLiquidationsBuckets({
          interval,
          from: request.from,
          to: request.to,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (generation !== loadGenerationRef.current) return
        setLiquidationBuckets({
          exchange,
          interval,
          from: request.from,
          to: request.to,
          buckets: response.buckets,
        })
        setLiquidationCoverageNotice({
          interval,
          message: describeAggregatedLiquidationsBucketNotice(request, response),
        })
      } catch (error) {
        if (controller.signal.aborted) return
        if (generation !== loadGenerationRef.current) return
        // A transient failure keeps the buckets already on screen; a changed
        // range/interval/exchange clears them because they belong to another
        // chart state. The notice below explains the failure either way.
        setLiquidationBuckets((current) =>
          nextAggregatedLiquidationsBucketsAfterError(current, {
            exchange,
            interval,
            from: request.from,
            to: request.to,
          }),
        )
        setLiquidationCoverageNotice({
          interval,
          message: describeAggregatedLiquidationsBucketError(error),
        })
      }
    })()

    return () => controller.abort()
  }, [
    candleRangeRevision,
    chartReady,
    exchange,
    interval,
    liquidationBucketsRevision,
    liquidationHistoryRevision,
    liquidationsEnabled,
  ])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady || !liquidationsEnabled) return

    const overlay = createAggregatedLiquidationsChartOverlay(
      chart,
      liquidationSettingsRef.current.position,
    )
    liquidationOverlayRef.current = overlay

    return () => {
      overlay.dispose()
      if (liquidationOverlayRef.current === overlay) {
        liquidationOverlayRef.current = null
      }
    }
  }, [chartReady, liquidationsEnabled])

  useEffect(() => {
    liquidationSettingsRef.current = liquidationSettings
    liquidationOverlayRef.current?.setPosition(liquidationSettings.position)
  }, [liquidationSettings])

  useEffect(() => {
    liquidationOverlayRef.current?.setSelected(
      overlayIndicatorSelection?.kind === 'aggregated-liquidations',
    )
  }, [overlayIndicatorSelection, chartReady, liquidationsEnabled])

  useEffect(() => {
    // Buckets are stamped with the request that produced them, so a response
    // (or a kept-on-error array) for another interval, exchange or range can
    // never be drawn on the current candles.
    const intervalBuckets =
      liquidationBuckets?.interval === interval &&
      liquidationBuckets.exchange === exchange
        ? liquidationBuckets.buckets
        : []
    const buckets = filterAggregatedLiquidationBucketsToCandles(
      shouldUseAggregatedLiquidationBuckets(interval)
        ? intervalBuckets
        : bucketAggregatedLiquidationEvents(liquidationEvents, interval),
      candlesRef.current.map((candle) => candle.time),
    )
    liquidationOverlayRef.current?.setBuckets(buckets)
  }, [
    candleRangeRevision,
    chartReady,
    exchange,
    interval,
    liquidationBuckets,
    liquidationEvents,
    liquidationsEnabled,
  ])

  useEffect(() => {
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (!chart || !bundle || !chartReady) return
    reconcileRollingVwapChartBundles(
      chart,
      bundle.rollingVwaps,
      rollingVwapInstances,
      interval,
    )
    for (const instance of rollingVwapInstances) {
      const chartBundle = bundle.rollingVwaps.get(instance.id)
      if (!chartBundle) continue
      applyRollingVwapChartInstancePresentation(chartBundle, instance, interval)
    }
    syncAllVwapVisibility(bundle)
  }, [rollingVwapInstances, interval, chartReady, syncAllVwapVisibility])

  useEffect(() => {
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (!chart || !bundle || !chartReady) return
    reconcileAnchoredVwapDrawingChartBundles(chart, bundle.anchoredVwaps, anchoredVwapInstances)
    syncAnchoredVwapDrawingInstancesVisibility(bundle, anchoredVwapInstances)
    applyAnchoredVwapDrawingInstancesHistory(bundle, candlesRef.current, anchoredVwapInstances)
  }, [anchoredVwapInstances, chartReady])

  useEffect(() => {
    if (
      positionWallet.exchange !== 'hyperliquid' ||
      !shouldShowPositionMarkers(positionMarkersEnabled)
    ) {
      // Leaving the Hyperliquid branch (wallet or toggle change) must forget
      // the loaded range, or switching back would reuse the guard and never
      // re-fetch the (now cleared) fills.
      accountFillsRangeRef.current = null
      return
    }
    if (!chartReady) return

    const candles = candlesRef.current
    if (candles.length === 0) return
    const first = candles[0]
    const last = candles[candles.length - 1]
    const startTime = first.time * 1000
    const endTime =
      (last.time + candleIntervalDurationSeconds(interval)) * 1000
    // Wallet-scoped request identity: a different wallet must fetch its own
    // history even when the candle window (and interval) did not move.
    const rangeKey = `${positionWalletKey}:${startTime}:${endTime}`
    if (accountFillsRangeRef.current === rangeKey) return
    accountFillsRangeRef.current = rangeKey

    const controller = new AbortController()
    setAccountFillsNotice(null)
    void fetchHyperliquidAccountFillsByTime(
      positionWallet.address,
      startTime,
      endTime,
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) return
        const parsed = response.fills
          .map(parseHyperliquidFill)
          .filter((fill): fill is AccountFill => fill !== null)
        if (parsed.length > 0) {
          mergeAccountFills(parsed)
        }
        setAccountFillsNotice(
          response.truncated
            ? `Showing the most recent ${response.response_cap ?? 2000} Hyperliquid fills in the loaded chart range; older fills in this window are not shown.`
            : null,
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        accountFillsRangeRef.current = null
        setAccountFillsNotice(
          error instanceof Error
            ? `Could not load Hyperliquid fills: ${error.message}`
            : 'Could not load Hyperliquid fills for the loaded chart range',
        )
      })

    return () => controller.abort()
  }, [
    candleRangeRevision,
    chartReady,
    interval,
    mergeAccountFills,
    positionMarkersEnabled,
    positionWallet.exchange,
    positionWallet.address,
    positionWalletKey,
    setAccountFillsNotice,
  ])

  useEffect(() => {
    if (positionWallet.exchange !== 'hyperliquid') return
    if (!shouldShowPositionMarkers(positionMarkersEnabled)) return
    const channel = hyperliquidUserFillsChannel(positionWallet.address)
    // Shared per account channel: two panels with position markers on must not
    // open two identical fill sockets.
    return subscribeWidgetStream(channel, {
      onMessage: (message) => {
        if (message.type !== 'event') return
        const payload = message.payload
        if (!payload || typeof payload !== 'object') return
        const fills = (payload as { fills?: unknown }).fills
        if (!Array.isArray(fills)) return
        const parsed = fills
          .map(parseHyperliquidFill)
          .filter((fill): fill is AccountFill => fill !== null)
        if (parsed.length === 0) return
        mergeAccountFills(parsed)
      },
    })
  }, [
    mergeAccountFills,
    positionWallet.exchange,
    positionWallet.address,
    positionMarkersEnabled,
  ])

  useEffect(() => {
    if (positionWallet.exchange !== 'lighter') return
    if (!shouldShowPositionMarkers(positionMarkersEnabled)) return
    // One shared Lighter session serves every panel: this is a listener on the
    // account's single history/poll loop, not a request per widget.
    const applySnapshot = () => {
      const snapshot = getLighterPositionMarkersSnapshot()
      replaceAccountFills(snapshot.fills, snapshot.error ?? snapshot.notice)
    }
    applySnapshot()
    return subscribeLighterPositionMarkers(positionWallet, applySnapshot)
  }, [positionWallet, positionMarkersEnabled, replaceAccountFills])

  useEffect(() => {
    const markers = accountMarkersRef.current
    if (!markers) return
    if (!shouldShowPositionMarkers(positionMarkersEnabled) || !chartReady) {
      markers.setMarkers([])
      accountMarkersByBucketRef.current = new Map()
      return
    }

    const bucketed = bucketHyperliquidFills(accountFills, interval)
    const visible = filterHyperliquidFillsToLoadedCandles(
      bucketed,
      candlesRef.current.map((candle) => candle.time),
    )
    const byBucket = new Map<number, BucketedHyperliquidFill[]>()
    for (const fill of visible) {
      const bucket = byBucket.get(fill.bucketTime)
      if (bucket) bucket.push(fill)
      else byBucket.set(fill.bucketTime, [fill])
    }
    markers.setMarkers(
      hyperliquidFillGroupsToMarkers(
        groupHyperliquidFillMarkers(visible),
        ACCOUNT_MARKER_COLORS,
        positionMarkerSettings.size,
      ),
    )
    accountMarkersByBucketRef.current = byBucket
  }, [
    accountFills,
    candleRangeRevision,
    chartReady,
    interval,
    positionMarkerSettings.size,
    positionMarkersEnabled,
  ])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const handleCrosshairMove = (param: MouseEventParams) => {
      const time = typeof param.time === 'number' ? param.time : null
      const next =
        time === null ? [] : (accountMarkersByBucketRef.current.get(time) ?? [])
      setHoveredAccountFillState((current) => {
        const currentFills =
          current.walletKey === positionWalletKey ? current.fills : NO_HOVERED_ACCOUNT_FILLS
        if (
          currentFills.length === next.length &&
          currentFills.every(
            (fill, index) =>
              hyperliquidFillIdentityKey(fill) ===
              (next[index] ? hyperliquidFillIdentityKey(next[index]) : null),
          )
        ) {
          return current.walletKey === positionWalletKey
            ? current
            : { walletKey: positionWalletKey, fills: NO_HOVERED_ACCOUNT_FILLS }
        }
        return { walletKey: positionWalletKey, fills: next }
      })
    }

    chart.subscribeCrosshairMove(handleCrosshairMove)
    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove)
    }
  }, [chartReady, positionWalletKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let chart: IChartApi | null = null
    let historyListenerChart: IChartApi | null = null

    const onVisibleLogicalRangeChange = (range: LogicalRange | null) => {
      const bundle = seriesRef.current
      const activeChart = chartRef.current
      if (!bundle || !activeChart || activeChart !== historyListenerChart) return
      scheduleMarketChartViewportPersist()
      maybeRequestOlderBtcPerpHistory({
        state: infiniteHistoryRef.current,
        historyReady: historyReadyRef.current,
        exchange: activeExchangeRef.current,
        range,
        candleSeries: bundle.candle,
        candlesRef,
        generation: infiniteHistoryRef.current.generation,
        interval: activeIntervalRef.current,
        bundle,
        chart: activeChart,
        signal: abortRef.current?.signal,
        getRollingVwapInstances: () => rollingVwapInstancesRef.current,
        getAnchoredVwapInstances: () => anchoredVwapInstancesRef.current,
        getIndicatorSeriesPlan: currentIndicatorSeriesPlan,
        onHistoryStateChange: refreshIndicatorHistoryNotices,
      })
    }

    const attachInfiniteHistoryListener = (targetChart: IChartApi) => {
      if (historyListenerChart === targetChart) return
      if (historyListenerChart) {
        historyListenerChart
          .timeScale()
          .unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)
      }
      targetChart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)
      historyListenerChart = targetChart
    }

    const detachInfiniteHistoryListener = () => {
      if (!historyListenerChart) return
      historyListenerChart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)
      historyListenerChart = null
    }

    const ensureChart = () => {
      if (chart) return chart

      const width = container.clientWidth
      const height = container.clientHeight
      if (width < 2 || height < 2) return null

      // Read at creation, not when the effect mounted: a deferred first layout
      // must not create the chart with a palette the user already switched away from.
      const colors = readThemeColors()
      const chromeOptions = themeChartOptions(colors)

      chart = createChart(container, {
        ...chromeOptions,
        layout: {
          ...chromeOptions.layout,
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
        handleScale: {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: { time: true, price: true },
          axisDoubleClickReset: { time: true, price: true },
        },
        width,
        height,
      })

      const candleSeries = chart.addSeries(CandlestickSeries, {
        ...candleCandlestickSeriesOptions(candleColorsRef.current),
        ...btcPerpetualCurrentPriceLineOptions(colors.text),
      })
      publishCandleSeriesColorOptions(container, candleSeries)
      registerCandleChartSeries(chart, candleSeries)
      // One marker primitive for the lifetime of this chart instance. Account
      // markers are always updated through `setMarkers`, never a second chart.
      accountMarkersRef.current = createSeriesMarkers(candleSeries, [])

      const { tripleEma: emaVisible, dualEma: dualEmaSeriesVisible } =
        getEmaIndicatorSeriesVisibility(activeIndicatorsRef.current)
      const emaSeries = EMA_PERIODS.map((_, index) =>
        chart!.addSeries(LineSeries, {
          color: colors.ema[index] ?? colors.ema[0],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          visible: emaVisible,
        }),
      )
      const ema100Series = chart!.addSeries(LineSeries, {
        color: colors.ema100,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        visible: dualEmaSeriesVisible,
      })
      const ema200Series = chart!.addSeries(LineSeries, {
        color: colors.ema200,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        visible: dualEmaSeriesVisible,
      })

      const dailyVwapSeries = createDailyVwapLineSeries(chart!, false)
      const weeklyVwapSeries = createWeeklyVwapLineSeries(chart!, false)
      const monthlyVwapSeries = createMonthlyVwapLineSeries(chart!, false)
      const quarterlyVwapSeries = createQuarterlyVwapLineSeries(chart!, false)
      const yearlyVwapSeries = createYearlyVwapLineSeries(chart!, false)
      const rollingVwaps = createEmptyRollingVwapChartInstanceMap()
      reconcileRollingVwapChartBundles(
        chart!,
        rollingVwaps,
        rollingVwapInstancesRef.current,
        activeIntervalRef.current,
      )
      const anchoredVwaps = createEmptyAnchoredVwapDrawingChartInstanceMap()
      reconcileAnchoredVwapDrawingChartBundles(
        chart!,
        anchoredVwaps,
        anchoredVwapInstancesRef.current,
      )
      const rsi =
        activeIndicatorsRef.current.includes('rsi') &&
        isIndicatorSupportedOnInterval('rsi', activeIntervalRef.current)
          ? createRsiChartPane(chart!, rsiSettingsRef.current)
          : null

      chartRef.current = chart
      seriesRef.current = {
        candle: candleSeries,
        emas: emaSeries,
        ema100: ema100Series,
        ema200: ema200Series,
        dailyVwap: dailyVwapSeries,
        weeklyVwap: weeklyVwapSeries,
        monthlyVwap: monthlyVwapSeries,
        quarterlyVwap: quarterlyVwapSeries,
        yearlyVwap: yearlyVwapSeries,
        rollingVwaps,
        anchoredVwaps,
        rsi,
      }
      syncWidgetMarketIndicatorPresentations(panelId, seriesRef.current)
      attachInfiniteHistoryListener(chart)
      return chart
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const { width, height } = entry.contentRect
      if (width < 2 || height < 2) return

      const activeChart = ensureChart()
      if (activeChart) {
        activeChart.applyOptions({ width, height })
      }
    })
    const onViewportPointerUp = () => {
      scheduleMarketChartViewportPersist()
    }
    container.addEventListener('pointerup', onViewportPointerUp)
    container.addEventListener('wheel', onViewportPointerUp, { passive: true })

    resizeObserver.observe(container)
    ensureChart()

    return () => {
      container.removeEventListener('pointerup', onViewportPointerUp)
      container.removeEventListener('wheel', onViewportPointerUp)
      if (viewportPersistTimerRef.current) {
        clearTimeout(viewportPersistTimerRef.current)
        viewportPersistTimerRef.current = null
      }
      flushMarketChartViewportPersist()
      detachInfiniteHistoryListener()
      resizeObserver.disconnect()
      stopKlineStream()
      abortRef.current?.abort()
      abortRef.current = null
      accountMarkersRef.current?.detach()
      accountMarkersRef.current = null
      accountMarkersByBucketRef.current = new Map()
      chart?.remove()
      chartRef.current = null
      seriesRef.current = null
      candlesRef.current = []
      historyReadyRef.current = false
    }
  }, [
    currentIndicatorSeriesPlan,
    flushMarketChartViewportPersist,
    panelId,
    refreshIndicatorHistoryNotices,
    scheduleMarketChartViewportPersist,
    stopKlineStream,
  ])

  /**
   * Re-apply theme-derived chrome when the palette changes while this chart is mounted.
   * `applyOptions` repaints the existing chart instance: no re-creation, no history refetch,
   * no viewport reset and no series/candle/indicator color changes. Only chart chrome follows the
   * theme (text, background, pane separators, crosshair).
   */
  useEffect(() => {
    const root = document.documentElement
    let appliedTheme = root.dataset.theme
    const applyThemeToChart = () => {
      const chart = chartRef.current
      if (!chart) return
      const colors = readThemeColors()
      chart.applyOptions(themeChartOptions(colors))
      // Current-price line/label is series-level chrome derived from the same text token.
      // Only the price-line keys are applied; candle colors and every other series option stay.
      seriesRef.current?.candle.applyOptions(btcPerpetualCurrentPriceLineOptions(colors.text))
    }
    const observer = new MutationObserver(() => {
      if (root.dataset.theme === appliedTheme) return
      appliedTheme = root.dataset.theme
      applyThemeToChart()
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const intervalLeaving = activeIntervalRef.current
    const hadPendingViewportPersist = viewportPersistTimerRef.current !== null
    if (viewportPersistTimerRef.current) {
      clearTimeout(viewportPersistTimerRef.current)
      viewportPersistTimerRef.current = null
    }
    if (hadPendingViewportPersist) {
      flushMarketChartViewportPersist(intervalLeaving, { allowWhileHistoryNotReady: true })
    } else {
      flushMarketChartViewportPersist(intervalLeaving)
    }

    activeExchangeRef.current = exchange
    activeIntervalRef.current = interval
    providerHistoryAvailableFromRef.current = null
    loadGenerationRef.current += 1
    const generation = loadGenerationRef.current
    historyReadyRef.current = false
    loadedVwapContextRef.current = null
    cancelActiveVwapContextRequest(vwapContextAbortRef, vwapContextLatestRequestIdRef)
    resetInfiniteHistoryState(infiniteHistoryRef.current, generation)

    abortRef.current?.abort()
    stopKlineStream()
    candlesRef.current = []
    syncFixedRangeVolumeProfileLiveRightEdge()

    const bundle = seriesRef.current
    if (bundle) {
      // Every series is emptied here, so no indicator series may keep claiming
      // it holds data for the candles that are about to load.
      resetChartIndicatorSeriesApplication(bundle)
      bundle.candle.setData([])
      bundle.emas.forEach((series) => series.setData([]))
      bundle.ema100.setData([])
      bundle.ema200.setData([])
      clearDailyVwapLineSeriesData(bundle.dailyVwap)
      clearWeeklyVwapLineSeriesData(bundle.weeklyVwap)
      clearMonthlyVwapLineSeriesData(bundle.monthlyVwap)
      clearQuarterlyVwapLineSeriesData(bundle.quarterlyVwap)
      clearYearlyVwapLineSeriesData(bundle.yearlyVwap)
      clearAllRollingVwapChartInstanceData(bundle, rollingVwapInstancesRef.current)
      hideAllAnchoredVwapSeries(bundle)
      if (bundle.rsi) clearRsiPaneData(bundle.rsi)
    }

    const controller = new AbortController()
    abortRef.current = controller

    const channel = marketKlineChannelForInterval(exchange, interval)
    const streamBuffer = new Map<number, MarketCandle>()
    let historyReady = false
    const initialContextLevel = requiredVwapContextLevel(activeIndicatorsRef.current, interval)

    const teardownStream = () => {
      stopKlineStream()
      streamBuffer.clear()
    }

    const unsubscribe = subscribeWidgetStream(channel, {
      onStateChange: (state) => {
        if (generation !== loadGenerationRef.current) return
        setStreamState(state)
      },
      onMessage: (message) => {
        if (generation !== loadGenerationRef.current) return
        if (message.type !== 'event') return

        const candle = parseMarketCandlePayload(
          (message as ServerEventMessage).payload,
          {
            exchange: activeExchangeRef.current,
            interval: activeIntervalRef.current,
          },
        )
        if (!candle) return

        if (!historyReady) {
          bufferStreamCandle(streamBuffer, candle)
          return
        }

        const bundleLive = seriesRef.current
        if (!bundleLive) return
        applyChartLiveCandle(
          candlesRef.current,
          candle,
          bundleLive,
          liveVwapContext(),
          rollingVwapInstancesRef.current,
          anchoredVwapInstancesRef.current,
        )
        syncFixedRangeVolumeProfileLiveRightEdge()
      },
    })
    streamUnsubscribeRef.current = unsubscribe

    const applyInitialSeries = (
      candles: MarketCandle[],
    ): { ok: true; pendingViewportRestore?: Promise<void> } | { ok: false } => {
      const bundleNow = seriesRef.current
      const chart = chartRef.current
      if (!bundleNow || !chart) return { ok: false }

      reconcileRollingVwapChartBundles(
        chart,
        bundleNow.rollingVwaps,
        rollingVwapInstancesRef.current,
        activeIntervalRef.current,
      )
      reconcileAnchoredVwapDrawingChartBundles(
        chart,
        bundleNow.anchoredVwaps,
        anchoredVwapInstancesRef.current,
      )
      applyChartHistorySeries(
        bundleNow,
        candles,
        rollingVwapInstancesRef.current,
        anchoredVwapInstancesRef.current,
        currentIndicatorSeriesPlan(),
      )
      const barCount = candles.length
      const currentInterval = activeIntervalRef.current
      let pendingViewportRestore: Promise<void> | undefined
      suppressViewportPersistRef.current = true
      try {
        const saved = loadWidgetMarketChartViewport(panelId, currentInterval)
        if (!saved) {
          applyDefaultMarketChartPresentation(chart, barCount)
        } else {
          const restoreResult = restoreMarketChartViewport(chart, saved, candles)
          if (restoreResult === 'invalid') {
            applyDefaultMarketChartPresentation(chart, barCount)
          } else if (restoreResult === 'needs_history') {
            const bundleForHistory = seriesRef.current
            if (bundleForHistory) {
              pendingViewportRestore = loadOlderHistoryUntilVisibleFrom({
                state: infiniteHistoryRef.current,
                generation: loadGenerationRef.current,
                exchange: activeExchangeRef.current,
                interval: currentInterval,
                visibleTimeRange: saved.visibleTimeRange,
                candlesRef,
                bundle: bundleForHistory,
                chart,
                signal: controller.signal,
                getRollingVwapInstances: () => rollingVwapInstancesRef.current,
                getAnchoredVwapInstances: () => anchoredVwapInstancesRef.current,
                getIndicatorSeriesPlan: currentIndicatorSeriesPlan,
              })
                .then(() => {
                  if (generation !== loadGenerationRef.current) return
                  const chartAfterHistory = chartRef.current
                  if (!chartAfterHistory) return
                  const candlesAfterHistory = candlesRef.current
                  if (
                    savedVisibleTimeRangeIsRestorable(
                      saved.visibleTimeRange,
                      candlesAfterHistory,
                    )
                  ) {
                    applySavedVisibleTimeRange(
                      chartAfterHistory,
                      saved.visibleTimeRange,
                      saved.rightOffset,
                      candlesAfterHistory,
                      saved.visibleLogicalRange,
                      saved.logicalFromOffsetFromTimeAnchor,
                    )
                  } else {
                    applyDefaultMarketChartPresentation(
                      chartAfterHistory,
                      candlesAfterHistory.length,
                    )
                    const fallbackViewport = captureMarketChartViewport(
                      chartAfterHistory,
                      candlesAfterHistory,
                    )
                    if (fallbackViewport) {
                      saveWidgetMarketChartViewport(
                        panelId,
                        currentInterval,
                        fallbackViewport,
                      )
                    }
                  }
                })
                .finally(() => {
                  if (generation !== loadGenerationRef.current) return
                  suppressViewportPersistRef.current = false
                })
            }
          }
        }
      } finally {
        if (!pendingViewportRestore) {
          suppressViewportPersistRef.current = false
        }
      }
      return { ok: true, pendingViewportRestore }
    }

    void (async () => {
      try {
        const response = await fetchBtcPerpKlinesForContextLevel(
          initialContextLevel,
          interval,
          exchange,
          controller.signal,
        )
        if (generation !== loadGenerationRef.current) return
        if (response.interval !== interval) return
        if (response.exchange !== undefined && response.exchange !== exchange) return
        if (response.symbol !== marketSymbolForExchange(exchange)) return
        providerHistoryAvailableFromRef.current = response.available_from ?? null
        // Seed the provider horizon so panning never requests candles the
        // provider cannot serve.
        infiniteHistoryRef.current.availableFrom = response.available_from ?? null

        const history = response.candles.filter((c) => c.interval === interval)
        const merged = mergeHistoryWithStreamBuffer(history, streamBuffer)
        streamBuffer.clear()

        if (merged.length === 0) {
          teardownStream()
          setDataState({ status: 'empty' })
          return
        }

        for (let attempt = 0; attempt < 120; attempt += 1) {
          if (generation !== loadGenerationRef.current) return
          if (seriesRef.current && chartRef.current) break
          await new Promise((resolve) => setTimeout(resolve, 16))
        }

        if (generation !== loadGenerationRef.current) return

        candlesRef.current = [...merged]
        syncFixedRangeVolumeProfileLiveRightEdge()
        const initialSeriesResult = applyInitialSeries(merged)
        if (!initialSeriesResult.ok) {
          teardownStream()
          setDataState({
            status: 'error',
            message: 'Chart could not be initialized',
          })
          return
        }

        if (initialSeriesResult.pendingViewportRestore) {
          await initialSeriesResult.pendingViewportRestore
          if (generation !== loadGenerationRef.current) return
        }

        if (streamBuffer.size > 0) {
          const tail = [...streamBuffer.values()].sort((a, b) => a.time - b.time)
          streamBuffer.clear()
          const bundleTail = seriesRef.current
          if (bundleTail) {
            for (const candle of tail) {
              applyChartLiveCandle(
                candlesRef.current,
                candle,
                bundleTail,
                liveVwapContext(),
                rollingVwapInstancesRef.current,
                anchoredVwapInstancesRef.current,
              )
            }
            syncFixedRangeVolumeProfileLiveRightEdge()
          }
        }

        historyReady = true
        historyReadyRef.current = true
        loadedVwapContextRef.current = { level: initialContextLevel, interval }
        const bundleAfterLoad = seriesRef.current
        if (bundleAfterLoad) {
          syncAllVwapVisibility(bundleAfterLoad)
        }
        setChartReady(true)
      } catch (error) {
        if (controller.signal.aborted) return
        if (generation !== loadGenerationRef.current) return
        teardownStream()
        if (error instanceof TypeError) {
          setDataState({ status: 'offline' })
          return
        }
        const message =
          error instanceof Error ? error.message : 'Could not load market history'
        setDataState({ status: 'error', message })
      }
    })()

    return () => {
      controller.abort()
      historyReady = false
      historyReadyRef.current = false
      streamBuffer.clear()
      stopKlineStream()
    }
  }, [
    currentIndicatorSeriesPlan,
    exchange,
    flushMarketChartViewportPersist,
    interval,
    liveVwapContext,
    panelId,
    stopKlineStream,
    syncAllVwapVisibility,
    syncFixedRangeVolumeProfileLiveRightEdge,
  ])

  useEffect(() => {
    if (!chartReady || !historyReadyRef.current) return

    const currentInterval = activeIntervalRef.current
    const neededLevel = requiredVwapContextLevel(activeIndicatorsRef.current, currentInterval)
    const loaded = loadedVwapContextRef.current

    if (
      loaded?.interval === currentInterval &&
      vwapContextLevelSatisfiesLoaded(loaded.level, neededLevel)
    ) {
      cancelActiveVwapContextRequest(vwapContextAbortRef, vwapContextLatestRequestIdRef)
      const bundle = seriesRef.current
      if (bundle) syncAllVwapVisibility(bundle)
      return
    }

    const bundle = seriesRef.current
    const chart = chartRef.current
    if (!bundle || !chart) return

    cancelActiveVwapContextRequest(vwapContextAbortRef, vwapContextLatestRequestIdRef)
    const controller = new AbortController()
    vwapContextAbortRef.current = controller
    const generation = loadGenerationRef.current
    const requestId = ++vwapContextLatestRequestIdRef.current
    const requestContextLevel = neededLevel
    const owner = { controller, requestId }

    hideAllAnchoredVwapSeries(bundle)

    void (async () => {
      try {
        const response = await fetchBtcPerpKlinesForContextLevel(
          requestContextLevel,
          currentInterval,
          activeExchangeRef.current,
          controller.signal,
        )
        const stillNeeded = requiredVwapContextLevel(
          activeIndicatorsRef.current,
          activeIntervalRef.current,
        )
        if (
          !shouldApplyVwapContextResponse({
            requestGeneration: generation,
            activeGeneration: loadGenerationRef.current,
            requestInterval: currentInterval,
            responseInterval: response.interval,
            requestId,
            latestRequestId: vwapContextLatestRequestIdRef.current,
            requestContextLevel,
            stillNeededContextLevel: stillNeeded,
            requestExchange: activeExchangeRef.current,
            responseExchange: response.exchange,
          })
        ) {
          return
        }

        providerHistoryAvailableFromRef.current = response.available_from ?? null
        infiniteHistoryRef.current.availableFrom = response.available_from ?? null
        const history = response.candles.filter((c) => c.interval === currentInterval)
        const beforeCandles = candlesRef.current
        const logicalRange = chart.timeScale().getVisibleLogicalRange()
        const merged = mergeVwapContextCandles(beforeCandles, history)
        const addedCount = countPrependedCandles(beforeCandles, merged)

        candlesRef.current = merged
        applyChartHistorySeries(
          bundle,
          merged,
          rollingVwapInstancesRef.current,
          anchoredVwapInstancesRef.current,
          currentIndicatorSeriesPlan(),
        )

        const shifted = shiftVisibleLogicalRange(logicalRange, addedCount)
        if (shifted) {
          chart.timeScale().setVisibleLogicalRange(shifted)
        }

        loadedVwapContextRef.current = { level: requestContextLevel, interval: currentInterval }
        syncAllVwapVisibility(bundle)
        refreshIndicatorHistoryNotices()
      } catch (error) {
        if (isVwapContextAbortError(error)) return
        if (generation !== loadGenerationRef.current) return
      } finally {
        finalizeOwnedVwapContextRequest(vwapContextAbortRef, owner)
      }
    })()

    return () => {
      releaseOwnedVwapContextRequest(vwapContextAbortRef, vwapContextLatestRequestIdRef, owner)
    }
  }, [
    activeIndicators,
    chartReady,
    currentIndicatorSeriesPlan,
    exchange,
    interval,
    refreshIndicatorHistoryNotices,
    syncAllVwapVisibility,
  ])

  useEffect(() => {
    if (!chartReady || !historyReadyRef.current) {
      setIndicatorHistoryNotices([])
      return
    }

    const generation = loadGenerationRef.current
    const currentInterval = activeIntervalRef.current
    const plan = resolveIndicatorHistoryPlan({
      interval: currentInterval,
      indicators: activeIndicatorsRef.current,
      rollingVwapInstances: rollingVwapInstancesRef.current,
      anchoredVwapInstances: anchoredVwapInstancesRef.current,
    })
    indicatorHistoryPreloadLimitRef.current = false
    refreshIndicatorHistoryNotices()
    if (plan.requirements.length === 0) return

    const bundle = seriesRef.current
    const chart = chartRef.current
    if (!bundle || !chart) return

    indicatorHistoryAbortRef.current?.abort()
    const controller = new AbortController()
    indicatorHistoryAbortRef.current = controller

    void preloadIndicatorHistory({
      state: infiniteHistoryRef.current,
      generation,
      target: plan,
      candlesRef,
      signal: controller.signal,
      loadOlderPage: (before) =>
        loadOlderBtcPerpHistory({
          state: infiniteHistoryRef.current,
          generation,
          exchange: activeExchangeRef.current,
          interval: currentInterval,
          before,
          candlesRef,
          bundle,
          chart,
          signal: controller.signal,
          getRollingVwapInstances: () => rollingVwapInstancesRef.current,
          getAnchoredVwapInstances: () => anchoredVwapInstancesRef.current,
          getIndicatorSeriesPlan: currentIndicatorSeriesPlan,
          onHistoryStateChange: refreshIndicatorHistoryNotices,
        }),
    })
      .then((result) => {
        if (generation !== loadGenerationRef.current) return
        indicatorHistoryPreloadLimitRef.current = result === 'page-limit'
      })
      .finally(() => {
        if (indicatorHistoryAbortRef.current === controller) {
          indicatorHistoryAbortRef.current = null
        }
        if (generation !== loadGenerationRef.current) return
        refreshIndicatorHistoryNotices()
      })

    return () => {
      controller.abort()
    }
  }, [
    activeIndicators,
    anchoredVwapInstances,
    chartReady,
    currentIndicatorSeriesPlan,
    exchange,
    interval,
    refreshIndicatorHistoryNotices,
    rollingVwapInstances,
  ])

  const streamLabel = chartReady ? streamStatusLabel(streamState) : null

  // Volume profile availability is provider-driven: an FRVP selection older
  // than the provider horizon must show an explicit state, never an empty profile.
  const frvpAvailabilityNotices = fixedRangeVolumeProfileAvailabilityNotices(
    fixedRangeVolumeProfileRuntimeById,
    exchange,
  )
  const activeLiquidationCoverageNotice =
    liquidationsEnabled &&
    liquidationCoverageNotice !== null &&
    liquidationCoverageNotice.interval === interval
      ? liquidationCoverageNotice.message
      : null
  const historyNotices = [
    ...indicatorHistoryNotices,
    ...frvpAvailabilityNotices,
    ...(accountFillsNotice === null ? [] : [accountFillsNotice]),
    ...(activeLiquidationCoverageNotice === null
      ? []
      : [activeLiquidationCoverageNotice]),
  ]

  // Both VWAP dialogs are per-instance, so their descriptions name the instance
  // being edited (same pattern as the line / rectangle / FRVP dialogs).
  const editingRollingVwapInstance = editingRollingVwapInstanceId
    ? findRollingVwapInstance(rollingVwapInstances, editingRollingVwapInstanceId)
    : undefined
  const editingAnchoredVwapInstance = editingAnchoredVwapInstanceId
    ? anchoredVwapInstances.find((item) => item.id === editingAnchoredVwapInstanceId)
    : undefined

  const fixedRangeVolumeProfileSettingsInstance =
    chartObjectSettingsTarget?.kind === 'fixed-range-volume-profile'
      ? (fixedRangeVolumeProfileInstances.find(
          (item) => item.id === chartObjectSettingsTarget.instanceId,
        ) ?? null)
      : null

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-1">
      {!chartReady && (
        <div className="absolute inset-0 z-10 flex min-h-0 flex-col bg-card/90">
          {dataState.status !== 'loading' && (
            <WidgetDataStateView state={dataState} className="flex-1" />
          )}
        </div>
      )}

      {streamLabel && (
        <div className="flex shrink-0 text-[10px] text-muted-foreground">
          <span>{streamLabel}</span>
        </div>
      )}

      {historyNotices.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="flex shrink-0 flex-wrap gap-x-2 text-[10px] text-muted-foreground"
        >
          {historyNotices.map((notice) => (
            <span key={notice}>{notice}</span>
          ))}
        </div>
      )}

      {hoveredAccountFills.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          data-testid="account-fill-readout"
          className="pointer-events-none absolute left-2 top-2 z-20 flex max-w-[min(20rem,80%)] flex-col gap-0.5 rounded-md border border-border bg-card/95 px-2 py-1 text-[10px] tabular-nums text-foreground shadow-sm"
        >
          {hoveredAccountFills.slice(0, 4).map((fill) => (
            <div key={hyperliquidFillIdentityKey(fill)} className="flex flex-col">
              <span>
                <span className={fill.side === 'B' ? 'text-up' : 'text-down'}>
                  {fill.side === 'B' ? 'Buy' : 'Sell'}
                </span>{' '}
                · {fill.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} ·{' '}
                {fill.size.toLocaleString(undefined, { maximumFractionDigits: 5 })} BTC
              </span>
              <span className="text-muted-foreground">
                {formatSeriesLabel(fill.time)} · pos{' '}
                {fill.positionBefore === null
                  ? '—'
                  : fill.positionBefore.toLocaleString(undefined, {
                      maximumFractionDigits: 5,
                    })}{' '}
                →{' '}
                {fill.positionAfter === null
                  ? '—'
                  : fill.positionAfter.toLocaleString(undefined, {
                      maximumFractionDigits: 5,
                    })}
              </span>
            </div>
          ))}
          {hoveredAccountFills.length > 4 && (
            <span className="text-muted-foreground">
              +{hoveredAccountFills.length - 4} more fill
              {hoveredAccountFills.length - 4 === 1 ? '' : 's'} in this candle
            </span>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        data-testid="btc-perp-chart"
        data-panel-id={panelId}
        className={cn(
          'min-h-[5rem] w-full flex-1 basis-0',
          !chartReady && 'pointer-events-none opacity-0',
        )}
        aria-hidden={!chartReady}
      />

      {/*
        Mount beside the Rolling/Anchored settings dialogs, not inside
        HeaderToolsMenu: a dialog nested in the Tools dropdown host ignores
        Radix's outside-pointerdown dismissal in this build (the menu host
        swallows the deferred click). This keeps Cancel/X/Esc/outside identical
        to the other chart-object dialogs while the Tools gear still opens it
        through the shared ChartObjectSettingsTarget.
      */}
      {headerSettings.tools === true && (
        <FixedRangeVolumeProfileSettingsDialog
          instance={fixedRangeVolumeProfileSettingsInstance}
          returnFocusId={`${panelId}-tools`}
          onOpenChange={(open) => {
            if (!open) setChartObjectSettingsTarget(null)
          }}
          onRowCountChange={handleFixedRangeVolumeProfileRowCountChange}
          onValueAreaPercentChange={handleFixedRangeVolumeProfileValueAreaChange}
          onExtendRightChange={handleFixedRangeVolumeProfileExtendRightChange}
          onHistogramColorChange={handleFixedRangeVolumeProfileHistogramColorChange}
          onHistogramOpacityChange={handleFixedRangeVolumeProfileHistogramOpacityChange}
          onHistogramWidthChange={handleFixedRangeVolumeProfileHistogramWidthChange}
          onHistogramBarHeightChange={handleFixedRangeVolumeProfileHistogramBarHeightChange}
          onLevelStrokeColorChange={handleFixedRangeVolumeProfileLevelStrokeColorChange}
          onLevelLineWidthChange={handleFixedRangeVolumeProfileLevelLineWidthChange}
          onLevelLineStyleChange={handleFixedRangeVolumeProfileLevelLineStyleChange}
          onLevelStrokeOpacityChange={handleFixedRangeVolumeProfileLevelStrokeOpacityChange}
        />
      )}
      <AnchoredVwapSettingsDialog
        open={anchoredVwapSettingsOpen}
        instanceLabel={
          editingAnchoredVwapInstance
            ? formatAnchoredVwapInstanceLabel(editingAnchoredVwapInstance)
            : undefined
        }
        savedSettings={
          editingAnchoredVwapInstance?.settings ?? createDefaultAnchoredVwapDrawingSettings()
        }
        returnFocusId={`${panelId}-indicators`}
        onOpenChange={(open) => {
          setAnchoredVwapSettingsOpen(open)
          if (!open) {
            setEditingAnchoredVwapInstanceId(null)
            setChartObjectSettingsTarget(null)
          }
        }}
        onSave={handleAnchoredVwapSettingsSave}
      />
      <RollingVwapSettingsDialog
        open={rollingVwapSettingsOpen}
        instanceLabel={
          editingRollingVwapInstance
            ? rollingVwapInstanceDisplayLabel(editingRollingVwapInstance)
            : undefined
        }
        savedSettings={
          editingRollingVwapInstance?.settings ?? createDefaultRollingVwapSettings()
        }
        returnFocusId={`${panelId}-indicators`}
        onOpenChange={(open) => {
          setRollingVwapSettingsOpen(open)
          if (!open) {
            setEditingRollingVwapInstanceId(null)
            setChartObjectSettingsTarget(null)
          }
        }}
        onSave={handleRollingVwapSettingsSave}
      />
      <AggregatedLiquidationsSettingsDialog
        open={liquidationsSettingsOpen}
        settings={liquidationSettings}
        returnFocusId={`${panelId}-indicators`}
        onOpenChange={(open) => {
          setLiquidationsSettingsOpen(open)
          if (!open) setChartObjectSettingsTarget(null)
        }}
        onSettingsChange={handleLiquidationSettingsChange}
      />
      <MarketPositionMarkerSettingsDialog
        open={positionMarkerSettingsOpen}
        panelId={panelId}
        settings={positionMarkerSettings}
        returnFocusId={`${panelId}-indicators`}
        onOpenChange={setPositionMarkerSettingsOpen}
        onSettingsChange={handlePositionMarkerSettingsChange}
      />
      <MarketIndicatorStyleDialog
        indicatorId={editingMarketIndicatorId}
        presentation={marketIndicatorPresentation}
        seriesColors={editingMarketIndicatorSeriesColors}
        seriesLineWidths={editingMarketIndicatorSeriesLineWidths}
        seriesLineStyles={editingMarketIndicatorSeriesLineStyles}
        rsiSettings={rsiSettings}
        sessionVwapSeriesInputs={editingSessionVwapSeriesInputs}
        returnFocusId={`${panelId}-indicators`}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMarketIndicatorId(null)
            setEditingMarketIndicatorSeriesColors([])
            setEditingMarketIndicatorSeriesLineWidths([])
            setEditingMarketIndicatorSeriesLineStyles([])
            setEditingSessionVwapSeriesInputs(null)
            setChartObjectSettingsTarget(null)
          }
        }}
        onPresentationChange={handleMarketIndicatorPresentationChange}
        onRsiSettingsChange={handleRsiSettingsChange}
      />
    </div>
  )
}
