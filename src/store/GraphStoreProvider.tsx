import { useMemo, type ReactNode } from 'react'
import { createGraphStore } from './graphStore'
import { GraphStoreContext } from './graphStoreContext'
import type { Game } from '../types/game'

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
