import { describe, expect, it } from 'vitest'
import type { CellGroup } from '../state/explorerStore'
import { createGroupListFile, parseGroupList } from './groupList'

const groups: CellGroup[] = [{
  id: 'internal-id',
  name: 'AB family',
  color: '#3978C5',
  cellIds: ['AB', 'ABa', 'ABp'],
  visible: true,
  source: 'lineage',
  rootCell: 'AB',
  createdAt: 1,
}]

describe('readable group-list format', () => {
  it('round-trips exported group names, colors, cells, and lineage metadata', () => {
    const exported = createGroupListFile('embryo.tsv', groups)
    const parsed = parseGroupList(JSON.stringify(exported, null, 2))
    expect(parsed).toMatchObject({
      format: 'cexplore-group-list',
      version: 1,
      dataset: 'embryo.tsv',
      groups: [{
        name: 'AB family', color: '#3978c5', cells: ['AB', 'ABa', 'ABp'],
        source: 'lineage', rootCell: 'AB',
      }],
    })
    expect(JSON.stringify(exported, null, 2)).not.toContain('internal-id')
  })

  it('rejects unrelated JSON and malformed group entries', () => {
    expect(() => parseGroupList('{"version":1,"groups":[]}')).toThrow(/group-list/)
    expect(() => parseGroupList(JSON.stringify({
      format: 'cexplore-group-list', version: 1, dataset: 'x', groups: [{ color: 'red', cells: [] }],
    }))).toThrow(/malformed/)
  })
})
