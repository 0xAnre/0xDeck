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
  isVwapContextAbortError,
  mergeVwapContextCandles,
  shiftVisibleLogicalRange,
  shouldApplyVwapContextResponse,
  vwapContextLevelSatisfiesLoaded,
} from '@/market/btcPerpetualVwapContext'
import { hideAllVwapSeries, syncVwapSeriesVisibility } from '@/market/btcPerpetualChartVwapSync'
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
import {
  loadWidgetMarketIndicators,
  saveWidgetMarketIndicators,
} from '@/marketIndicatorStorage'
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

const EMA_COLOR_VARS = ['--chart-2', '--chart-3', '--chart-4'] as const

function resolveCssColor(value: string, fallback: string): string {
  const input = value.trim() || fallback
  if (input.includes('oklch(') || input.includes('oklab(')) {
    return fallback
  }

  const probe = document.createElement('span')
  probe.style.color = input
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

  if (!resolved || resolved.includes('oklch(') || resolved.includes('oklab(')) {
    return fallback
  }
  return resolved
}

function readThemeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    background: 'transparent',
    text: resolveCssColor(style.getPropertyValue('--foreground'), '#d4d4d8'),
    ema: EMA_COLOR_VARS.map((token, index) =>
      resolveCssColor(style.getPropertyValue(token), ['#a3a3a3', '#737373', '#525252'][index]),
    ),
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
  const [activeIndicators, setActiveIndicators] = useState<MarketIndicatorId[]>(() =>
    loadWidgetMarketIndicators(panelId),
  )
  const [dataState, setDataState] = useState<WidgetDataNotReadyState>({ status: 'loading' })
  const [chartReady, setChartReady] = useState(false)
  const [streamState, setStreamState] = useState<WidgetStreamConnectionState>('idle')

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

  const syncAllVwapVisibility = useCallback((bundle: ChartSeriesBundle) => {
    const loaded = loadedVwapContextRef.current
    syncVwapSeriesVisibility(bundle, {
      activeIndicators: activeIndicatorsRef.current,
      interval: activeIntervalRef.current,
      loadedLevel: loaded?.interval === activeIntervalRef.current ? loaded.level : null,
      loadedInterval: loaded?.interval ?? null,
    })
  }, [])

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
    disabled: !chartReady && dataState.status === 'loading',
  })

  const tripleEmaVisible = activeIndicators.includes('triple-ema')

  useEffect(() => {
    activeIndicatorsRef.current = activeIndicators
  }, [activeIndicators])

  useEffect(() => {
    const bundle = seriesRef.current
    if (!bundle) return
    bundle.emas.forEach((series) => {
      series.applyOptions({ visible: tripleEmaVisible })
    })
    syncAllVwapVisibility(bundle)
  }, [tripleEmaVisible, activeIndicators, chartReady, interval, syncAllVwapVisibility])

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

      const emaVisible = activeIndicatorsRef.current.includes('triple-ema')
      const emaSeries = EMA_PERIODS.map((_, index) =>
        chart!.addSeries(LineSeries, {
          color: colors.ema[index] ?? colors.ema[0],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          visible: emaVisible,
        }),
      )

      const dailyVwapSeries = createDailyVwapLineSeries(chart!, false)
      const weeklyVwapSeries = createWeeklyVwapLineSeries(chart!, false)
      const monthlyVwapSeries = createMonthlyVwapLineSeries(chart!, false)
      const quarterlyVwapSeries = createQuarterlyVwapLineSeries(chart!, false)
      const yearlyVwapSeries = createYearlyVwapLineSeries(chart!, false)

      chartRef.current = chart
      seriesRef.current = {
        candle: candleSeries,
        emas: emaSeries,
        dailyVwap: dailyVwapSeries,
        weeklyVwap: weeklyVwapSeries,
        monthlyVwap: monthlyVwapSeries,
        quarterlyVwap: quarterlyVwapSeries,
        yearlyVwap: yearlyVwapSeries,
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
    vwapContextLatestRequestIdRef.current += 1
    vwapContextAbortRef.current?.abort()
    vwapContextAbortRef.current = null
    resetInfiniteHistoryState(infiniteHistoryRef.current, generation)

    abortRef.current?.abort()
    streamRef.current?.disconnect()
    streamRef.current = null
    candlesRef.current = []

    const bundle = seriesRef.current
    if (bundle) {
      bundle.candle.setData([])
      bundle.emas.forEach((series) => series.setData([]))
      clearDailyVwapLineSeriesData(bundle.dailyVwap)
      clearWeeklyVwapLineSeriesData(bundle.weeklyVwap)
      clearMonthlyVwapLineSeriesData(bundle.monthlyVwap)
      clearQuarterlyVwapLineSeriesData(bundle.quarterlyVwap)
      clearYearlyVwapLineSeriesData(bundle.yearlyVwap)
      hideAllVwapSeries(bundle)
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
        applyChartLiveCandle(candlesRef.current, candle, bundleLive, liveVwapContext())
      },
    })
    streamRef.current = client
    client.connect()

    const applyInitialSeries = (candles: MarketCandle[]) => {
      const bundleNow = seriesRef.current
      const chart = chartRef.current
      if (!bundleNow || !chart) return false

      applyChartHistorySeries(bundleNow, candles)
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
              applyChartLiveCandle(candlesRef.current, candle, bundleTail, liveVwapContext())
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
      const bundle = seriesRef.current
      if (bundle) syncAllVwapVisibility(bundle)
      return
    }

    const bundle = seriesRef.current
    const chart = chartRef.current
    if (!bundle || !chart) return

    vwapContextAbortRef.current?.abort()
    const controller = new AbortController()
    vwapContextAbortRef.current = controller
    const generation = loadGenerationRef.current
    const requestId = ++vwapContextLatestRequestIdRef.current

    hideAllVwapSeries(bundle)

    void (async () => {
      try {
        const response = await fetchBtcPerpKlinesForContextLevel(
          neededLevel,
          currentInterval,
          controller.signal,
        )
        if (
          !shouldApplyVwapContextResponse({
            requestGeneration: generation,
            activeGeneration: loadGenerationRef.current,
            requestInterval: currentInterval,
            responseInterval: response.interval,
            requestId,
            latestRequestId: vwapContextLatestRequestIdRef.current,
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
        applyChartHistorySeries(bundle, merged)

        const shifted = shiftVisibleLogicalRange(logicalRange, addedCount)
        if (shifted) {
          chart.timeScale().setVisibleLogicalRange(shifted)
        }

        loadedVwapContextRef.current = { level: neededLevel, interval: currentInterval }
        syncAllVwapVisibility(bundle)
      } catch (error) {
        if (isVwapContextAbortError(error)) return
        if (generation !== loadGenerationRef.current) return
      }
    })()

    return () => {
      controller.abort()
    }
  }, [activeIndicators, chartReady, interval, syncAllVwapVisibility])

  useEffect(() => {
    return () => {
      vwapContextLatestRequestIdRef.current += 1
      vwapContextAbortRef.current?.abort()
    }
  }, [])

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
    </div>
  )
}
