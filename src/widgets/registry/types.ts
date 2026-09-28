import type { ComponentType } from 'react'
import type { LayoutItem } from 'react-grid-layout'
import type { WidgetDataQuerySource } from '@/widgets/data/types'
import type { WidgetSettingsFields } from '@/widgetSettings/types'

export type WidgetGrid = Pick<
  LayoutItem,
  'x' | 'y' | 'w' | 'h' | 'minW' | 'minH' | 'maxW' | 'maxH'
>

export type WidgetDataMetadata =
  | { kind: 'none' }
  | { kind: 'rest'; queries: readonly WidgetDataQuerySource[] }
  | { kind: 'stream'; channel: string }
  | {
      kind: 'query-and-stream'
      queries: readonly WidgetDataQuerySource[]
      channel: string
    }

export type WidgetStateScope = 'instance' | 'workspace'

export type WidgetInstanceProps = {
  panelId: string
  headerSettings: WidgetSettingsFields
}

export type WidgetDefinition = {
  id: string
  title: string
  description: string
  component: ComponentType<WidgetInstanceProps>
  grid: WidgetGrid
  headerSettings: WidgetSettingsFields
  stateScope: WidgetStateScope
  data: WidgetDataMetadata
}
