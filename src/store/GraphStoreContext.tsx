import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'
import { createGraphStore, type GraphState } from './graphStore'
import type { Game } from '../types/game'

type GraphStoreApi = UseBoundStore<StoreApi<GraphState>>

const GraphStoreContext = createContext<GraphStoreApi | null>(null)

/** Creates one isolated graph store for `game` (own undo history, own
 * autosave key) and provides it to everything below. Mount one of these
 * per active game — a fresh `game` prop makes a fresh store, so switching
 * games can never leak state between them. */
export function GraphStoreProvider({ game, children }: { game: Game; children: ReactNode }) {
  const store = useMemo(
    () =>
      createGraphStore({
        autosaveKey: `wirerig:${game.id}:graph`,
        legacyAutosaveKey: game.id === 'space-engineers' ? 'scriptilyx-web:graph' : undefined,
        remapLegacyGraph: game.remapLegacyGraph,
      }),
    [game],
  )
  return <GraphStoreContext.Provider value={store}>{children}</GraphStoreContext.Provider>
}

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
