import { useEffect, useRef, useState } from 'react'
import { FixedRangeVolumeProfileRuntimeController } from '@/market/fixedRangeVolumeProfileRuntimeController'
import type { FixedRangeVolumeProfileInstance } from '@/market/fixedRangeVolumeProfileInstances'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from '@/market/fixedRangeVolumeProfileRuntimeTypes'
import type { MarketExchange } from '@/market/types'

export function useFixedRangeVolumeProfileRuntime(
  instances: readonly FixedRangeVolumeProfileInstance[],
  liveRightEdge: number | null = null,
  exchange: MarketExchange = 'binance',
): FixedRangeVolumeProfileRuntimeSnapshot {
  const controllerRef = useRef<FixedRangeVolumeProfileRuntimeController | null>(null)
  const [snapshotState, setSnapshotState] = useState<{
    exchange: MarketExchange
    snapshot: FixedRangeVolumeProfileRuntimeSnapshot
  }>({ exchange, snapshot: {} })

  useEffect(() => {
    // Recreating on exchange switch aborts in-flight requests and drops the
    // previous provider's profiles; shared instances start fresh.
    const controller = new FixedRangeVolumeProfileRuntimeController({
      exchange,
      onChange: () => {
        setSnapshotState({ exchange, snapshot: controller.getSnapshot() })
      },
    })
    controllerRef.current = controller
    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [exchange])

  useEffect(() => {
    controllerRef.current?.syncInstances(instances, liveRightEdge)
  }, [exchange, instances, liveRightEdge])

  return snapshotState.exchange === exchange ? snapshotState.snapshot : {}
}
