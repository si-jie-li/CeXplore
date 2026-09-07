import { describe, expect, it } from 'vitest'
import { buildDatasetFromRows } from './frameIndex'
import type { ColumnMapping } from './types'

const mapping: ColumnMapping = {
  cellId: 'cell', x: 'x', y: 'y', z: 'z', frame: 'frame', playback: 'frame',
}

describe('frame indexing', () => {
  it('normalizes coordinates uniformly and indexes frames and trajectories', () => {
    const dataset = buildDatasetFromRows([
      { cellId: 'AB', temporal: 1, x: 0, y: 0, z: 0 },
      { cellId: 'AB', temporal: 2, x: 10, y: 2, z: 1 },
      { cellId: 'P1', temporal: 1, x: -10, y: -2, z: -1 },
    ], { name: 'test.csv', mapping })

    expect(dataset.frameValues).toEqual([1, 2])
    expect(dataset.frameIndex.get(1)).toHaveLength(2)
    expect(dataset.trajectoryIndex.get('AB')).toHaveLength(2)
    expect(dataset.bounds.span).toEqual([20, 4, 2])
    expect(dataset.observations.find((row) => row.x === 10)?.renderX).toBe(8)
    expect(dataset.observations.find((row) => row.y === 2)?.renderY).toBeCloseTo(1.6)
  })

  it('keeps the final duplicate and warns without crashing on invalid rows', () => {
    const dataset = buildDatasetFromRows([
      { cellId: 'AB', temporal: 1, x: 1, y: 2, z: 3 },
      { cellId: 'AB', temporal: 1, x: 4, y: 5, z: 6 },
      { cellId: '', temporal: 1, x: 1, y: 1, z: 1 },
      { cellId: 'bad', temporal: 1, x: 'not-a-number', y: 1, z: 1 },
    ], { name: 'test.csv', mapping })

    expect(dataset.observations).toHaveLength(1)
    expect(dataset.observations[0].x).toBe(4)
    expect(dataset.warnings.join(' ')).toMatch(/duplicate/)
    expect(dataset.warnings.join(' ')).toMatch(/invalid coordinates/)
  })
})
