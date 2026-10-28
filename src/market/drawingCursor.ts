/**
 * One cursor vocabulary for every chart drawing tool.
 *
 * Each tool resolves its own hit target through the shared hit tests and
 * `drawingPointerArbitration.ts`; it then feeds that target here instead of
 * inventing tool-specific cursor strings. Locked objects keep the plain
 * `pointer` (they stay selectable but cannot be moved or resized) and hidden
 * objects never show a cursor because they are not hit-tested at all.
 */

export const DRAWING_CURSOR_DEFAULT = 'default'
export const DRAWING_CURSOR_POINTER = 'pointer'
export const DRAWING_CURSOR_MOVE = 'move'
export const DRAWING_CURSOR_GRAB = 'grab'
export const DRAWING_CURSOR_CROSSHAIR = 'crosshair'
export const DRAWING_CURSOR_NWSE_RESIZE = 'nwse-resize'
export const DRAWING_CURSOR_NESW_RESIZE = 'nesw-resize'
export const DRAWING_CURSOR_NS_RESIZE = 'ns-resize'
export const DRAWING_CURSOR_EW_RESIZE = 'ew-resize'

/** Handle kinds of all drawing tools (`*HitTarget.kind`). */
export type DrawingCursorHandleKind =
  | 'body'
  | 'interior'
  | 'corner-nw'
  | 'corner-ne'
  | 'corner-se'
  | 'corner-sw'
  | 'edge-n'
  | 'edge-e'
  | 'edge-s'
  | 'edge-w'
  | 'endpoint-a'
  | 'endpoint-b'
  | 'anchor'
  | 'start'
  | 'end'

export type DrawingCursorTarget = {
  kind: DrawingCursorHandleKind
  /**
   * The tool can move this object's body (rectangle/line). Bodies of tools that
   * are not movable (FRVP, anchored VWAP) report `false`.
   */
  movable?: boolean
  /** Locked objects stay selectable but can never be moved or resized. */
  locked?: boolean
  /** Hidden objects are not hit-tested; report the neutral cursor defensively. */
  hidden?: boolean
}

/** CSS cursor for a hit target, or the neutral pane cursor for `null`. */
export function resolveDrawingCursor(target: DrawingCursorTarget | null | undefined): string {
  if (!target) return DRAWING_CURSOR_DEFAULT
  if (target.hidden) return DRAWING_CURSOR_DEFAULT

  const locked = target.locked === true
  const movable = target.movable !== false && !locked

  switch (target.kind) {
    case 'body':
    case 'interior':
      return movable ? DRAWING_CURSOR_MOVE : DRAWING_CURSOR_POINTER
    case 'corner-nw':
    case 'corner-se':
      return locked ? DRAWING_CURSOR_POINTER : DRAWING_CURSOR_NWSE_RESIZE
    case 'corner-ne':
    case 'corner-sw':
      return locked ? DRAWING_CURSOR_POINTER : DRAWING_CURSOR_NESW_RESIZE
    case 'edge-n':
    case 'edge-s':
      return locked ? DRAWING_CURSOR_POINTER : DRAWING_CURSOR_NS_RESIZE
    case 'edge-e':
    case 'edge-w':
    case 'start':
    case 'end':
      return locked ? DRAWING_CURSOR_POINTER : DRAWING_CURSOR_EW_RESIZE
    case 'endpoint-a':
    case 'endpoint-b':
      return locked ? DRAWING_CURSOR_POINTER : DRAWING_CURSOR_CROSSHAIR
    case 'anchor':
      return locked ? DRAWING_CURSOR_POINTER : DRAWING_CURSOR_GRAB
    default: {
      const unreachable: never = target.kind
      return unreachable
    }
  }
}

/**
 * Which tool currently owns the pane cursor. The pane element is shared by all
 * drawing tools, so a tool only ever reports (or releases) its own request
 * instead of writing the element cursor directly; otherwise the last
 * `pointermove` listener would clobber the cursor of the tool that actually
 * won `preferDrawingPointerTargetAmongPeers`.
 */
export type DrawingCursorToolId =
  | 'rectangle'
  | 'line'
  | 'fixed-range-volume-profile'
  | 'anchored-vwap'
  /** Overlay indicators (EMA groups, VWAPs, RSI, liquidations) share this slot. */
  | 'overlay-indicator'

const cursorRequestsByElement = new WeakMap<
  HTMLElement,
  Map<DrawingCursorToolId, DrawingCursorTarget | null>
>()

function writeElementCursor(element: HTMLElement, cursor: string): void {
  if (element.style.cursor === cursor) return
  element.style.cursor = cursor
}

function resolveElementCursor(
  requests: ReadonlyMap<DrawingCursorToolId, DrawingCursorTarget | null>,
): string {
  for (const target of requests.values()) {
    const cursor = resolveDrawingCursor(target)
    if (cursor !== DRAWING_CURSOR_DEFAULT) return cursor
  }
  return DRAWING_CURSOR_DEFAULT
}

function requestsForElement(element: HTMLElement) {
  let requests = cursorRequestsByElement.get(element)
  if (!requests) {
    requests = new Map()
    cursorRequestsByElement.set(element, requests)
  }
  return requests
}

/** Report the hit target the tool currently wins, or `null` when it has none. */
export function updateDrawingCursor(
  element: HTMLElement | null,
  tool: DrawingCursorToolId,
  target: DrawingCursorTarget | null,
): void {
  if (!element) return
  const requests = requestsForElement(element)
  if (requests.get(tool) === target) return
  requests.set(tool, target)
  writeElementCursor(element, resolveElementCursor(requests))
}

/** Drop this tool's cursor request (pointer leave, drag, disarm, dispose). */
export function releaseDrawingCursor(
  element: HTMLElement | null,
  tool: DrawingCursorToolId,
): void {
  if (!element) return
  const requests = cursorRequestsByElement.get(element)
  if (!requests || !requests.has(tool)) return
  requests.delete(tool)
  writeElementCursor(element, resolveElementCursor(requests))
}
