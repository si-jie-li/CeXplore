import type { AnalysisGroupSpec } from './types'

export function resolveGroupCellIds(
  group: AnalysisGroupSpec,
  parentByCell: Record<string, string | undefined>,
) {
  const result = new Set(group.cellIds)
  if (group.source !== 'lineage' || !group.rootCell) return result

  result.add(group.rootCell)
  for (const cellId of Object.keys(parentByCell)) {
    let current: string | undefined = cellId
    const visited = new Set<string>()
    while (current && !visited.has(current)) {
      if (current === group.rootCell) {
        result.add(cellId)
        break
      }
      visited.add(current)
      current = parentByCell[current]
    }
  }
  return result
}

export function getFrameGroupIndices(cellIds: Set<string>, frameCellIds: string[]) {
  const result: number[] = []
  frameCellIds.forEach((cellId, index) => {
    if (cellIds.has(cellId)) result.push(index)
  })
  return result
}
