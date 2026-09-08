import type { EmbryoDataset, Observation } from './types'
import { trajectoryKey } from './frameIndex'

export type EmbryoViewMode = 'overlay' | 'mean'

export const MEAN_EMBRYO_ID = '__mean__'

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
): Observation[] {
  const active = (dataset.frameIndex.get(step) ?? []).filter((row) => activeEmbryoIds.has(row.embryoId))
  if (mode === 'overlay') return active

  const byCell = new Map<string, Observation[]>()
  for (const observation of active) {
    const rows = byCell.get(observation.cellId) ?? []
    rows.push(observation)
    byCell.set(observation.cellId, rows)
  }
  return [...byCell.entries()].map(([cellId, rows]) => {
    const divisor = rows.length
    const sum = rows.reduce((result, row) => ({
      x: result.x + row.x,
      y: result.y + row.y,
      z: result.z + row.z,
      renderX: result.renderX + row.renderX,
      renderY: result.renderY + row.renderY,
      renderZ: result.renderZ + row.renderZ,
    }), { x: 0, y: 0, z: 0, renderX: 0, renderY: 0, renderZ: 0 })
    return {
      cellId,
      embryoId: MEAN_EMBRYO_ID,
      step,
      x: sum.x / divisor,
      y: sum.y / divisor,
      z: sum.z / divisor,
      renderX: sum.renderX / divisor,
      renderY: sum.renderY / divisor,
      renderZ: sum.renderZ / divisor,
      parentId: rows.find((row) => row.parentId)?.parentId,
      contributingEmbryoIds: rows.map((row) => row.embryoId),
    }
  }).sort((a, b) => a.cellId.localeCompare(b.cellId, undefined, { numeric: true }))
}

export function getCellTrajectories(
  dataset: EmbryoDataset,
  cellId: string,
  activeEmbryoIds: Set<string>,
  mode: EmbryoViewMode,
  earliestStep: number,
  currentStep: number,
): Array<{ embryoId: string; points: Observation[] }> {
  if (mode === 'overlay') {
    return [...activeEmbryoIds].map((embryoId) => ({
      embryoId,
      points: (dataset.trajectoryIndex.get(trajectoryKey(embryoId, cellId)) ?? [])
        .filter((point) => point.step >= earliestStep && point.step <= currentStep),
    })).filter((trajectory) => trajectory.points.length > 1)
  }

  const points = dataset.frameValues
    .filter((step) => step >= earliestStep && step <= currentStep)
    .flatMap((step) => getFrameObservations(dataset, step, activeEmbryoIds, 'mean'))
    .filter((point) => point.cellId === cellId)
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
): DivisionConnection[] {
  const children = [...trailCellIds].flatMap((childCellId) => {
    const parentCellId = parentByCell.get(childCellId)
    return parentCellId && trailCellIds.has(parentCellId)
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
    const pointsByCell = new Map<string, Observation[]>()
    for (const step of dataset.frameValues) {
      if (step < earliestStep || step > currentStep) continue
      for (const point of getFrameObservations(dataset, step, activeEmbryoIds, 'mean')) {
        if (!trailCellIds.has(point.cellId)) continue
        const points = pointsByCell.get(point.cellId) ?? []
        points.push(point)
        pointsByCell.set(point.cellId, points)
      }
    }
    for (const { parentCellId, childCellId } of children) {
      const childPoint = pointsByCell.get(childCellId)?.[0]
      if (!childPoint) continue
      const parentPoint = pointsByCell.get(parentCellId)
        ?.filter((point) => point.step <= childPoint.step)
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
