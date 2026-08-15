export type PropertyType = 'text' | 'multiline' | 'number' | 'combo' | 'bool'

export interface NodePropertyDefinition {
  Type: PropertyType
  DefaultValue: string
  Options: string[]
}

export interface NodeDefinition {
  Id: string
  Category: string
  Title: string
  Description: string
  Search: string
  ActionType: string
  InputPorts: string[]
  OutputPorts: string[]
  Properties: Record<string, NodePropertyDefinition>
  Preview: string
}

export interface NodeLibrary {
  Nodes: NodeDefinition[]
}

export interface ScriptNode {
  Id: string
  Number: number
  DefinitionId: string
  ActionType: string
  Title: string
  Description: string
  X: number
  Y: number
  InputPorts: string[]
  OutputPorts: string[]
  Properties: Record<string, string>
}

export interface NodeConnection {
  FromNodeId: string
  FromPort: string
  ToNodeId: string
  ToPort: string
}

export interface GraphSaveData {
  Nodes: ScriptNode[]
  Connections: NodeConnection[]
  NextNodeNumber: number
  Zoom: number
}
