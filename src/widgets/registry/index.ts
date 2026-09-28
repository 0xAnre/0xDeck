import { WIDGET_REGISTRY, type WidgetId } from '@/widgets/registry/definitions'
import type { WidgetDefinition } from '@/widgets/registry/types'

export { WIDGET_REGISTRY, type WidgetId } from '@/widgets/registry/definitions'
export type {
  WidgetDataMetadata,
  WidgetDefinition,
  WidgetGrid,
  WidgetInstanceProps,
  WidgetStateScope,
} from '@/widgets/registry/types'
export type { WidgetDataQuerySource } from '@/widgets/data/types'

export function getWidgetDefinition(id: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((widget) => widget.id === id)
}

export function getWidgetDefinitionForInstance(instanceId: string): WidgetDefinition | undefined {
  const exact = getWidgetDefinition(instanceId)
  if (exact) return exact

  return WIDGET_REGISTRY.find((widget) => instanceId.startsWith(`${widget.id}-`))
}

export function widgetHasHeaderControls(definition: WidgetDefinition): boolean {
  const fields = definition.headerSettings
  return (
    fields.dataset ||
    fields.timeRange ||
    fields.columns ||
    fields.metric ||
    fields.aggregation
  )
}

export function isKnownWidgetId(id: string): id is WidgetId {
  return getWidgetDefinition(id) !== undefined
}
