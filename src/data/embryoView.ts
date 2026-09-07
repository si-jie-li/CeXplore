import type { EmbryoDataset, Observation } from './types'
import { trajectoryKey } from './frameIndex'

export type EmbryoViewMode = 'overlay' | 'mean'

export const MEAN_EMBRYO_ID = '__mean__'

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
