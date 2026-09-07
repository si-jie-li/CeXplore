import { describe, expect, it } from 'vitest'
import { listEmbryoIds, loadMappedRows } from './loaders'
import type { ColumnMapping, SourceInspection } from './types'

const csv = `cell_name,frame,AP,LR,VD,embryo_id
AB,1,0,0,0,emb_1
AB,1,2,0,0,emb_2
ABa,2,1,1,0,emb_1
ABa,2,3,1,0,emb_2
`
const inspection: SourceInspection = {
  kind: 'delimited',
  name: 'multi.csv',
  headers: ['cell_name', 'frame', 'AP', 'LR', 'VD', 'embryo_id'],
  delimiter: ',',
  samples: [],
}

describe('multi-embryo loading', () => {
  it('discovers all embryo IDs and retains every checked ID', async () => {
    const file = new File([csv], 'multi.csv', { type: 'text/csv' })
    const ids = await listEmbryoIds(file, inspection, 'embryo_id')
    expect(ids).toEqual(['emb_1', 'emb_2'])

    const mapping: ColumnMapping = {
      cellId: 'cell_name', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame',
      embryo: 'embryo_id', embryoValues: ['emb_1', 'emb_2'],
    }
    const rows = await loadMappedRows(file, inspection, mapping)
    expect(rows).toHaveLength(4)
    expect(new Set(rows.map((row) => row.embryoId))).toEqual(new Set(['emb_1', 'emb_2']))
  })

  it('filters out embryo IDs that were not checked', async () => {
    const file = new File([csv], 'multi.csv', { type: 'text/csv' })
    const mapping: ColumnMapping = {
      cellId: 'cell_name', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame',
      embryo: 'embryo_id', embryoValues: ['emb_2'],
    }
    const rows = await loadMappedRows(file, inspection, mapping)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.embryoId === 'emb_2')).toBe(true)
  })
})
