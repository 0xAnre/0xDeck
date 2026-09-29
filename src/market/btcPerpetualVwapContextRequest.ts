export type VwapContextRequestOwner = {
  controller: AbortController
  requestId: number
}

export function isVwapContextAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return false
}

/** Abort and invalidate the active in-flight context request, if any. */
export function cancelActiveVwapContextRequest(
  activeControllerRef: { current: AbortController | null },
  latestRequestIdRef: { current: number },
): void {
  const controller = activeControllerRef.current
  if (!controller) return
  controller.abort()
  activeControllerRef.current = null
  latestRequestIdRef.current += 1
}

/**
 * Effect/async cleanup: only the still-active owner may abort and invalidate its request id.
 */
export function releaseOwnedVwapContextRequest(
  activeControllerRef: { current: AbortController | null },
  latestRequestIdRef: { current: number },
  owner: VwapContextRequestOwner,
): void {
  if (activeControllerRef.current !== owner.controller) return
  owner.controller.abort()
  activeControllerRef.current = null
  if (latestRequestIdRef.current === owner.requestId) {
    latestRequestIdRef.current += 1
  }
}

/** Clear active controller ref after async completion when this owner is still current. */
export function finalizeOwnedVwapContextRequest(
  activeControllerRef: { current: AbortController | null },
  owner: VwapContextRequestOwner,
): void {
  if (activeControllerRef.current === owner.controller) {
    activeControllerRef.current = null
  }
}
