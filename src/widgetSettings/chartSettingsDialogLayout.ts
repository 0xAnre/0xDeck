/**
 * Shared layout for every BTC Perp chart tool / indicator settings dialog.
 *
 * Presentation rules live in `docs/CHART-OBJECT-STANDARD.md`:
 * - one width and spacing scale wider than the shadcn default `sm:max-w-sm`;
 * - the body scrolls inside the dialog instead of overflowing the viewport;
 * - the chart stays readable behind the dialog, so the overlay is transparent
 *   and unblurred (it still blocks and dismisses on outside click).
 *
 * Plain constants only: dialogs pass them to `DialogContent` as
 * `className` / `overlayClassName`, so there is no dialog shell component.
 */

/** Dialog panel: shared width scale, viewport-bounded height, scrolling body. */
export const CHART_SETTINGS_DIALOG_CONTENT_CLASS =
  'flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden p-5 shadow-lg sm:max-w-md'

/**
 * Transparent, unblurred overlay. `supports-backdrop-filter:backdrop-blur-none`
 * cancels the default `supports-backdrop-filter:backdrop-blur-xs` in the same
 * variant group so no residual blur dims the chart.
 */
export const CHART_SETTINGS_DIALOG_OVERLAY_CLASS =
  'bg-transparent backdrop-blur-none supports-backdrop-filter:backdrop-blur-none'

/** Scroll container for the dialog body (header and footer stay pinned). */
export const CHART_SETTINGS_DIALOG_BODY_CLASS =
  'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain'
