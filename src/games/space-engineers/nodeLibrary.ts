// Node database reused from Scriptilyx SE (ChaosVROne) — see ./README.md for credit.
import rawNodeLibrary from './nodeLibrary.json'
import type { NodeLibrary } from '../../types/graph'

export const nodeLibrary = rawNodeLibrary as NodeLibrary

export const nodeDefinitions = nodeLibrary.Nodes

export const nodeCategories = Array.from(
  new Set(nodeDefinitions.map((n) => n.Category)),
)
