import { ChartPanel } from './ChartPanel'
import { DashboardPanel } from './DashboardPanel'
import { DataTablePanel } from './DataTablePanel'
import { KpiCardPanel } from './KpiCardPanel'
import { MarketTimesPanel } from './MarketTimesPanel'
import { NotesPanel } from './NotesPanel'
import { ReportsPanel } from './ReportsPanel'
import type { PanelKind } from './panels'

type PanelContentProps = {
  panelId: string
  kind: PanelKind
}

export function PanelContent({ panelId, kind }: PanelContentProps) {
  switch (kind) {
    case 'notes':
      return <NotesPanel />
    case 'market-times':
      return <MarketTimesPanel />
    case 'dashboard':
      return <DashboardPanel panelId={panelId} />
    case 'reports':
      return <ReportsPanel panelId={panelId} />
    case 'chart':
      return <ChartPanel panelId={panelId} />
    case 'kpi-card':
      return <KpiCardPanel panelId={panelId} />
    case 'data-table':
      return <DataTablePanel panelId={panelId} />
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
