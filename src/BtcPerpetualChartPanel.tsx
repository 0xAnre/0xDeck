import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { fetchBinanceBtcusdtKlines } from '@/api/client'
import { useMarketWidgetSettings } from '@/hooks/useMarketWidgetSettings'
import { cn } from '@/lib/utils'
import { computeEmaLine, EMA_PERIODS } from '@/market/ema'
import { applyLiveCandle, parseMarketCandlePayload } from '@/market/parseMarketCandle'
import type { CandleInterval, MarketCandle } from '@/market/types'
import { klineChannelForInterval } from '@/market/types'
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

const EMA_COLORS = ['var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'] as const

function readThemeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    background: 'transparent',
    text: style.getPropertyValue('--foreground').trim() || '#d4d4d8',
    grid: style.getPropertyValue('--border').trim() || '#3f3f46',
    up: style.getPropertyValue('--up').trim() || '#22c55e',
    down: style.getPropertyValue('--down').trim() || '#ef4444',
  }
}

function toCandlestickPoint(candle: MarketCandle) {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
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

type ChartSeriesBundle = {
  candle: ISeriesApi<'Candlestick'>
  emas: ISeriesApi<'Line'>[]
}

export function BtcPerpetualChartPanel({ panelId, headerSettings }: WidgetInstanceProps) {
  const [interval, setInterval] = useState<CandleInterval>(() =>
    loadWidgetMarketInterval(panelId),
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
    disabled: dataState.status === 'loading',
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const colors = readThemeColors()
    let chart: IChartApi | null = null

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
        width,
        height,
      })

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: colors.up,
        downColor: colors.down,
        borderUpColor: colors.up,
        borderDownColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
      })

      const emaSeries = EMA_PERIODS.map((period, index) =>
        chart!.addSeries(LineSeries, {
          color: EMA_COLORS[index] ?? EMA_COLORS[0],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: `EMA ${period}`,
        }),
      )

      chartRef.current = chart
      seriesRef.current = { candle: candleSeries, emas: emaSeries }
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
      resizeObserver.disconnect()
      streamRef.current?.disconnect()
      streamRef.current = null
      abortRef.current?.abort()
      abortRef.current = null
      chart?.remove()
      chartRef.current = null
      seriesRef.current = null
      candlesRef.current = []
    }
  }, [])

  useEffect(() => {
    activeIntervalRef.current = interval
    loadGenerationRef.current += 1
    const generation = loadGenerationRef.current

    abortRef.current?.abort()
    streamRef.current?.disconnect()
    streamRef.current = null
    candlesRef.current = []

    const bundle = seriesRef.current
    if (bundle) {
      bundle.candle.setData([])
      bundle.emas.forEach((series) => series.setData([]))
    }

    const controller = new AbortController()
    abortRef.current = controller

    const channel = klineChannelForInterval(interval)

    void (async () => {
      try {
        const response = await fetchBinanceBtcusdtKlines(interval, 500, controller.signal)
        if (generation !== loadGenerationRef.current) return
        if (response.interval !== interval) return

        const candles = response.candles.filter((c) => c.interval === interval)
        if (candles.length === 0) {
          setDataState({ status: 'empty' })
          return
        }

        candlesRef.current = [...candles]

        for (let attempt = 0; attempt < 120; attempt += 1) {
          if (generation !== loadGenerationRef.current) return
          if (seriesRef.current && chartRef.current) break
          await new Promise((resolve) => setTimeout(resolve, 16))
        }

        const bundleNow = seriesRef.current
        const chart = chartRef.current
        if (!bundleNow || !chart) {
          setDataState({
            status: 'error',
            message: 'Chart could not be initialized',
          })
          return
        }

        bundleNow.candle.setData(candles.map(toCandlestickPoint))
        EMA_PERIODS.forEach((period, index) => {
          const line = computeEmaLine(candles, period)
          bundleNow.emas[index].setData(
            line.map((point) => ({
              time: point.time as UTCTimestamp,
              value: point.value,
            })),
          )
        })
        chart.timeScale().fitContent()

        setChartReady(true)

        const client = new WidgetStreamClient({
          channel,
          onStateChange: (state) => {
            if (generation !== loadGenerationRef.current) return
            setStreamState(state)
          },
          onMessage: (message) => {
            if (generation !== loadGenerationRef.current) return
            if (message.type !== 'event') return

            const candle = parseMarketCandlePayload(
              (message as ServerEventMessage).payload,
            )
            if (!candle) return
            if (candle.interval !== activeIntervalRef.current) return

            const bundleLive = seriesRef.current
            if (!bundleLive) return

            const applyResult = applyLiveCandle(candlesRef.current, candle)
            if (applyResult === 'ignore') return

            bundleLive.candle.update(toCandlestickPoint(candle))

            EMA_PERIODS.forEach((period, index) => {
              const line = computeEmaLine(candlesRef.current, period)
              if (line.length === 0) return
              const last = line[line.length - 1]
              bundleLive.emas[index].update({
                time: last.time as UTCTimestamp,
                value: last.value,
              })
            })
          },
        })
        streamRef.current = client
        client.connect()
      } catch (error) {
        if (controller.signal.aborted) return
        if (generation !== loadGenerationRef.current) return
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
      streamRef.current?.disconnect()
      streamRef.current = null
    }
  }, [interval])

  const streamLabel = chartReady ? streamStatusLabel(streamState) : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-1">
      {!chartReady && (
        <div className="absolute inset-0 z-10 flex min-h-0 flex-col bg-card/90">
          <WidgetDataStateView state={dataState} className="flex-1" />
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <div className="flex flex-wrap gap-3">
          {EMA_PERIODS.map((period, index) => (
            <span key={period} style={{ color: EMA_COLORS[index] }}>
              EMA {period}
            </span>
          ))}
        </div>
        {streamLabel && <span className="text-muted-foreground">{streamLabel}</span>}
      </div>

      <div
        ref={containerRef}
        className={cn('min-h-0 w-full flex-1', !chartReady && 'pointer-events-none opacity-0')}
        aria-hidden={!chartReady}
      />

      <p className="shrink-0 text-[10px] text-muted-foreground">
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Charts by TradingView
        </a>
      </p>
    </div>
  )
}
