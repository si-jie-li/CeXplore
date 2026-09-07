import { describe, expect, it } from 'vitest'
import type { CellSummary } from '../data/types'
import { getDescendants, resolveLineage } from './lineageResolver'

const cells = (...ids: string[]) => new Map<string, CellSummary>(ids.map((id) => [id, {
  id, firstStep: 1, lastStep: 2, observationCount: 2,
}]))

describe('lineage resolution', () => {
  it('uses special invariant early relationships and inserts connecting ancestors', () => {
    const lineage = resolveLineage(cells('ABpl', 'MS', 'Z2'))
    expect(lineage.nodes.get('ABpl')?.parentId).toBe('ABp')
    expect(lineage.nodes.get('MS')?.parentId).toBe('EMS')
    expect(lineage.nodes.get('Z2')?.parentId).toBe('P4')
    expect(lineage.nodes.get('P4')?.parentId).toBe('P3')
    expect(lineage.nodes.get('P0')).toBeDefined()
  })

  it('selects only represented descendants and leaves unknown cells unresolved', () => {
    const lineage = resolveLineage(cells('ABp', 'ABpl', 'ABpla', 'MysteryCell'))
    expect(getDescendants(lineage, 'ABp', true)).toEqual(expect.arrayContaining(['ABp', 'ABpl', 'ABpla']))
    expect(lineage.unresolvedCellIds).toContain('MysteryCell')
    expect(lineage.roots).toContain('MysteryCell')
  })

  it('allows a supplied parent to resolve a custom cell', () => {
    const lineage = resolveLineage(cells('AB', 'custom'), new Map([['custom', 'AB']]))
    expect(lineage.nodes.get('custom')?.parentId).toBe('AB')
    expect(lineage.nodes.get('custom')?.relationSource).toBe('supplied')
    expect(lineage.unresolvedCellIds).not.toContain('custom')
  })
})
