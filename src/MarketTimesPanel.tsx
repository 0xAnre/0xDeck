import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  getMarketRowState,
  getNextMarketTimesWakeMs,
  MARKET_SESSIONS,
} from '@/lib/marketSessions'

export function MarketTimesPanel() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    let timeoutId = 0

    const refresh = () => {
      if (cancelled) return
      setNow(new Date())
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(refresh, getNextMarketTimesWakeMs())
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    timeoutId = window.setTimeout(refresh, getNextMarketTimesWakeMs())
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {MARKET_SESSIONS.map((session) => {
          const row = getMarketRowState(session, now)
          const showProgress = row.isOpen && row.progress01 != null && row.progress01 > 0

          return (
            <div
              key={session.id}
              className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-0.5 border-b border-border px-1 py-2 last:border-b-0"
            >
              <div className="flex min-w-0 gap-2">
                <span
                  className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-full',
                    row.isOpen
                      ? 'bg-up shadow-[0_0_4px_color-mix(in_oklch,var(--up)_50%,transparent)]'
                      : 'bg-down shadow-[0_0_4px_color-mix(in_oklch,var(--down)_35%,transparent)]',
                  )}
                />
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-foreground">
                    {session.city} [{session.exchange}]
                  </div>
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {row.localTimeHHmm}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={cn(
                    'text-xs font-semibold tracking-wide',
                    row.isOpen ? 'text-up' : 'text-muted-foreground',
                  )}
                >
                  {row.statusLabel}
                </div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground/80">
                  {row.countdownLabel}
                </div>
              </div>
              {showProgress && (
                <div className="col-span-full mt-0.5 h-0.5 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="h-full rounded-sm bg-chart-2 transition-[width] duration-400 ease-out"
                    style={{ width: `${row.progress01! * 100}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
