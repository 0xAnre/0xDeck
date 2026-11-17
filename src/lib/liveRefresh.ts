/**
 * Wall-clock phase for a periodic live refresh.
 *
 * Widgets re-read a live edge on their own timer. Starting every timer at mount
 * time spreads those ticks across the period, so two panels showing the same
 * window almost never ask inside one share window and the "one read per window"
 * rule only holds for panels that happened to mount together. Anchoring the
 * first tick to a wall-clock multiple of `periodMs` keeps every panel in one
 * phase: their reads of the same window arrive together and collapse into one
 * request (`src/lib/requestCache.ts`), while each panel still refreshes exactly
 * once per period.
 *
 * A timer that starts exactly on a boundary waits a full period (never 0), and a
 * non-positive period returns 0 so a caller cannot busy-loop.
 */
export function nextLiveRefreshDelayMs(nowMs: number, periodMs: number): number {
  if (!Number.isFinite(periodMs) || periodMs <= 0) return 0
  const elapsed = ((nowMs % periodMs) + periodMs) % periodMs
  return elapsed === 0 ? periodMs : periodMs - elapsed
}
