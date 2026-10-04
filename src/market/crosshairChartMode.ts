import { CrosshairMode } from 'lightweight-charts'

export function crosshairModeForEnabled(enabled: boolean): CrosshairMode {
  return enabled ? CrosshairMode.Magnet : CrosshairMode.Hidden
}
