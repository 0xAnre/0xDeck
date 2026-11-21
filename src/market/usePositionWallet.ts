import { useSyncExternalStore } from 'react'
import {
  getPositionWallet,
  subscribePositionWallet,
  type PositionWalletSelection,
} from './positionWallet.ts'

/** The global Position Markers wallet, shared by every panel and workspace. */
export function usePositionWallet(): PositionWalletSelection {
  return useSyncExternalStore(subscribePositionWallet, getPositionWallet, getPositionWallet)
}
