export const BREAKPOINTS = {
  lg: 1200,
  md: 768,
  sm: 0,
} as const

export const COLS = {
  lg: 36,
  md: 24,
  sm: 12,
} as const

/** 32px @ 12 cols → ~11px @ 36 cols (finer vertical snap, same visual height). */
export const ROW_HEIGHT = 11

export type BreakpointKey = keyof typeof BREAKPOINTS

export const BREAKPOINT_KEYS: BreakpointKey[] = ['lg', 'md', 'sm']

export function breakpointFromWidth(width: number): BreakpointKey {
  if (width >= BREAKPOINTS.lg) return 'lg'
  if (width >= BREAKPOINTS.md) return 'md'
  return 'sm'
}
