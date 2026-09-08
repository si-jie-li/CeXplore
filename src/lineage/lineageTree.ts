import type { TemporalMode } from '../data/types'
import type { LineageModel, LineageNode } from './lineageResolver'

export interface LineageLayoutNode {
  id: string
  x: number
  startY: number
  birthY: number
  endY: number
  birthValue: number
  endValue: number
  depth: number
  represented: boolean
  resolved: boolean
  parentId?: string
  children: string[]
  firstStep?: number
  lastStep?: number
}

export interface LineageConnector {
  id: string
  parentId: string
  x1: number
  x2: number
  y: number
}

export interface LineageTick {
  value: number
  y: number
  label: string
}

export interface LineageLayout {
  nodes: LineageLayoutNode[]
  connectors: LineageConnector[]
  ticks: LineageTick[]
  width: number
  height: number
  plotLeft: number
  plotRight: number
  plotTop: number
  plotBottom: number
  minValue: number
  maxValue: number
  axisLabel: string
  valueScale: number
}

function nodeSort(a: LineageNode, b: LineageNode) {
  const ax = a.canonical?.xPosition
  const bx = b.canonical?.xPosition
  if (ax !== undefined && bx !== undefined) return ax - bx
  if (ax !== undefined) return -1
  if (bx !== undefined) return 1
  return a.id.localeCompare(b.id, undefined, { numeric: true })
}

