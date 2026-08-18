import { useMemo } from 'react'
import type { Game } from '../types/game'
import { useGraphStore } from '../store/graphStoreContext'

/** Generates the current script from the graph store, honoring the shared
 * Detailed Comments / Minify toggles. Shared by ScriptPreview (which owns
 * the toggle checkboxes and the text panel) and Toolbar (whose Copy/Export
 * buttons need the same text) so there's one computation, not two. */
export function useGeneratedScript(game: Game) {
  const nodes = useGraphStore((s) => s.nodes)
  const connections = useGraphStore((s) => s.connections)
  const detailedComments = useGraphStore((s) => s.detailedComments)
  const minify = useGraphStore((s) => s.minify)

  const { source, warnings } = useMemo(
    () => game.generate(nodes, connections, { professionalComments: detailedComments }),
    [game, nodes, connections, detailedComments],
  )
  const minified = useMemo(() => (game.minify ? game.minify(source) : source), [game, source])
  const displayed = minify ? minified : source

  return { source, minified, displayed, warnings }
}
