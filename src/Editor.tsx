import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { getGame } from './games/registry'
import { NodePalette } from './components/NodePalette'
import { GraphCanvas } from './components/GraphCanvas'
import { PropertyPanel } from './components/PropertyPanel'
import { ValidationPanel } from './components/ValidationPanel'
import { ScriptPreview } from './components/ScriptPreview'
import { ResizeHandle } from './components/ResizeHandle'
import { Toolbar } from './components/Toolbar'
import { GraphStoreProvider } from './store/GraphStoreProvider'
import { useGraphStore, useGraphStoreApi } from './store/graphStoreContext'
import { getGraphIssues } from './lib/graphIssues'
import { useDragResize } from './hooks/useDragResize'
import type { Game } from './types/game'

/** Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Shift+Z) drive graph undo/redo — but only
 * when focus isn't inside a text field, where the browser's own native
 * undo for that field should win instead. */
function useUndoRedoShortcuts() {
  const storeApi = useGraphStoreApi()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey
      if (!ctrlOrCmd || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const { undo, redo } = storeApi.getState()
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [storeApi])
}

function addonPrefsKey(gameId: string): string {
  return `wirerig:${gameId}:addons`
}

function loadEnabledAddonIds(gameId: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(addonPrefsKey(gameId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function saveEnabledAddonIds(gameId: string, ids: Set<string>) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(addonPrefsKey(gameId), JSON.stringify([...ids]))
  } catch {
    // Storage full/unavailable — the toggle just won't persist across reloads.
  }
}

function EditorShell({ game }: { game: Game }) {
  const [enabledAddonIds, setEnabledAddonIds] = useState<Set<string>>(() => loadEnabledAddonIds(game.id))
  useEffect(() => saveEnabledAddonIds(game.id, enabledAddonIds), [game.id, enabledAddonIds])

  const nodeDefinitions = useMemo(
    () => [
      ...game.nodeDefinitions,
      ...(game.addons ?? []).filter((a) => enabledAddonIds.has(a.id)).flatMap((a) => a.nodeDefinitions),
    ],
    [game, enabledAddonIds],
  )
  const definitionsById = useMemo(() => new Map(nodeDefinitions.map((d) => [d.Id, d])), [nodeDefinitions])

  const addonToggles = useMemo(
    () =>
      (game.addons ?? []).map((addon) => ({
        id: addon.id,
        label: addon.label,
        description: addon.description,
        enabled: enabledAddonIds.has(addon.id),
        onToggle: (id: string) =>
          setEnabledAddonIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          }),
      })),
    [game, enabledAddonIds],
  )

  const nodes = useGraphStore((s) => s.nodes)
  const connections = useGraphStore((s) => s.connections)
  const selection = useGraphStore((s) => s.selection)
  const addNode = useGraphStore((s) => s.addNode)

  const selectedNode = nodes.find((n) => n.Id === selection.nodeId)
  const selectedDefinition = selectedNode ? definitionsById.get(selectedNode.DefinitionId) : undefined

  const issues = useMemo(
    () => getGraphIssues({ nodes, connections, definitionsById }),
    [nodes, connections, definitionsById],
  )

  const handleAddNode = (definition: (typeof nodeDefinitions)[number]) => {
    const columns = 4
    const x = 60 + (nodes.length % columns) * 260
    const y = 60 + Math.floor(nodes.length / columns) * 200
    addNode(definition, { x, y })
  }

  const [leftWidth, onLeftHandleDown] = useDragResize(260, 'x', 180, 520)
  const [rightWidth, onRightHandleDown] = useDragResize(300, 'x', 220, 640, true)
  const [propertyHeight, onPropertyHandleDown] = useDragResize(220, 'y', 80, 640)
  const [validationHeight, onValidationHandleDown] = useDragResize(160, 'y', 60, 480)

  useUndoRedoShortcuts()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minWidth: 0 }}>
      <Toolbar game={game} nodeDefinitions={nodeDefinitions} />
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ width: leftWidth, flex: '0 0 auto', borderRight: '1px solid #374151', minHeight: 0 }}>
          <NodePalette nodeDefinitions={nodeDefinitions} onAddNode={handleAddNode} title={game.label} addons={addonToggles} />
        </div>

        <ResizeHandle axis="x" onMouseDown={onLeftHandleDown} />

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <ReactFlowProvider>
            <GraphCanvas definitionsById={definitionsById} />
          </ReactFlowProvider>
        </div>

        <ResizeHandle axis="x" onMouseDown={onRightHandleDown} />

        <div
          style={{
            width: rightWidth,
            flex: '0 0 auto',
            borderLeft: '1px solid #374151',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ height: propertyHeight, flex: '0 0 auto', borderBottom: '1px solid #374151', minHeight: 0 }}>
            <PropertyPanel
              scriptNode={selectedNode}
              definition={selectedDefinition}
              itemList={game.itemList}
              logicTypeCatalog={game.logicTypeCatalog}
            />
          </div>
          <ResizeHandle axis="y" onMouseDown={onPropertyHandleDown} />
          <div style={{ height: validationHeight, flex: '0 0 auto', borderBottom: '1px solid #374151', minHeight: 0 }}>
            <ValidationPanel issues={issues} />
          </div>
          <ResizeHandle axis="y" onMouseDown={onValidationHandleDown} />
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
            <ScriptPreview game={game} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Reads `:gameId` from the route, resolves it against the game registry,
 * and mounts one isolated graph-store session for it. Redirects to the
 * landing page for an unknown id instead of rendering a broken editor. */
export function Editor() {
  const { gameId } = useParams()
  const game = gameId ? getGame(gameId) : undefined

  if (!game) return <Navigate to="/" replace />

  return (
    <GraphStoreProvider game={game} key={game.id}>
      <EditorShell game={game} />
    </GraphStoreProvider>
  )
}
