import { createContext, useContext } from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'
import type { GraphState } from './graphStore'

export type GraphStoreApi = UseBoundStore<StoreApi<GraphState>>

export const GraphStoreContext = createContext<GraphStoreApi | null>(null)

/** The store instance itself (for imperative `.getState()`/`.subscribe()`
 * use outside a selector, e.g. a keyboard-shortcut effect). */
export function useGraphStoreApi(): GraphStoreApi {
  const store = useContext(GraphStoreContext)
  if (!store) throw new Error('useGraphStoreApi must be used within a GraphStoreProvider')
  return store
}

export function useGraphStore<T>(selector: (state: GraphState) => T): T {
  return useGraphStoreApi()(selector)
}
