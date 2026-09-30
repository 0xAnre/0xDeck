import { useEffect, useRef, useState } from 'react'
import { FixedRangeVolumeProfileRuntimeController } from '@/market/fixedRangeVolumeProfileRuntimeController'
import type { FixedRangeVolumeProfileInstance } from '@/market/fixedRangeVolumeProfileInstances'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from '@/market/fixedRangeVolumeProfileRuntimeTypes'

export function useFixedRangeVolumeProfileRuntime(
  instances: readonly FixedRangeVolumeProfileInstance[],
): FixedRangeVolumeProfileRuntimeSnapshot {
  const controllerRef = useRef<FixedRangeVolumeProfileRuntimeController | null>(null)
  const [snapshot, setSnapshot] = useState<FixedRangeVolumeProfileRuntimeSnapshot>({})

  useEffect(() => {
    const controller = new FixedRangeVolumeProfileRuntimeController({
      onChange: () => {
        setSnapshot(controller.getSnapshot())
      },
    })
    controllerRef.current = controller
    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.syncInstances(instances)
  }, [instances])

  return snapshot
}
