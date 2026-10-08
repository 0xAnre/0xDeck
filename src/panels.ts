import type { LayoutItem } from 'react-grid-layout'
import {
  WIDGET_REGISTRY,
  getWidgetDefinitionForInstance,
  type WidgetId,
} from '@/widgets/registry'
import type { WidgetGrid } from '@/widgets/registry/types'

export type { WidgetId }
/** @deprecated Use WidgetId */
export type PanelKind = WidgetId

export type PanelGrid = WidgetGrid

export type PanelDef = {
  id: WidgetId
  title: string
  hint: string
  kind: WidgetId
  grid: PanelGrid
}

export type PanelInstance = {
  id: string
  title: string
  hint: string
  kind: WidgetId
  grid: PanelGrid
}

export const PANEL_CATALOG: PanelDef[] = WIDGET_REGISTRY.map((widget) => ({
  id: widget.id,
  title: widget.title,
  hint: widget.description,
  kind: widget.id,
  grid: widget.grid,
}))

export const DEFAULT_ACTIVE_PANELS: string[] = ['kpi-card', 'notes', 'chart', 'data-table']

export function getPanelTemplate(templateId: string): PanelDef | undefined {
  return PANEL_CATALOG.find((panel) => panel.id === templateId)
}

/** @deprecated Use getPanelTemplate or resolvePanelInstance */
export function getPanelById(id: string): PanelDef | undefined {
  return getPanelTemplate(id)
}

function panelTemplateForInstance(instanceId: string): PanelDef | undefined {
  const definition = getWidgetDefinitionForInstance(instanceId)
  if (!definition) return undefined

  const widgetId = definition.id as WidgetId
  return {
    id: widgetId,
    title: definition.title,
    hint: definition.description,
    kind: widgetId,
    grid: definition.grid,
  }
}

export function isPanelInstanceId(instanceId: string): boolean {
  return panelTemplateForInstance(instanceId) !== undefined
}

export function createPanelInstance(templateId: string): PanelInstance | null {
  const template = getPanelTemplate(templateId)
  if (!template) return null

  const suffix = crypto.randomUUID().slice(0, 6)
  const instanceId = `${template.id}-${suffix}`

  return {
    id: instanceId,
    title: template.title,
    hint: template.hint,
    kind: template.kind,
    grid: template.grid,
  }
}

export function resolvePanelInstance(instanceId: string): PanelInstance | null {
  const template = panelTemplateForInstance(instanceId)
  if (!template) return null

  return {
    id: instanceId,
    title: template.title,
    hint: template.hint,
    kind: template.kind,
    grid: template.grid,
  }
}

export function panelDisplayTitle(instance: PanelInstance, activeInstances: PanelInstance[]): string {
  if (instance.kind === 'btc-perpetual-chart') return instance.title

  const sameKind = activeInstances.filter((panel) => panel.kind === instance.kind)
  if (sameKind.length <= 1) return instance.title

  const index = sameKind.findIndex((panel) => panel.id === instance.id) + 1
  return `${instance.title} ${index}`
}

export function createLayoutItem(panel: PanelDef, instanceId: string, y: number): LayoutItem {
  const { minW = 1, minH = 1, maxW, maxH, x } = panel.grid
  return {
    i: instanceId,
    x,
    y,
    w: minW,
    h: minH,
    minW,
    minH,
    maxW,
    maxH,
  }
}
