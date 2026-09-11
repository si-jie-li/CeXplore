import { describe, expect, it } from 'vitest'
import { sampleRowsByFrame } from './frameSampling'

describe('frame sampling', () => {
  it('samples the union time grid and holds each embryo latest earlier frame', () => {
    const result = sampleRowsByFrame([
      { embryoId: 'e1', cellId: 'AB', temporal: 0, x: 0, y: 0, z: 0 },
      { embryoId: 'e1', cellId: 'AB', temporal: 10, x: 10, y: 0, z: 0 },
      { embryoId: 'e2', cellId: 'AB', temporal: 5, x: 5, y: 0, z: 0 },
      { embryoId: 'e2', cellId: 'AB', temporal: 15, x: 15, y: 0, z: 0 },
    ], 3)
    expect(result.selectedSteps).toEqual([0, 10, 15])
    expect(result.rows.filter((row) => row.embryoId === 'e2' && row.temporal === 10)[0].x).toBe(5)
    expect(result.rows.some((row) => row.embryoId === 'e2' && row.temporal === 0)).toBe(false)
  })

  it('adds the minimum coverage frame needed for a short-lived cell', () => {
    const result = sampleRowsByFrame([
      { embryoId: 'e1', cellId: 'AB', temporal: 0, x: 0, y: 0, z: 0 },
      { embryoId: 'e1', cellId: 'rare', temporal: 1, x: 1, y: 0, z: 0 },
      { embryoId: 'e1', cellId: 'ABa', temporal: 2, x: 2, y: 0, z: 0 },
    ], 2)
    expect(result.selectedSteps).toEqual([0, 1, 2])
    expect(result.coverageFramesAdded).toBe(1)
    expect(result.rows.some((row) => row.cellId === 'rare')).toBe(true)
  })
})
