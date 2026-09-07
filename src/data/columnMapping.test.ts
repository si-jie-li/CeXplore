import { describe, expect, it } from 'vitest'
import { suggestMapping, validateMapping } from './columnMapping'

describe('column mapping', () => {
  it('prefers corrected aligned coordinates for the supplied table', () => {
    const mapping = suggestMapping({
      kind: 'delimited',
      name: 'sample.tsv',
      headers: ['embryo_id', 'time', 'cell_name', 'X', 'Y', 'Z', 'A_pos', 'L_pos', 'D_pos'],
      samples: [{ embryo_id: 'ctr_emb1' }],
    })
    expect(mapping).toMatchObject({
      cellId: 'cell_name', x: 'A_pos', y: 'L_pos', z: 'D_pos', time: 'time',
      playback: 'time', embryo: 'embryo_id', embryoValue: 'ctr_emb1',
    })
    expect(validateMapping(mapping)).toEqual([])
  })
})
