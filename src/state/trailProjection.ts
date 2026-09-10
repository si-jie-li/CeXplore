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

export function calculateGroupProjectedDisplacement(
  frames: ProjectionFrame[],
  cellIds: Iterable<string>,
  rangeStart?: number,
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
  const origin = centroids[0]
  const result = origin ? centroids.map((centroid) => ({
    step: centroid.step,
    AP: Math.abs(centroid.x - origin.x),
    LR: Math.abs(centroid.y - origin.y),
    VD: Math.abs(centroid.z - origin.z),
    sampleCount: centroid.sampleCount,
  })) : []
  if (Number.isFinite(rangeStart) && (!result.length || result[0].step > rangeStart!)) {
    result.unshift({ step: rangeStart!, AP: 0, LR: 0, VD: 0, sampleCount: 0 })
  }
  return result
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
