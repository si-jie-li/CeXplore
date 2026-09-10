import { describe, expect, it } from 'vitest'
import type { Observation } from '../data/types'
import { calculateGroupProjectedDisplacement, projectionElapsedValue } from './trailProjection'

const point = (step: number, x: number, y: number, z: number): Observation => ({
  cellId: 'AB', embryoId: 'e1', step, x, y, z,
  renderX: x, renderY: y, renderZ: z,
})

describe('trail projection chart data', () => {
  it('tracks displacement of the mean position of all group cells', () => {
    const firstA = { ...point(10, 2, 5, 8), cellId: 'A' }
    const firstB = { ...point(10, 8, 1, 2), cellId: 'B' }
    const secondA = { ...point(20, 6, 3, 12), cellId: 'A' }
    const secondB = { ...point(20, 10, 7, 4), cellId: 'B' }
    const result = calculateGroupProjectedDisplacement([
      { step: 10, observations: [firstA, firstB] },
      { step: 20, observations: [secondA, secondB] },
    ], ['A', 'B'])
    expect(result[0]).toMatchObject({ step: 10, AP: 0, LR: 0, VD: 0, sampleCount: 2 })
    expect(result[1]).toMatchObject({ step: 20, AP: 3, LR: 2, VD: 3, sampleCount: 2 })
  })

  it('expresses Time and interval-scaled Frame input in minutes', () => {
    expect(projectionElapsedValue(7, 2, 'time')).toEqual({ value: 5, unit: 'min' })
    expect(projectionElapsedValue(6, 2, 'frame', 75)).toEqual({ value: 5, unit: 'min' })
    expect(projectionElapsedValue(6, 2, 'frame')).toEqual({ value: 4, unit: 'frame' })
  })

  it('keeps the selected range origin at zero when trajectories begin later', () => {
    const result = calculateGroupProjectedDisplacement([
      { step: 20, observations: [point(20, 2, 3, 4)] },
      { step: 30, observations: [point(30, 5, 3, 4)] },
    ], ['AB'], 10)
    expect(result[0]).toEqual({ step: 10, AP: 0, LR: 0, VD: 0, sampleCount: 0 })
  })
})
