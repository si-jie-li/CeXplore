import type { EmbryoDataset, Observation } from '../data/types'
import { getDescendants, type LineageModel } from '../lineage/lineageResolver'
import type { CellGroup } from '../state/explorerStore'

export interface ExplorerDataApi {
  getGroupCells: (groupId: string) => string[]
  getGroupPositions: (groupId: string, frame: number) => Observation[]
  getCellTrajectory: (cellId: string) => Observation[]
  getDescendants: (cellId: string) => string[]
}

export function createExplorerDataApi(
  dataset: EmbryoDataset,
  lineage: LineageModel,
  getGroups: () => CellGroup[],
): ExplorerDataApi {
  const group = (groupId: string) => getGroups().find((item) => item.id === groupId)
  return {
    getGroupCells: (groupId) => [...(group(groupId)?.cellIds ?? [])],
    getGroupPositions: (groupId, frame) => {
      const ids = new Set(group(groupId)?.cellIds ?? [])
      return (dataset.frameIndex.get(frame) ?? []).filter((observation) => ids.has(observation.cellId))
    },
    getCellTrajectory: (cellId) => [...(dataset.trajectoryIndex.get(cellId) ?? [])],
    getDescendants: (cellId) => getDescendants(lineage, cellId, true),
  }
}
