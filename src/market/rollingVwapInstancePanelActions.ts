import {
  addRollingVwapInstance,
  createRollingVwapInstance,
  deleteRollingVwapInstance,
  sanitizeRollingVwapInstances,
  setRollingVwapInstanceEnabled,
  updateRollingVwapInstance,
  type RollingVwapInstance,
} from './rollingVwapInstances.ts'
import { sanitizeRollingVwapSettings, type RollingVwapSettings } from './rollingVwapSettings.ts'

export function addDefaultRollingVwapPanelInstance(
  instances: readonly RollingVwapInstance[],
  randomId?: () => string,
): RollingVwapInstance[] {
  const existingIds = new Set(instances.map((instance) => instance.id))
  const created = createRollingVwapInstance({ existingIds, randomId })
  return addRollingVwapInstance(instances, created)
}

export function toggleRollingVwapPanelInstance(
  instances: readonly RollingVwapInstance[],
  instanceId: string,
  enabled: boolean,
): RollingVwapInstance[] {
  return setRollingVwapInstanceEnabled(instances, instanceId, enabled)
}

export function deleteRollingVwapPanelInstance(
  instances: readonly RollingVwapInstance[],
  instanceId: string,
): RollingVwapInstance[] {
  return deleteRollingVwapInstance(instances, instanceId)
}

export function saveRollingVwapPanelInstanceSettings(
  instances: readonly RollingVwapInstance[],
  instanceId: string,
  settings: RollingVwapSettings,
): RollingVwapInstance[] {
  return updateRollingVwapInstance(instances, instanceId, {
    settings: sanitizeRollingVwapSettings(settings),
  })
}

export function persistRollingVwapPanelInstances(
  instances: readonly RollingVwapInstance[],
): RollingVwapInstance[] {
  return sanitizeRollingVwapInstances(instances)
}
