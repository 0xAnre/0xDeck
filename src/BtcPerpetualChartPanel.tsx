import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type LogicalRange,
} from 'lightweight-charts'
import { useMarketWidgetSettings } from '@/hooks/useMarketWidgetSettings'
import { cn } from '@/lib/utils'
import { applyChartHistorySeries } from '@/market/applyChartHistorySeries'
import { applyChartLiveCandle, type ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import { BTC_PERPETUAL_CANDLESTICK_COLORS } from '@/market/btcPerpetualCandleColors'
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
  maybeRequestOlderBtcPerpHistory,
  resetInfiniteHistoryState,
} from '@/market/btcPerpetualInfiniteHistory'
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
} from '@/market/marketIndicatorSeriesColors'
import { MarketIndicatorStyleDialog } from '@/widgetSettings/MarketIndicatorStyleDialog'
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
  applyAnchoredVwapDrawingSelection,
  armAnchoredVwapDrawingTool,
  cancelAnchoredVwapDrawingInteraction,
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  type AnchoredVwapDrawingInteractionState,
} from '@/market/anchoredVwapDrawingInteraction'
import { attachAnchoredVwapDrawingSeriesPrimitive } from '@/market/anchoredVwapDrawingSeriesPrimitive'
import { AnchoredVwapSettingsDialog } from '@/market/AnchoredVwapSettingsDialog'
import { createDefaultAnchoredVwapDrawingSettings } from '@/market/anchoredVwapDrawingSettings'
import {
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
  applyFixedRangeVolumeProfileSelection,
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
import { attachLineSeriesPrimitive } from '@/market/lineSeriesPrimitive'
import { attachChartObjectSettingsPanePointer } from '@/market/chartObjectSettingsPanePointer'
import { EMA_PERIODS } from '@/market/ema'
import {
  applyMarketIndicatorPresentationToBundle,
  syncWidgetMarketIndicatorPresentations,
} from '@/market/marketIndicatorPresentationApply'
import {
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
import type { CandleInterval, MarketCandle } from '@/market/types'
import { klineChannelForInterval } from '@/market/types'
import { saveWidgetMarketIndicators } from '@/marketIndicatorStorage'
import {
  loadWidgetMarketInterval,
  saveWidgetMarketInterval,
} from '@/marketIntervalStorage'
import { WidgetDataStateView } from '@/widgets/components/WidgetDataStateView'
import type { WidgetDataNotReadyState } from '@/widgets/data/types'
import type { WidgetInstanceProps } from '@/widgets/registry/types'
import {
  WidgetStreamClient,
  type WidgetStreamConnectionState,
} from '@/widgets/stream/client'
import type { ServerEventMessage } from '@/widgets/stream/messages'
import { resolveCssColor } from '@/lib/resolveCssColor.ts'
import {
  MARKET_STYLE_DUAL_LINE_SHADES,
  MARKET_STYLE_MULTI_LINE_SHADES,
} from '@/market/marketStylePalette'

/** Theme tokens only drive chart text/background; indicator defaults come from the palette. */
function readThemeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    background: 'transparent',
    text: resolveCssColor(style.getPropertyValue('--foreground'), '#d4d4d8'),
    ema: MARKET_STYLE_MULTI_LINE_SHADES,
    ema100: MARKET_STYLE_DUAL_LINE_SHADES[0],
    ema200: MARKET_STYLE_DUAL_LINE_SHADES[1],
  }
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
  const [streamState, setStreamState] = useState<WidgetStreamConnectionState>('idle')
  const [rollingVwapSettingsOpen, setRollingVwapSettingsOpen] = useState(false)
  const [editingRollingVwapInstanceId, setEditingRollingVwapInstanceId] = useState<string | null>(
    null,
  )
  const [chartObjectSettingsTarget, setChartObjectSettingsTarget] =
    useState<ChartObjectSettingsTarget | null>(null)
  const [editingMarketIndicatorId, setEditingMarketIndicatorId] =
    useState<MarketIndicatorId | null>(null)
  const [marketIndicatorPresentation, setMarketIndicatorPresentation] =
    useState<MarketIndicatorPresentation>({})
  const [editingMarketIndicatorSeriesColors, setEditingMarketIndicatorSeriesColors] = useState<
    readonly string[]
  >([])
  const [editingMarketIndicatorSeriesLineWidths, setEditingMarketIndicatorSeriesLineWidths] =
    useState<readonly LineChartStrokeWidth[]>([])
  const [editingMarketIndicatorSeriesLineStyles, setEditingMarketIndicatorSeriesLineStyles] =
    useState<readonly LineChartStrokeStyle[]>([])
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

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ChartSeriesBundle | null>(null)
  const candlesRef = useRef<MarketCandle[]>([])
  const loadGenerationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const streamRef = useRef<WidgetStreamClient | null>(null)
  const activeIntervalRef = useRef<CandleInterval>(interval)
  const activeIndicatorsRef = useRef<MarketIndicatorId[]>(activeIndicators)
  const historyReadyRef = useRef(false)
  const infiniteHistoryRef = useRef(createInfiniteHistoryState())
  const loadedVwapContextRef = useRef<LoadedVwapContext | null>(null)
  const vwapContextAbortRef = useRef<AbortController | null>(null)
  const vwapContextLatestRequestIdRef = useRef(0)
  const rollingVwapInstancesRef = useRef(rollingVwapInstances)
  const fixedRangeVolumeProfileInstancesRef = useRef(fixedRangeVolumeProfileInstances)
  const fixedRangeVolumeProfileInteractionRef = useRef(fixedRangeVolumeProfileInteraction)
  const fixedRangeVolumeProfileToolControllerRef =
    useRef<FixedRangeVolumeProfileChartToolController | null>(null)
  const fixedRangeVolumeProfileRuntimeById = useFixedRangeVolumeProfileRuntime(
    fixedRangeVolumeProfileInstances,
    fixedRangeVolumeProfileLiveRightEdge,
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
      if (rectangleInteractionRef.current.selectedId !== null) {
        const next = applyRectangleSelection(rectangleInteractionRef.current, null)
        rectangleInteractionRef.current = next
        setRectangleInteraction(next)
        rectangleSeriesAttachmentRef.current?.update()
      }
      if (lineInteractionRef.current.selectedId !== null) {
        const next = applyLineSelection(lineInteractionRef.current, null)
        lineInteractionRef.current = next
        setLineInteraction(next)
        lineSeriesAttachmentRef.current?.update()
      }
      if (fixedRangeVolumeProfileInteractionRef.current.selectedId !== null) {
        const next = applyFixedRangeVolumeProfileSelection(
          fixedRangeVolumeProfileInteractionRef.current,
          null,
        )
        if (next !== fixedRangeVolumeProfileInteractionRef.current) {
          fixedRangeVolumeProfileInteractionRef.current = next
          setFixedRangeVolumeProfileInteraction(next)
          fixedRangeVolumeProfileToolControllerRef.current?.sync()
          fixedRangeVolumeProfileSeriesAttachmentRef.current?.update()
        }
      }
      if (anchoredVwapInteractionRef.current.selectedId !== null) {
        const next = applyAnchoredVwapDrawingSelection(
          anchoredVwapInteractionRef.current,
          null,
        )
        if (next !== anchoredVwapInteractionRef.current) {
          anchoredVwapInteractionRef.current = next
          setAnchoredVwapInteraction(next)
          anchoredVwapToolControllerRef.current?.sync()
          anchoredVwapSeriesAttachmentRef.current?.update()
        }
      }
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
  }, [panelId])

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
      setEditingMarketIndicatorId(target.indicatorId)
      setMarketIndicatorPresentation(
        loadWidgetMarketIndicatorPresentation(panelId, target.indicatorId),
      )
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

  const handleMarketIndicatorSettingsClick = useCallback(
    (indicatorId: MarketIndicatorId) => {
      openChartObjectSettings({ kind: 'market-indicator', indicatorId })
    },
    [openChartObjectSettings],
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

  const handleMarketIndicatorsChange = useCallback(
    (next: MarketIndicatorId[]) => {
      saveWidgetMarketIndicators(panelId, next)
      setActiveIndicators(next)
    },
    [panelId],
  )

  const handleIntervalChange = useCallback(
    (next: CandleInterval) => {
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
      setDataState({ status: 'loading' })
      setChartReady(false)
      setStreamState('idle')
      setInterval(next)
    },
    [panelId],
  )

  useMarketWidgetSettings({
    headerSettings,
    panelId,
    marketInterval: interval,
    onMarketIntervalChange: handleIntervalChange,
    marketIndicators: activeIndicators,
    onMarketIndicatorsChange: handleMarketIndicatorsChange,
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
    onFixedRangeVolumeProfileRowCountChange: handleFixedRangeVolumeProfileRowCountChange,
    onFixedRangeVolumeProfileValueAreaChange: handleFixedRangeVolumeProfileValueAreaChange,
    onFixedRangeVolumeProfileExtendRightChange:
      handleFixedRangeVolumeProfileExtendRightChange,
    onFixedRangeVolumeProfileLevelStrokeColorChange:
      handleFixedRangeVolumeProfileLevelStrokeColorChange,
    onFixedRangeVolumeProfileLevelLineWidthChange:
      handleFixedRangeVolumeProfileLevelLineWidthChange,
    onFixedRangeVolumeProfileLevelLineStyleChange:
      handleFixedRangeVolumeProfileLevelLineStyleChange,
    onFixedRangeVolumeProfileLevelStrokeOpacityChange:
      handleFixedRangeVolumeProfileLevelStrokeOpacityChange,
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
      getHitTestContext: (paneX, paneY) => {
        const bundle = seriesRef.current
        const candleSeries = bundle?.candle
        if (!bundle || !candleSeries) return null
        const loaded = loadedVwapContextRef.current
        return {
          chart,
          series: candleSeries,
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
    })

    return () => {
      controller.dispose()
    }
  }, [chartReady, openChartObjectSettings])

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
    const bundle = seriesRef.current
    if (!bundle) return
    applyEmaIndicatorSeriesVisibility(bundle, activeIndicators)
    syncAllVwapVisibility(bundle)
    syncWidgetMarketIndicatorPresentations(panelId, bundle)
  }, [activeIndicators, chartReady, interval, panelId, rollingVwapInstances, syncAllVwapVisibility])

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
    const container = containerRef.current
    if (!container) return

    const colors = readThemeColors()
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

      chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: colors.background },
          textColor: colors.text,
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

      const candleSeries = chart.addSeries(CandlestickSeries, BTC_PERPETUAL_CANDLESTICK_COLORS)

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
      streamRef.current?.disconnect()
      streamRef.current = null
      abortRef.current?.abort()
      abortRef.current = null
      chart?.remove()
      chartRef.current = null
      seriesRef.current = null
      candlesRef.current = []
      historyReadyRef.current = false
    }
  }, [flushMarketChartViewportPersist, panelId, scheduleMarketChartViewportPersist])

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

    activeIntervalRef.current = interval
    loadGenerationRef.current += 1
    const generation = loadGenerationRef.current
    historyReadyRef.current = false
    loadedVwapContextRef.current = null
    cancelActiveVwapContextRequest(vwapContextAbortRef, vwapContextLatestRequestIdRef)
    resetInfiniteHistoryState(infiniteHistoryRef.current, generation)

    abortRef.current?.abort()
    streamRef.current?.disconnect()
    streamRef.current = null
    candlesRef.current = []
    syncFixedRangeVolumeProfileLiveRightEdge()

    const bundle = seriesRef.current
    if (bundle) {
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
    }

    const controller = new AbortController()
    abortRef.current = controller

    const channel = klineChannelForInterval(interval)
    const streamBuffer = new Map<number, MarketCandle>()
    let historyReady = false
    const initialContextLevel = requiredVwapContextLevel(activeIndicatorsRef.current, interval)

    const teardownStream = () => {
      streamRef.current?.disconnect()
      streamRef.current = null
      streamBuffer.clear()
    }

    const client = new WidgetStreamClient({
      channel,
      onStateChange: (state) => {
        if (generation !== loadGenerationRef.current) return
        setStreamState(state)
      },
      onMessage: (message) => {
        if (generation !== loadGenerationRef.current) return
        if (message.type !== 'event') return

        const candle = parseMarketCandlePayload((message as ServerEventMessage).payload)
        if (!candle) return
        if (candle.interval !== activeIntervalRef.current) return

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
    streamRef.current = client
    client.connect()

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
                interval: currentInterval,
                visibleTimeRange: saved.visibleTimeRange,
                candlesRef,
                bundle: bundleForHistory,
                chart,
                signal: controller.signal,
                getRollingVwapInstances: () => rollingVwapInstancesRef.current,
                getAnchoredVwapInstances: () => anchoredVwapInstancesRef.current,
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
          controller.signal,
        )
        if (generation !== loadGenerationRef.current) return
        if (response.interval !== interval) return

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
      streamRef.current?.disconnect()
      streamRef.current = null
    }
  }, [flushMarketChartViewportPersist, interval, panelId, syncAllVwapVisibility, liveVwapContext, syncFixedRangeVolumeProfileLiveRightEdge])

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
          })
        ) {
          return
        }

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
        )

        const shifted = shiftVisibleLogicalRange(logicalRange, addedCount)
        if (shifted) {
          chart.timeScale().setVisibleLogicalRange(shifted)
        }

        loadedVwapContextRef.current = { level: requestContextLevel, interval: currentInterval }
        syncAllVwapVisibility(bundle)
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
  }, [activeIndicators, chartReady, interval, syncAllVwapVisibility])

  const streamLabel = chartReady ? streamStatusLabel(streamState) : null

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

      <div
        ref={containerRef}
        className={cn(
          'min-h-[5rem] w-full flex-1 basis-0',
          !chartReady && 'pointer-events-none opacity-0',
        )}
        aria-hidden={!chartReady}
      />

      <AnchoredVwapSettingsDialog
        open={anchoredVwapSettingsOpen}
        savedSettings={
          editingAnchoredVwapInstanceId
            ? (anchoredVwapInstances.find((item) => item.id === editingAnchoredVwapInstanceId)
                ?.settings ?? createDefaultAnchoredVwapDrawingSettings())
            : createDefaultAnchoredVwapDrawingSettings()
        }
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
        savedSettings={
          editingRollingVwapInstanceId
            ? (findRollingVwapInstance(rollingVwapInstances, editingRollingVwapInstanceId)
                ?.settings ?? createDefaultRollingVwapSettings())
            : createDefaultRollingVwapSettings()
        }
        onOpenChange={(open) => {
          setRollingVwapSettingsOpen(open)
          if (!open) {
            setEditingRollingVwapInstanceId(null)
            setChartObjectSettingsTarget(null)
          }
        }}
        onSave={handleRollingVwapSettingsSave}
      />
      <MarketIndicatorStyleDialog
        indicatorId={editingMarketIndicatorId}
        presentation={marketIndicatorPresentation}
        seriesColors={editingMarketIndicatorSeriesColors}
        seriesLineWidths={editingMarketIndicatorSeriesLineWidths}
        seriesLineStyles={editingMarketIndicatorSeriesLineStyles}
        returnFocusId={`${panelId}-indicators`}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMarketIndicatorId(null)
            setEditingMarketIndicatorSeriesColors([])
            setEditingMarketIndicatorSeriesLineWidths([])
            setEditingMarketIndicatorSeriesLineStyles([])
            setChartObjectSettingsTarget(null)
          }
        }}
        onPresentationChange={handleMarketIndicatorPresentationChange}
      />
    </div>
  )
}
