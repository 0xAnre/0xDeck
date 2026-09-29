import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type LogicalRange,
} from 'lightweight-charts'
import { fetchBinanceBtcusdtKlinesDailyContext } from '@/api/client'
import { useMarketWidgetSettings } from '@/hooks/useMarketWidgetSettings'
import { cn } from '@/lib/utils'
import { applyChartHistorySeries } from '@/market/applyChartHistorySeries'
import { applyChartLiveCandle, type ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import {
  createInfiniteHistoryState,
  maybeRequestOlderBtcPerpHistory,
  resetInfiniteHistoryState,
} from '@/market/btcPerpetualInfiniteHistory'
import {
  clearDailyVwapLineSeriesData,
  createDailyVwapLineSeries,
  setDailyVwapLineSeriesVisible,
} from '@/market/dailyVwapChartSeries'
import { EMA_PERIODS } from '@/market/ema'
import type { MarketIndicatorId } from '@/market/indicators'
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

const BTC_CANDLESTICK_COLORS = {
  upColor: '#3674D9',
  downColor: '#E13255',
  wickUpColor: '#3674D9',
  wickDownColor: '#E13255',
  borderVisible: false,
} as const

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
    grid: resolveCssColor(style.getPropertyValue('--border'), '#3f3f46'),
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
  const dailyVwapVisible = activeIndicators.includes('daily-vwap')

  useEffect(() => {
    activeIndicatorsRef.current = activeIndicators
  }, [activeIndicators])

  useEffect(() => {
    const bundle = seriesRef.current
    if (!bundle) return
    bundle.emas.forEach((series) => {
      series.applyOptions({ visible: tripleEmaVisible })
    })
  }, [tripleEmaVisible])

  useEffect(() => {
    const bundle = seriesRef.current
    if (!bundle) return
    setDailyVwapLineSeriesVisible(bundle.dailyVwap, dailyVwapVisible)
  }, [dailyVwapVisible])

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
          vertLines: { color: colors.grid },
          horzLines: { color: colors.grid },
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

      const candleSeries = chart.addSeries(CandlestickSeries, BTC_CANDLESTICK_COLORS)

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

      const dailyVwapVisibleOnCreate = activeIndicatorsRef.current.includes('daily-vwap')
      const dailyVwapSeries = createDailyVwapLineSeries(chart!, dailyVwapVisibleOnCreate)

      chartRef.current = chart
      seriesRef.current = { candle: candleSeries, emas: emaSeries, dailyVwap: dailyVwapSeries }
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
    }

    const controller = new AbortController()
    abortRef.current = controller

    const channel = klineChannelForInterval(interval)
    const streamBuffer = new Map<number, MarketCandle>()
    let historyReady = false

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
        applyChartLiveCandle(candlesRef.current, candle, bundleLive)
      },
    })
    streamRef.current = client
    client.connect()

    const applyInitialSeries = (candles: MarketCandle[]) => {
      const bundleNow = seriesRef.current
      const chart = chartRef.current
      if (!bundleNow || !chart) return false

      applyChartHistorySeries(bundleNow, candles)
      chart.timeScale().fitContent()
      return true
    }

    void (async () => {
      try {
        const response = await fetchBinanceBtcusdtKlinesDailyContext(interval, controller.signal)
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
              applyChartLiveCandle(candlesRef.current, candle, bundleTail)
            }
          }
        }

        historyReady = true
        historyReadyRef.current = true
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
  }, [interval])

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
