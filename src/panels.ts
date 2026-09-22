import type { LayoutItem } from 'react-grid-layout'

type PanelGrid = Pick<
  LayoutItem,
  'x' | 'y' | 'w' | 'h' | 'minW' | 'minH' | 'maxW' | 'maxH'
>

export type PanelKind =
  | 'chart'
  | 'dashboard'
  | 'data-table'
  | 'kpi-card'
  | 'market-times'
  | 'notes'
  | 'reports'

export const CONFIGURABLE_PANEL_KINDS = new Set<PanelKind>([
  'chart',
  'dashboard',
  'data-table',
  'kpi-card',
  'reports',
])

export function isConfigurablePanelKind(kind: PanelKind) {
  return CONFIGURABLE_PANEL_KINDS.has(kind)
}

export type PanelDef = {
  id: string
  title: string
  hint: string
  kind: PanelKind
  grid: PanelGrid
}

export type PanelInstance = {
  id: string
  title: string
  hint: string
  kind: PanelKind
  grid: PanelGrid
}

export const PANEL_CATALOG: PanelDef[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    hint: 'KPI · chart · table',
    kind: 'dashboard',
    grid: { x: 0, y: 0, w: 24, h: 16, minW: 12, minH: 12 },
  },
  {
    id: 'kpi-card',
    title: 'KPI Card',
    hint: 'Metric preview',
    kind: 'kpi-card',
    grid: { x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 },
  },
  {
    id: 'notes',
    title: 'Notes',
    hint: 'Markdown · local save',
    kind: 'notes',
    grid: { x: 0, y: 4, w: 12, h: 12, minW: 8, minH: 8 },
  },
  {
    id: 'market-times',
    title: 'Market Times',
    hint: 'Exchange sessions · open/close',
    kind: 'market-times',
    grid: { x: 0, y: 0, w: 10, h: 12, minW: 8, minH: 10 },
  },
  {
    id: 'chart',
    title: 'Chart',
    hint: 'Line series',
    kind: 'chart',
    grid: { x: 12, y: 0, w: 12, h: 10, minW: 9, minH: 7 },
  },
  {
    id: 'reports',
    title: 'Reports',
    hint: 'Saved queries · export',
    kind: 'reports',
    grid: { x: 0, y: 0, w: 18, h: 14, minW: 10, minH: 10 },
  },
  {
    id: 'data-table',
    title: 'Data Table',
    hint: 'Dataset preview',
    kind: 'data-table',
    grid: { x: 6, y: 0, w: 18, h: 12, minW: 9, minH: 7 },
  },
]

export const DEFAULT_ACTIVE_PANELS = ['kpi-card', 'notes', 'chart', 'data-table']

export function getPanelTemplate(templateId: string): PanelDef | undefined {
  return PANEL_CATALOG.find((panel) => panel.id === templateId)
}

/** @deprecated Use getPanelTemplate or resolvePanelInstance */
export function getPanelById(id: string): PanelDef | undefined {
  return getPanelTemplate(id)
}

function panelTemplateForInstance(instanceId: string): PanelDef | undefined {
  const exact = getPanelTemplate(instanceId)
  if (exact) return exact

  return PANEL_CATALOG.find((panel) => instanceId.startsWith(`${panel.id}-`))
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
