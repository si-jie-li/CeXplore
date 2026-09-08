import { describe, expect, it } from 'vitest'
import { runGroupAnalysis } from './runAnalysis'
import type { GroupAnalysisRequest } from './types'

const request: GroupAnalysisRequest = {
  datasetName: 'synthetic',
  temporalMode: 'frame',
  embryoIds: ['e1', 'e2'],
  observations: [
    { embryoId: 'e1', step: 0, cellId: 'AB', x: 0, y: 0, z: 0 },
    { embryoId: 'e1', step: 0, cellId: 'X', x: 2, y: 0, z: 0 },
    { embryoId: 'e1', step: 1, cellId: 'ABa', x: -.1, y: 0, z: 0 },
    { embryoId: 'e1', step: 1, cellId: 'ABp', x: .1, y: 0, z: 0 },
    { embryoId: 'e1', step: 1, cellId: 'X', x: 2, y: 0, z: 0 },
    { embryoId: 'e2', step: 0, cellId: 'AB', x: 10, y: 0, z: 0 },
    { embryoId: 'e2', step: 0, cellId: 'X', x: 12, y: 0, z: 0 },
    { embryoId: 'e2', step: 1, cellId: 'ABa', x: 9.9, y: 0, z: 0 },
    { embryoId: 'e2', step: 1, cellId: 'ABp', x: 10.1, y: 0, z: 0 },
    { embryoId: 'e2', step: 1, cellId: 'X', x: 12, y: 0, z: 0 },
  ],
  parentByCell: { ABa: 'AB', ABp: 'AB' },
  group: { id: 'ab', name: 'AB descendants', color: '#3978c5', cellIds: ['AB'], source: 'lineage', rootCell: 'AB' },
  metrics: ['purity', 'connectedness', 'compactness', 'shape'],
  k: 1,
  nullSamples: 20,
  minimumGroupSize: 2,
  randomSeed: 42,
}

describe('group analysis pipeline', () => {
  it('follows divisions and never pools embryos into one graph', () => {
    const result = runGroupAnalysis(request)
    expect(result.points).toHaveLength(4)
    expect(result.points.map((point) => point.groupSize)).toEqual([1, 2, 1, 2])
    expect(result.points.map((point) => point.totalCells)).toEqual([2, 3, 2, 3])
  })

  it('produces deterministic local matched-null comparisons', () => {
    expect(runGroupAnalysis(request)).toEqual(runGroupAnalysis(request))
    const eligible = runGroupAnalysis(request).points.find((point) => point.eligible)!
    expect(eligible.purity?.nullMean).not.toBeNull()
    expect(eligible.compactness?.percentile).not.toBeNull()
  })
})