function niceStep(range: number) {
  const roughStep = Math.max(range / 8, Number.EPSILON)
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

function formatTick(value: number) {
  const absolute = Math.abs(value)
  if (absolute >= 100 || Number.isInteger(value)) return String(Math.round(value))
  return value.toFixed(1).replace(/\.0$/, '')
}

export function lineageAxisValue(
  step: number,
  mode: TemporalMode,
  frameIntervalSeconds = 1,
) {
  const safeInterval = Number.isFinite(frameIntervalSeconds) && frameIntervalSeconds > 0
    ? frameIntervalSeconds
    : 1
  return mode === 'frame' ? (step * safeInterval) / 60 : step
}

export function createLineageLayout(
  model: LineageModel,
  mode: TemporalMode,
  frameIntervalSeconds = 1,
): LineageLayout {
  const valueScale = mode === 'frame'
    ? lineageAxisValue(1, mode, frameIntervalSeconds)
    : 1
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
  const leafSpacing = leaves.length <= 20 ? 38 : leaves.length <= 60 ? 20 : leaves.length <= 160 ? 10 : 6
  const plotLeft = 76
  const plotRightPadding = 28
  const plotTop = 34
  const plotBottomPadding = 42
  const xPositions = new Map(leaves.map((node, index) => [node.id, plotLeft + 24 + index * leafSpacing]))
  const placeInternal = (id: string): number => {
    const existing = xPositions.get(id)
    if (existing !== undefined) return existing
    const children = model.nodes.get(id)?.children ?? []
    if (!children.length) return plotLeft + 24
    const x = children.reduce((sum, child) => sum + placeInternal(child), 0) / children.length
    xPositions.set(id, x)
    return x
  }
  model.roots.forEach(placeInternal)

  const observedSteps = [...new Set([...model.nodes.values()].flatMap((node) => (
    node.summary
      ? [
          lineageAxisValue(node.summary.firstStep, mode, frameIntervalSeconds),
          lineageAxisValue(node.summary.lastStep, mode, frameIntervalSeconds),
        ]
      : []
  )))].sort((a, b) => a - b)
  const positiveObservedGaps = observedSteps
    .slice(1)
    .map((value, index) => value - observedSteps[index])
    .filter((gap) => gap > Number.EPSILON)
  const observedStep = positiveObservedGaps.length
    ? Math.min(...positiveObservedGaps)
    : valueScale
  const firstObservedValue = observedSteps[0] ?? 0

  const birthValues = new Map<string, number>()
  const birthValueFor = (id: string): number => {
    const known = birthValues.get(id)
    if (known !== undefined) return known
    const node = model.nodes.get(id)!
    let value: number
    if (node.summary) {
      value = lineageAxisValue(node.summary.firstStep, mode, frameIntervalSeconds)
    } else {
      const childValues = node.children.map(birthValueFor)
      // A connecting ancestor has no uploaded timestamp. Place it at its first
      // observed descendant instead of inventing an earlier frame/time. This
      // keeps partial-stage datasets aligned with the first visible branches.
      value = childValues.length ? Math.min(...childValues) : firstObservedValue
    }
    birthValues.set(id, value)
    return value
  }
  model.roots.forEach(birthValueFor)
  model.nodes.forEach((_node, id) => birthValueFor(id))

  const endValues = new Map<string, number>()
  for (const node of model.nodes.values()) {
    const birth = birthValues.get(node.id) ?? 0
    const childBirths = node.children.map((child) => birthValues.get(child) ?? birth)
    let end: number
    if (childBirths.length) end = Math.min(...childBirths)
    else if (node.summary) {
      const last = lineageAxisValue(node.summary.lastStep, mode, frameIntervalSeconds)
      end = last > birth ? last : birth + observedStep
    } else end = birth
    endValues.set(node.id, Math.max(end, node.represented ? birth + Number.EPSILON : birth))
  }

  const rawMin = birthValues.size ? Math.min(...birthValues.values()) : 0
  const rawMax = Math.max(...endValues.values(), rawMin + 1)
  const tickStep = niceStep(rawMax - rawMin)
  // The first tick is the first branch value, not an arbitrary rounded zero.
  const minValue = rawMin
  const maxValue = Math.max(
    minValue + Math.ceil((rawMax - minValue) / tickStep) * tickStep,
    minValue + tickStep,
  )
  const range = maxValue - minValue
  const height = Math.max(620, Math.min(1120, range * 3.2 + plotTop + plotBottomPadding))
  const plotBottom = height - plotBottomPadding
  const yFor = (value: number) => plotTop + ((value - minValue) / range) * (plotBottom - plotTop)
  const plotRight = Math.max(652, plotLeft + 48 + Math.max(leaves.length - 1, 0) * leafSpacing)
  const width = plotRight + plotRightPadding

  const nodes: LineageLayoutNode[] = [...model.nodes.values()].map((node) => {
    const birthValue = birthValues.get(node.id) ?? 0
    const endValue = endValues.get(node.id) ?? birthValue
    const parentEnd = node.parentId ? endValues.get(node.parentId) : undefined
    return {
      id: node.id,
      x: xPositions.get(node.id) ?? plotLeft + 24,
      startY: yFor(parentEnd ?? birthValue),
      birthY: yFor(birthValue),
      endY: yFor(endValue),
      birthValue,
      endValue,
      depth: depths.get(node.id) ?? node.canonical?.depth ?? 0,
      represented: node.represented,
      resolved: node.resolved,
      parentId: node.parentId,
      children: [...node.children],
      firstStep: node.summary?.firstStep,
      lastStep: node.summary?.lastStep,
    }
  })
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const connectors: LineageConnector[] = nodes.flatMap((node) => {
    if (!node.children.length) return []
    const childXs = node.children
      .map((childId) => nodeById.get(childId)?.x)
      .filter((x): x is number => x !== undefined)
    if (!childXs.length) return []
    return [{
      id: `division-${node.id}`,
      parentId: node.id,
      x1: Math.min(node.x, ...childXs),
      x2: Math.max(node.x, ...childXs),
      y: node.endY,
    }]
  })
  const ticks: LineageTick[] = []
  for (let value = minValue; value <= maxValue + tickStep / 2; value += tickStep) {
    const cleanValue = Math.abs(value) < tickStep / 1000 ? 0 : value
    ticks.push({ value: cleanValue, y: yFor(cleanValue), label: formatTick(cleanValue) })
  }

  return {
    nodes,
    connectors,
    ticks,
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    minValue,
    maxValue,
    axisLabel: mode === 'time' ? 'Developmental time (minutes)' : 'Elapsed time (minutes)',
    valueScale,
  }
}
