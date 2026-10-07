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
import { computeInitialVisibleLogicalRange } from '@/market/chartInitialVisibleRange'
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
  type RollingVwapInstance,
} from '@/market/rollingVwapInstances'
import { createDefaultRollingVwapSettings } from '@/market/rollingVwapSettings'
import { saveWidgetRollingVwapInstances } from '@/rollingVwapInstancesStorage'
import {
  loadWidgetFixedRangeVolumeProfileInstances,
  saveWidgetFixedRangeVolumeProfileInstances,
} from '@/fixedRangeVolumeProfileInstancesStorage'
import {
  attachFixedRangeVolumeProfileChartTool,
  type FixedRangeVolumeProfileChartToolController,
} from '@/market/fixedRangeVolumeProfileChartTool'
import {
  armFixedRangeVolumeProfileTool,
  cancelFixedRangeVolumeProfileInteraction,
  INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
  type FixedRangeVolumeProfileInteractionState,
} from '@/market/fixedRangeVolumeProfileInteraction'
import {
  sanitizeFixedRangeVolumeProfileInstances,
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
  applyRectangleSelection,
  armRectangleTool,
  cancelRectangleInteraction,
  INITIAL_RECTANGLE_INTERACTION_STATE,
  type RectangleInteractionState,
} from '@/market/rectangleInteraction'
import {
  claimRectangleKeyboardPanel,
  isActiveRectangleKeyboardPanel,
} from '@/market/rectangleKeyboardScope'
import {
  sanitizeRectangleInstances,
  type RectangleInstance,
} from '@/market/rectangleInstances'
import { attachRectangleSeriesPrimitive } from '@/market/rectangleSeriesPrimitive'
import { EMA_PERIODS } from '@/market/ema'
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

const EMA_COLOR_VARS = ['--chart-2', '--chart-3', '--chart-4'] as const
const EMA_200_COLOR_VAR = '--chart-1'

function readThemeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    background: 'transparent',
    text: resolveCssColor(style.getPropertyValue('--foreground'), '#d4d4d8'),
    ema: EMA_COLOR_VARS.map((token, index) =>
      resolveCssColor(style.getPropertyValue(token), ['#a3a3a3', '#737373', '#525252'][index]),
    ),
    ema200: resolveCssColor(style.getPropertyValue(EMA_200_COLOR_VAR), '#dedede'),
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
  const [fixedRangeVolumeProfileInstances, setFixedRangeVolumeProfileInstances] = useState<
    FixedRangeVolumeProfileInstance[]
  >(() =>
    loadWidgetFixedRangeVolumeProfileInstances(panelId, {
      selectionIntervalFallback: loadWidgetMarketInterval(panelId),
    }),
  )
  const [fixedRangeVolumeProfileInteraction, setFixedRangeVolumeProfileInteraction] =
    useState<FixedRangeVolumeProfileInteractionState>(INITIAL_FIXED_RANGE_VP_INTERACTION_STATE)
  const [rectangleInstances, setRectangleInstances] = useState<RectangleInstance[]>(() =>
    loadWidgetRectangleInstances(panelId),
  )
  const [rectangleInteraction, setRectangleInteraction] = useState<RectangleInteractionState>(
    INITIAL_RECTANGLE_INTERACTION_STATE,
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

  useEffect(() => {
    rollingVwapInstancesRef.current = rollingVwapInstances
  }, [rollingVwapInstances])

  useEffect(() => {
    fixedRangeVolumeProfileInstancesRef.current = fixedRangeVolumeProfileInstances
  }, [fixedRangeVolumeProfileInstances])

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
      if (rectangleInteractionRef.current.selectedId === null) return
      const next = applyRectangleSelection(rectangleInteractionRef.current, null)
      rectangleInteractionRef.current = next
      setRectangleInteraction(next)
      rectangleSeriesAttachmentRef.current?.update()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
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

  const handleRectangleArm = useCallback(() => {
    claimRectangleKeyboardPanel(panelId)
    const cancelledFrvp = cancelFixedRangeVolumeProfileInteraction(
      fixedRangeVolumeProfileInteractionRef.current,
    )
    if (cancelledFrvp !== fixedRangeVolumeProfileInteractionRef.current) {
      fixedRangeVolumeProfileInteractionRef.current = cancelledFrvp
      setFixedRangeVolumeProfileInteraction(cancelledFrvp)
      fixedRangeVolumeProfileToolControllerRef.current?.sync()
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

  const handleFixedRangeVolumeProfileArm = useCallback(() => {
    const cancelledRectangle = cancelRectangleInteraction(rectangleInteractionRef.current)
    if (cancelledRectangle !== rectangleInteractionRef.current) {
      rectangleInteractionRef.current = cancelledRectangle
      setRectangleInteraction(cancelledRectangle)
      rectangleToolControllerRef.current?.sync()
      rectangleSeriesAttachmentRef.current?.update()
    }
    const armed = armFixedRangeVolumeProfileTool()
    fixedRangeVolumeProfileInteractionRef.current = armed
    setFixedRangeVolumeProfileInteraction(armed)
    fixedRangeVolumeProfileToolControllerRef.current?.sync()
  }, [])

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

  const handleRollingVwapSettingsClick = useCallback((instanceId: string) => {
    setEditingRollingVwapInstanceId(instanceId)
    setRollingVwapSettingsOpen(true)
  }, [])

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
    fixedRangeVolumeProfileInstances,
    onFixedRangeVolumeProfileArm: handleFixedRangeVolumeProfileArm,
    onFixedRangeVolumeProfileDelete: handleFixedRangeVolumeProfileDelete,
    rectangleInstances,
    onRectangleArm: handleRectangleArm,
    onRectangleDelete: handleRectangleDelete,
    disabled: !chartReady && dataState.status === 'loading',
  })

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return

    const controller = attachFixedRangeVolumeProfileChartTool(chart, {
      getSnapshot: () => ({
        interaction: fixedRangeVolumeProfileInteractionRef.current,
        instances: fixedRangeVolumeProfileInstancesRef.current,
      }),
      getSelectionInterval: () => activeIntervalRef.current,
      onInteractionChange: (state) => {
        fixedRangeVolumeProfileInteractionRef.current = state
        setFixedRangeVolumeProfileInteraction(state)
      },
      onInstanceCompleted: (instance) => {
        persistFixedRangeVolumeProfileInstances([
          ...fixedRangeVolumeProfileInstancesRef.current,
          instance,
        ])
      },
    })
    fixedRangeVolumeProfileToolControllerRef.current = controller
    controller.sync()
    return () => {
      controller.dispose()
      fixedRangeVolumeProfileToolControllerRef.current = null
    }
  }, [chartReady, persistFixedRangeVolumeProfileInstances])

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
        rectangleInteractionRef.current = state
        setRectangleInteraction(state)
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
      getFixedRangeVolumeProfileInteraction: () =>
        fixedRangeVolumeProfileInteractionRef.current,
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
    const bundle = seriesRef.current
    if (!chart || !bundle || !chartReady) return

    const attachment = attachFixedRangeVolumeProfileSeriesPrimitive(bundle.candle, () => ({
      instances: fixedRangeVolumeProfileInstancesRef.current,
      runtimeById: fixedRangeVolumeProfileRuntimeRef.current,
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
  }, [fixedRangeVolumeProfileInstances])

  useEffect(() => {
    const chart = chartRef.current
    const bundle = seriesRef.current
    if (!chart || !bundle || !chartReady) return

    const attachment = attachRectangleSeriesPrimitive(bundle.candle, () => ({
      instances: rectangleInstancesRef.current,
      interaction: rectangleInteractionRef.current,
      pointerTime: rectanglePointerPreviewRef.current.pointerTime,
      pointerPrice: rectanglePointerPreviewRef.current.pointerPrice,
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
    activeIndicatorsRef.current = activeIndicators
  }, [activeIndicators])

  useEffect(() => {
    const bundle = seriesRef.current
    if (!bundle) return
    applyEmaIndicatorSeriesVisibility(bundle, activeIndicators)
    syncAllVwapVisibility(bundle)
  }, [activeIndicators, chartReady, interval, rollingVwapInstances, syncAllVwapVisibility])

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
    const container = containerRef.current
    if (!container) return

    const colors = readThemeColors()
    let chart: IChartApi | null = null
    let historyListenerChart: IChartApi | null = null

    const onVisibleLogicalRangeChange = (range: LogicalRange | null) => {
      const bundle = seriesRef.current
      const activeChart = chartRef.current
      if (!bundle || !activeChart || activeChart !== historyListenerChart) return
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
        rollingVwapInstances: rollingVwapInstancesRef.current,
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

      const { tripleEma: emaVisible, ema200: ema200SeriesVisible } =
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
      const ema200Series = chart!.addSeries(LineSeries, {
        color: colors.ema200,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        visible: ema200SeriesVisible,
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

      chartRef.current = chart
      seriesRef.current = {
        candle: candleSeries,
        emas: emaSeries,
        ema200: ema200Series,
        dailyVwap: dailyVwapSeries,
        weeklyVwap: weeklyVwapSeries,
        monthlyVwap: monthlyVwapSeries,
        quarterlyVwap: quarterlyVwapSeries,
        yearlyVwap: yearlyVwapSeries,
        rollingVwaps,
      }
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
    resizeObserver.observe(container)
    ensureChart()

    return () => {
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
  }, [])

  useEffect(() => {
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

    const bundle = seriesRef.current
    if (bundle) {
      bundle.candle.setData([])
      bundle.emas.forEach((series) => series.setData([]))
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
        )
      },
    })
    streamRef.current = client
    client.connect()

    const applyInitialSeries = (candles: MarketCandle[]) => {
      const bundleNow = seriesRef.current
      const chart = chartRef.current
      if (!bundleNow || !chart) return false

      reconcileRollingVwapChartBundles(
        chart,
        bundleNow.rollingVwaps,
        rollingVwapInstancesRef.current,
        activeIntervalRef.current,
      )
      applyChartHistorySeries(bundleNow, candles, rollingVwapInstancesRef.current)
      const initialRange = computeInitialVisibleLogicalRange(candles.length)
      if (initialRange) {
        chart.timeScale().setVisibleLogicalRange(initialRange)
      }
      return true
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
        if (!applyInitialSeries(merged)) {
          teardownStream()
          setDataState({
            status: 'error',
            message: 'Chart could not be initialized',
          })
          return
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
              )
            }
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
  }, [interval, syncAllVwapVisibility, liveVwapContext])

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
        applyChartHistorySeries(bundle, merged, rollingVwapInstancesRef.current)

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
          <WidgetDataStateView state={dataState} className="flex-1" />
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
          if (!open) setEditingRollingVwapInstanceId(null)
        }}
        onSave={handleRollingVwapSettingsSave}
      />
    </div>
  )
}
