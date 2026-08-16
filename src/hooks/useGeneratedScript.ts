import { useMemo } from 'react'
import { generateScript, minifySource } from '../lib/codegen'
import { useGraphStore } from '../store/graphStore'

/** Generates the current script from the graph store, honoring the shared
 * Detailed Comments / Minify toggles. Shared by ScriptPreview (which owns
 * the toggle checkboxes and the text panel) and Toolbar (whose Copy/Export
 * buttons need the same text) so there's one computation, not two. */
export function useGeneratedScript() {
  const nodes = useGraphStore((s) => s.nodes)
  const connections = useGraphStore((s) => s.connections)
  const detailedComments = useGraphStore((s) => s.detailedComments)
  const minify = useGraphStore((s) => s.minify)

  const { source, warnings } = useMemo(
    () => generateScript(nodes, connections, { professionalComments: detailedComments }),
    [nodes, connections, detailedComments],
  )
  const minified = useMemo(() => minifySource(source), [source])
  const displayed = minify ? minified : source

  return { source, minified, displayed, warnings }
}
