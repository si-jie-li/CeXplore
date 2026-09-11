import type { Observation } from '../data/types'

export type ProjectionAxis = 'AP' | 'LR' | 'VD'

export interface ProjectionPoint {
  step: number
  AP: number
  LR: number
  VD: number
  sampleCount: number
}

export interface ProjectionFrame {
  step: number
  observations: Observation[]
}

export interface ProjectionExportSeries {
  groupId: string
  groupName: string
  groupColor: string
  cellId?: string
  points: ProjectionPoint[]
}

export function calculateGroupProjectedPosition(
  frames: ProjectionFrame[],
  cellIds: Iterable<string>,
): ProjectionPoint[] {
  const targets = new Set(cellIds)
  const centroids = frames.flatMap(({ step, observations }) => {
    const members = observations.filter((observation) => targets.has(observation.cellId))
    if (!members.length) return []
    const sum = members.reduce((value, observation) => ({
      x: value.x + observation.x,
      y: value.y + observation.y,
      z: value.z + observation.z,
    }), { x: 0, y: 0, z: 0 })
    return [{
      step,
      x: sum.x / members.length,
      y: sum.y / members.length,
      z: sum.z / members.length,
      sampleCount: members.length,
    }]
  }).sort((a, b) => a.step - b.step)
  return centroids.map((centroid) => ({
    step: centroid.step,
    AP: centroid.x,
    LR: centroid.y,
    VD: centroid.z,
    sampleCount: centroid.sampleCount,
  }))
}

const escapeCsv = (value: string | number | undefined) => {
  if (value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function projectionSeriesToCsv(
  series: ProjectionExportSeries[],
  axes: ProjectionAxis[],
  rangeStart: number,
  temporalMode: 'time' | 'frame',
  frameIntervalSeconds?: number,
) {
  const header = [
    'group_id', 'group_name', 'group_color', 'cell_id', 'axis', temporalMode,
    'elapsed', 'elapsed_unit', 'axis_position_px', 'sample_count',
  ]
  const rows = series.flatMap((item) => axes.flatMap((axis) => item.points.map((point) => {
    const elapsed = projectionElapsedValue(point.step, rangeStart, temporalMode, frameIntervalSeconds)
    return [
      item.groupId, item.groupName, item.groupColor, item.cellId, axis, point.step,
      elapsed.value, elapsed.unit, point[axis], point.sampleCount,
    ].map(escapeCsv).join(',')
  })))
  return [header.join(','), ...rows].join('\n')
}

export function projectionElapsedValue(
  step: number,
  startStep: number,
  temporalMode: 'time' | 'frame',
  frameIntervalSeconds?: number,
) {
  const elapsed = step - startStep
  if (temporalMode === 'time') return { value: elapsed, unit: 'min' as const }
  if (frameIntervalSeconds) return { value: elapsed * frameIntervalSeconds / 60, unit: 'min' as const }
  return { value: elapsed, unit: 'frame' as const }
}
