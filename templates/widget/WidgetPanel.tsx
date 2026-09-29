/**
 * Starter widget body — copy to src/ and rename (e.g. src/MyWidgetPanel.tsx).
 * Not imported by the app; see templates/widget/README.md.
 */
import type { WidgetInstanceProps } from '@/widgets/registry/types'

export function WidgetPanel({ panelId, headerSettings }: WidgetInstanceProps) {
  void headerSettings

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 px-0.5">
      <p className="text-xs font-medium text-foreground">Starter widget</p>
      <p className="text-xs text-muted-foreground">
        Instance <span className="font-mono text-foreground">{panelId}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Replace this body with your UI. Shell, header, and drag/resize live in App.tsx.
      </p>
    </div>
  )
}
