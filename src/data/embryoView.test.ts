import { describe, expect, it } from 'vitest'
import type { ColumnMapping, EmbryoDescriptor } from './types'
import { buildDatasetFromRows } from './frameIndex'
import { getCellTrajectories, getFrameObservations, MEAN_EMBRYO_ID } from './embryoView'

const mapping: ColumnMapping = {
  cellId: 'cell', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame',
}
const embryos: EmbryoDescriptor[] = [
  { id: 'e1', label: 'embryo 1', sourceName: 'a.csv', sourceEmbryoId: '1', color: '#3978c5' },
  { id: 'e2', label: 'embryo 2', sourceName: 'b.csv', sourceEmbryoId: '2', color: '#df7844' },
]

const dataset = buildDatasetFromRows([
  { embryoId: 'e1', cellId: 'AB', temporal: 1, x: 0, y: 2, z: 4 },
  { embryoId: 'e2', cellId: 'AB', temporal: 1, x: 2, y: 4, z: 6 },
  { embryoId: 'e1', cellId: 'AB', temporal: 2, x: 2, y: 2, z: 4 },
  { embryoId: 'e2', cellId: 'AB', temporal: 2, x: 4, y: 4, z: 6 },
], { name: 'pair', mapping, embryos })

describe('multi-embryo views', () => {
  it('keeps same-cell observations from different embryos and filters overlays', () => {
    expect(dataset.frameIndex.get(1)).toHaveLength(2)
    expect(getFrameObservations(dataset, 1, new Set(['e2']), 'overlay')).toMatchObject([
      { embryoId: 'e2', cellId: 'AB', x: 2 },
    ])
  })

  it('averages available positions cell-by-cell across selected embryos', () => {
    const mean = getFrameObservations(dataset, 1, new Set(['e1', 'e2']), 'mean')
    expect(mean).toHaveLength(1)
    expect(mean[0]).toMatchObject({
      embryoId: MEAN_EMBRYO_ID,
      cellId: 'AB',
      x: 1,
      y: 3,
      z: 5,
      contributingEmbryoIds: ['e1', 'e2'],
    })
  })

  it('returns separate overlay trails and one averaged trail', () => {
    expect(getCellTrajectories(dataset, 'AB', new Set(['e1', 'e2']), 'overlay', 1, 2)).toHaveLength(2)
    const mean = getCellTrajectories(dataset, 'AB', new Set(['e1', 'e2']), 'mean', 1, 2)
    expect(mean).toHaveLength(1)
    expect(mean[0].points.map((point) => point.x)).toEqual([1, 3])
  })
})
