import type { TemporalMode } from '../data/types'
import type { LineageModel, LineageNode } from './lineageResolver'

export interface LineageLayoutNode {
  id: string
  x: number
  y: number
  value: number
  depth: number
  represented: boolean
  resolved: boolean
  parentId?: string
  firstStep?: number
  lastStep?: number
}

export interface LineageEdge {
  id: string
  from: LineageLayoutNode
  to: LineageLayoutNode
}

export interface LineageLayout {
  nodes: LineageLayoutNode[]
  edges: LineageEdge[]
  width: number
  height: number
  minValue: number
  maxValue: number
}

function nodeSort(a: LineageNode, b: LineageNode) {
  const ax = a.canonical?.xPosition
  const bx = b.canonical?.xPosition
  if (ax !== undefined && bx !== undefined) return ax - bx
  if (ax !== undefined) return -1
  if (bx !== undefined) return 1
  return a.id.localeCompare(b.id, undefined, { numeric: true })
}

export function createLineageLayout(model: LineageModel, mode: TemporalMode): LineageLayout {
  const depths = new Map<string, number>()
  const visitDepth = (id: string, depth: number) => {
    if ((depths.get(id) ?? Infinity) <= depth) return
    depths.set(id, depth)
    for (const child of model.nodes.get(id)?.children ?? []) visitDepth(child, depth + 1)
  }
  model.roots.forEach((root) => visitDepth(root, 0))

  const leaves = [...model.nodes.values()]
    .filter((node) => node.children.length === 0)
    .sort(nodeSort)
  const xPositions = new Map(leaves.map((node, index) => [node.id, 44 + index * 28]))
  const placeInternal = (id: string): number => {
    const existing = xPositions.get(id)
    if (existing !== undefined) return existing
    const children = model.nodes.get(id)?.children ?? []
    if (!children.length) return 44
    const x = children.reduce((sum, child) => sum + placeInternal(child), 0) / children.length
    xPositions.set(id, x)
    return x
  }
  model.roots.forEach(placeInternal)

  const values = new Map<string, number>()
  const temporalValue = (id: string): number => {
    const known = values.get(id)
    if (known !== undefined) return known
    const node = model.nodes.get(id)!
    if (mode === 'generation') {
      const depth = depths.get(id) ?? node.canonical?.depth ?? 0
      values.set(id, depth)
      return depth
    }
    if (node.summary) {
      values.set(id, node.summary.firstStep)
      return node.summary.firstStep
    }
    const childValues = node.children.map(temporalValue)
    const value = childValues.length
      ? Math.min(...childValues) - 1
      : node.canonical?.birthTime ?? 0
    values.set(id, value)
    return value
  }
  model.roots.forEach(temporalValue)

  const allValues = [...values.values()]
  const minValue = Math.min(...allValues, 0)
  const maxObserved = Math.max(
    ...[...model.nodes.values()].map((node) => node.summary?.lastStep ?? values.get(node.id) ?? 0),
    mode === 'generation' ? Math.max(...depths.values(), 0) : 0,
  )
  const range = Math.max(maxObserved - minValue, 1)
  const height = mode === 'generation' ? Math.max(520, range * 72 + 100) : Math.max(620, range * 3 + 120)
  const yFor = (value: number) => 48 + ((value - minValue) / range) * (height - 96)

  const nodes: LineageLayoutNode[] = [...model.nodes.values()].map((node) => ({
    id: node.id,
    x: xPositions.get(node.id) ?? 44,
    y: yFor(values.get(node.id) ?? 0),
    value: values.get(node.id) ?? 0,
    depth: depths.get(node.id) ?? 0,
    represented: node.represented,
    resolved: node.resolved,
    parentId: node.parentId,
    firstStep: node.summary?.firstStep,
    lastStep: node.summary?.lastStep,
  }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges: LineageEdge[] = nodes.flatMap((node) => {
    if (!node.parentId) return []
    const parent = byId.get(node.parentId)
    return parent ? [{ id: `${parent.id}-${node.id}`, from: parent, to: node }] : []
  })
  return {
    nodes,
    edges,
    width: Math.max(680, leaves.length * 28 + 120),
    height,
    minValue,
    maxValue: maxObserved,
  }
}
