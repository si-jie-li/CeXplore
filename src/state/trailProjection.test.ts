import { describe, expect, it } from 'vitest'
import type { Observation } from '../data/types'
import { calculateGroupProjectedPosition, projectionElapsedValue, projectionSeriesToCsv } from './trailProjection'

const point = (step: number, x: number, y: number, z: number): Observation => ({
  cellId: 'AB', embryoId: 'e1', step, x, y, z,
  renderX: x, renderY: y, renderZ: z,
})

describe('trail projection chart data', () => {
  it('tracks the direct mean position of all group cells', () => {
    const firstA = { ...point(10, 2, 5, 8), cellId: 'A' }
    const firstB = { ...point(10, 8, 1, 2), cellId: 'B' }
    const secondA = { ...point(20, 6, 1, 12), cellId: 'A' }
    const secondB = { ...point(20, 10, 1, 4), cellId: 'B' }
    const result = calculateGroupProjectedPosition([
      { step: 10, observations: [firstA, firstB] },
      { step: 20, observations: [secondA, secondB] },
    ], ['A', 'B'])
    expect(result[0]).toMatchObject({ step: 10, AP: 5, LR: 3, VD: 5, sampleCount: 2 })
    expect(result[1]).toMatchObject({ step: 20, AP: 8, LR: 1, VD: 8, sampleCount: 2 })
  })

  it('expresses Time and interval-scaled Frame input in minutes', () => {
    expect(projectionElapsedValue(7, 2, 'time')).toEqual({ value: 5, unit: 'min' })
    expect(projectionElapsedValue(6, 2, 'frame', 75)).toEqual({ value: 5, unit: 'min' })
    expect(projectionElapsedValue(6, 2, 'frame')).toEqual({ value: 4, unit: 'frame' })
  })

  it('uses direct coordinates without inserting an artificial range-origin point', () => {
    const result = calculateGroupProjectedPosition([
      { step: 20, observations: [point(20, 2, 3, 4)] },
      { step: 30, observations: [point(30, 5, 3, 4)] },
    ], ['AB'])
    expect(result).toEqual([
      { step: 20, AP: 2, LR: 3, VD: 4, sampleCount: 1 },
      { step: 30, AP: 5, LR: 3, VD: 4, sampleCount: 1 },
    ])
  })

  it('exports the currently selected axis-position series as readable CSV', () => {
    const csv = projectionSeriesToCsv([{
      groupId: 'g1', groupName: 'AB, family', groupColor: '#123456', cellId: 'AB',
      points: [{ step: 5, AP: -2, LR: 1, VD: 0, sampleCount: 3 }],
    }], ['AP'], 2, 'frame', 60)
    expect(csv).toContain('axis_position_px')
    expect(csv).toContain('g1,"AB, family",#123456,AB,AP,5,3,min,-2,3')
  })
})
