import type { EmbryoDataset, Observation } from './types'
import { trajectoryKey } from './frameIndex'

export type EmbryoViewMode = 'overlay' | 'mean'

export const MEAN_EMBRYO_ID = '__mean__'

export interface MeanPositionSerializedCache {
  frameEntries: Array<[number, Observation[]]>
  trajectoryEntries: Array<[string, Observation[]]>
}

export interface MeanPositionCache {
  key: string
  frameIndex: Map<number, Observation[]>
  trajectoryIndex: Map<string, Observation[]>
}

export function hydrateMeanPositionCache(
  key: string,
  serialized: MeanPositionSerializedCache,
): MeanPositionCache {
  return {
    key,
    frameIndex: new Map(serialized.frameEntries),
    trajectoryIndex: new Map(serialized.trajectoryEntries),
  }
}

export interface DivisionConnection {
  embryoId: string
  parentCellId: string
  childCellId: string
  points: [Observation, Observation]
}

export function getFrameObservations(
  dataset: EmbryoDataset,
  step: number,
  activeEmbryoIds: Set<string>,
  mode: EmbryoViewMode,
  meanCache?: MeanPositionCache,
): Observation[] {
  if (mode === 'mean') return meanCache?.frameIndex.get(step) ?? []
  return (dataset.frameIndex.get(step) ?? []).filter((row) => activeEmbryoIds.has(row.embryoId))
}

export function getCellTrajectories(
  dataset: EmbryoDataset,
  cellId: string,
  activeEmbryoIds: Set<string>,
  mode: EmbryoViewMode,
  earliestStep: number,
  currentStep: number,
  meanCache?: MeanPositionCache,
): Array<{ embryoId: string; points: Observation[] }> {
  if (mode === 'overlay') {
    return [...activeEmbryoIds].map((embryoId) => ({
      embryoId,
      points: (dataset.trajectoryIndex.get(trajectoryKey(embryoId, cellId)) ?? [])
        .filter((point) => point.step >= earliestStep && point.step <= currentStep),
    })).filter((trajectory) => trajectory.points.length > 1)
  }

  const points = (meanCache?.trajectoryIndex.get(cellId) ?? [])
    .filter((point) => point.step >= earliestStep && point.step <= currentStep)
  return points.length > 1 ? [{ embryoId: MEAN_EMBRYO_ID, points }] : []
}

export function getDivisionConnections(
  dataset: EmbryoDataset,
  trailCellIds: Set<string>,
  parentByCell: ReadonlyMap<string, string | undefined>,
  activeEmbryoIds: Set<string>,
  mode: EmbryoViewMode,
  earliestStep: number,
  currentStep: number,
  meanCache?: MeanPositionCache,
): DivisionConnection[] {
  const children = [...trailCellIds].flatMap((childCellId) => {
    const parentCellId = parentByCell.get(childCellId)
    return parentCellId
      ? [{ parentCellId, childCellId }]
      : []
  })
  if (!children.length) return []

  const connections: DivisionConnection[] = []
  if (mode === 'overlay') {
    for (const embryoId of activeEmbryoIds) {
      for (const { parentCellId, childCellId } of children) {
        const childPoint = (dataset.trajectoryIndex.get(trajectoryKey(embryoId, childCellId)) ?? [])
          .find((point) => point.step >= earliestStep && point.step <= currentStep)
        if (!childPoint) continue
        const parentPoint = (dataset.trajectoryIndex.get(trajectoryKey(embryoId, parentCellId)) ?? [])
          .filter((point) => point.step >= earliestStep && point.step <= childPoint.step)
          .at(-1)
        if (parentPoint) {
          connections.push({ embryoId, parentCellId, childCellId, points: [parentPoint, childPoint] })
        }
      }
    }
  } else {
    for (const { parentCellId, childCellId } of children) {
      const childPoint = meanCache?.trajectoryIndex.get(childCellId)
        ?.find((point) => point.step >= earliestStep && point.step <= currentStep)
      if (!childPoint) continue
      const parentPoint = meanCache?.trajectoryIndex.get(parentCellId)
        ?.filter((point) => point.step <= childPoint.step)
        .filter((point) => point.step >= earliestStep)
        .at(-1)
      if (parentPoint) {
        connections.push({
          embryoId: MEAN_EMBRYO_ID,
          parentCellId,
          childCellId,
          points: [parentPoint, childPoint],
        })
      }
    }
  }
  return connections.sort((a, b) =>
    a.embryoId.localeCompare(b.embryoId)
    || a.parentCellId.localeCompare(b.parentCellId, undefined, { numeric: true })
    || a.childCellId.localeCompare(b.childCellId, undefined, { numeric: true }),
  )
}
