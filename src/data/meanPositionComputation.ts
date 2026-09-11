import type { Observation } from './types'
import { MEAN_EMBRYO_ID, type MeanPositionSerializedCache } from './embryoView'

export interface MeanPositionRequest {
  observations: Observation[]
  activeEmbryoIds: string[]
  frameValues?: number[]
  holdLastFrame?: boolean
}

interface MeanAccumulator {
  cellId: string
  step: number
  x: number
  y: number
  z: number
  renderX: number
  renderY: number
  renderZ: number
  parentId?: string
  contributingEmbryoIds: string[]
}

const accumulatorKey = (step: number, cellId: string) => `${step}\u0000${cellId}`

export function computeMeanPositions(request: MeanPositionRequest): MeanPositionSerializedCache {
  const active = new Set(request.activeEmbryoIds)
  const accumulators = new Map<string, MeanAccumulator>()

  const observations = request.holdLastFrame && request.frameValues?.length
    ? heldFrameObservations(request.observations, request.activeEmbryoIds, request.frameValues)
    : request.observations

  for (const observation of observations) {
    if (!active.has(observation.embryoId)) continue
    const key = accumulatorKey(observation.step, observation.cellId)
    const accumulator = accumulators.get(key)
    if (accumulator) {
      accumulator.x += observation.x
      accumulator.y += observation.y
      accumulator.z += observation.z
      accumulator.renderX += observation.renderX
      accumulator.renderY += observation.renderY
      accumulator.renderZ += observation.renderZ
      accumulator.parentId ??= observation.parentId
      accumulator.contributingEmbryoIds.push(observation.embryoId)
    } else {
      accumulators.set(key, {
        cellId: observation.cellId,
        step: observation.step,
        x: observation.x,
        y: observation.y,
        z: observation.z,
        renderX: observation.renderX,
        renderY: observation.renderY,
        renderZ: observation.renderZ,
        parentId: observation.parentId,
        contributingEmbryoIds: [observation.embryoId],
      })
    }
  }

  const meanObservations = [...accumulators.values()].map((sum): Observation => {
    const divisor = sum.contributingEmbryoIds.length
    return {
      cellId: sum.cellId,
      embryoId: MEAN_EMBRYO_ID,
      step: sum.step,
      x: sum.x / divisor,
      y: sum.y / divisor,
      z: sum.z / divisor,
      renderX: sum.renderX / divisor,
      renderY: sum.renderY / divisor,
      renderZ: sum.renderZ / divisor,
      parentId: sum.parentId,
      contributingEmbryoIds: sum.contributingEmbryoIds,
    }
  }).sort((a, b) => a.step - b.step || a.cellId.localeCompare(b.cellId, undefined, { numeric: true }))

  const frameIndex = new Map<number, Observation[]>()
  const trajectoryIndex = new Map<string, Observation[]>()
  for (const observation of meanObservations) {
    const frame = frameIndex.get(observation.step) ?? []
    frame.push(observation)
    frameIndex.set(observation.step, frame)
    const trajectory = trajectoryIndex.get(observation.cellId) ?? []
    trajectory.push(observation)
    trajectoryIndex.set(observation.cellId, trajectory)
  }

  return {
    frameEntries: [...frameIndex.entries()],
    trajectoryEntries: [...trajectoryIndex.entries()],
  }
}

function heldFrameObservations(
  observations: Observation[],
  embryoIds: string[],
  frameValues: number[],
) {
  const framesByEmbryo = new Map<string, Map<number, Observation[]>>()
  for (const observation of observations) {
    const frames = framesByEmbryo.get(observation.embryoId) ?? new Map<number, Observation[]>()
    const frame = frames.get(observation.step) ?? []
    frame.push(observation)
    frames.set(observation.step, frame)
    framesByEmbryo.set(observation.embryoId, frames)
  }
  return embryoIds.flatMap((embryoId) => {
    const frames = framesByEmbryo.get(embryoId)
    if (!frames) return []
    const embryoSteps = [...frames.keys()].sort((a, b) => a - b)
    let previousIndex = -1
    return frameValues.flatMap((targetStep) => {
      while (previousIndex + 1 < embryoSteps.length && embryoSteps[previousIndex + 1] <= targetStep) previousIndex += 1
      if (previousIndex < 0) return []
      const source = frames.get(targetStep) ?? frames.get(embryoSteps[previousIndex]) ?? []
      return source.map((observation) => observation.step === targetStep
        ? observation
        : { ...observation, step: targetStep })
    })
  })
}
