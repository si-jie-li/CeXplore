import type { CellSummary } from '../data/types'
import { canonicalCells, getCanonicalParent, type CanonicalCell } from './canonicalLineage'

export interface LineageNode {
  id: string
  parentId?: string
  children: string[]
  represented: boolean
  resolved: boolean
  relationSource: 'canonical' | 'supplied' | 'unresolved'
  summary?: CellSummary
  canonical?: CanonicalCell
}

export interface LineageModel {
  nodes: Map<string, LineageNode>
  roots: string[]
  unresolvedCellIds: string[]
  representedCellIds: Set<string>
}

function parentFor(cellId: string, overrides: Map<string, string>) {
  const supplied = overrides.get(cellId)
  if (supplied) return { parentId: supplied, source: 'supplied' as const }
  const canonical = getCanonicalParent(cellId)
  if (canonical) return { parentId: canonical, source: 'canonical' as const }
  return { parentId: undefined, source: 'unresolved' as const }
}

export function resolveLineage(
  cells: Map<string, CellSummary>,
  parentOverrides = new Map<string, string>(),
): LineageModel {
  const nodes = new Map<string, LineageNode>()
  const representedCellIds = new Set(cells.keys())

  const ensureNode = (id: string, represented = false) => {
    const relation = parentFor(id, parentOverrides)
    const existing = nodes.get(id)
    if (existing) {
      if (represented) existing.represented = true
      return existing
    }
    const node: LineageNode = {
      id,
      parentId: relation.parentId,
      children: [],
      represented,
      resolved: id === 'P0' || Boolean(relation.parentId),
      relationSource: relation.source,
      summary: cells.get(id),
      canonical: canonicalCells.get(id),
    }
    nodes.set(id, node)
    return node
  }

  for (const cellId of representedCellIds) {
    let currentId: string | undefined = cellId
    const visited = new Set<string>()
    let guard = 0
    while (currentId && guard < 64 && !visited.has(currentId)) {
      visited.add(currentId)
      const node = ensureNode(currentId, representedCellIds.has(currentId))
      currentId = node.parentId
      guard += 1
    }
  }

  for (const node of nodes.values()) {
    if (!node.parentId) continue
    const parent = ensureNode(node.parentId, representedCellIds.has(node.parentId))
    if (!parent.children.includes(node.id)) parent.children.push(node.id)
  }

  const sorter = (a: string, b: string) => {
    const ac = canonicalCells.get(a)
    const bc = canonicalCells.get(b)
    if (ac && bc) return ac.xPosition - bc.xPosition || ac.treeOrder - bc.treeOrder
    if (ac) return -1
    if (bc) return 1
    return a.localeCompare(b, undefined, { numeric: true })
  }
  for (const node of nodes.values()) node.children.sort(sorter)

  const roots = [...nodes.values()]
    .filter((node) => !node.parentId || !nodes.has(node.parentId))
    .map((node) => node.id)
    .sort(sorter)
  const unresolvedCellIds = [...representedCellIds].filter((id) => !nodes.get(id)?.resolved).sort(sorter)
  return { nodes, roots, unresolvedCellIds, representedCellIds }
}

export function getDescendants(model: LineageModel, cellId: string, representedOnly = true) {
  const result: string[] = []
  const stack = [cellId]
  const visited = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = model.nodes.get(id)
    if (!node) continue
    if (!representedOnly || node.represented) result.push(id)
    stack.push(...node.children)
  }
  return result
}

export function getAncestors(model: LineageModel, cellId: string) {
  const result: string[] = []
  let current = model.nodes.get(cellId)?.parentId
  const visited = new Set<string>()
  while (current && !visited.has(current)) {
    visited.add(current)
    result.push(current)
    current = model.nodes.get(current)?.parentId
  }
  return result
}
