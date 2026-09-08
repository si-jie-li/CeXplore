import { describe, expect, it } from 'vitest'
import { analysisResultToCsv } from './resultUtils'
import { runGroupAnalysis } from './runAnalysis'
import type { GroupAnalysisRequest } from './types'

describe('analysis table export', () => {
  it('exports one CSV row per embryo-time state with metric and null columns', () => {
    const request: GroupAnalysisRequest = {
      datasetName: 'tiny.csv', temporalMode: 'time', embryoIds: ['e1'],
      observations: [
        { embryoId: 'e1', step: 1, cellId: 'A', x: 0, y: 0, z: 0 },
        { embryoId: 'e1', step: 1, cellId: 'B', x: 1, y: 0, z: 0 },
      ],
      parentByCell: {},
      group: { id: 'g', name: 'A, group', color: '#000', cellIds: ['A'], source: 'manual' },
      metrics: ['purity'], k: 1, nullSamples: 5, minimumGroupSize: 1, randomSeed: 1,
    }
    const csv = analysisResultToCsv(runGroupAnalysis(request), { e1: 'Embryo one' })
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('purity_null_mean')
    expect(csv).toContain('"A, group"')
    expect(csv).toContain('Embryo one')
  })
})
