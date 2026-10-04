import type { IChartApi } from 'lightweight-charts'

export function applyMarketChartDrawingInteractionLock(chart: IChartApi, locked: boolean): void {
  chart.applyOptions({
    handleScroll: locked
      ? { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false }
      : {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
    handleScale: locked
      ? {
          mouseWheel: false,
          pinch: false,
          axisPressedMouseMove: { time: false, price: false },
          axisDoubleClickReset: { time: false, price: false },
        }
      : {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: { time: true, price: true },
          axisDoubleClickReset: { time: true, price: true },
        },
  })
}
