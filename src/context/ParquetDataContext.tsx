import type { ReactNode } from 'react'
import { ParquetDataContext } from '@/context/parquetDataContextValue'
import { useParquetDataLoader } from '@/hooks/useParquetData'

export function ParquetDataProvider({ children }: { children: ReactNode }) {
  const value = useParquetDataLoader()
  return <ParquetDataContext.Provider value={value}>{children}</ParquetDataContext.Provider>
}
