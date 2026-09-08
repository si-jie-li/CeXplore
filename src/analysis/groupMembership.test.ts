import { describe, expect, it } from 'vitest'
import { getFrameGroupIndices, resolveGroupCellIds } from './groupMembership'
import type { AnalysisGroupSpec } from './types'

describe('lineage-aware dynamic membership', () => {
  it('adds represented descendants for a lineage root even when the saved explicit list is incomplete', () => {
    const group: AnalysisGroupSpec = {
      id: 'lineage', name: 'AB lineage', color: '#3978c5', cellIds: ['AB'], source: 'lineage', rootCell: 'AB',
    }
    const resolved = resolveGroupCellIds(group, { ABa: 'AB', ABp: 'AB', ABal: 'ABa', EMS: 'P1' })
    expect([...resolved].sort()).toEqual(['AB', 'ABa', 'ABal', 'ABp'])
    expect(getFrameGroupIndices(resolved, ['ABa', 'ABp', 'EMS'])).toEqual([0, 1])
  })

  it('keeps manual groups explicit instead of automatically following daughters', () => {
    const group: AnalysisGroupSpec = {
      id: 'manual', name: 'Manual', color: '#df7844', cellIds: ['AB'], source: 'manual', rootCell: 'AB',
    }
    expect([...resolveGroupCellIds(group, { ABa: 'AB', ABp: 'AB' })]).toEqual(['AB'])
  })
})
