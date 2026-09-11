import { describe, expect, it } from 'vitest'
import type { ColumnMapping, EmbryoDescriptor } from './types'
import { buildDatasetFromRows } from './frameIndex'
import { getCellTrajectories, getDivisionConnections, getFrameObservations, hydrateMeanPositionCache, MEAN_EMBRYO_ID } from './embryoView'
import { computeMeanPositions } from './meanPositionComputation'

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
const meanCache = hydrateMeanPositionCache('e1\u0000e2', computeMeanPositions({
  observations: dataset.observations,
  activeEmbryoIds: ['e1', 'e2'],
}))

describe('multi-embryo views', () => {
  it('keeps same-cell observations from different embryos and filters overlays', () => {
    expect(dataset.frameIndex.get(1)).toHaveLength(2)
    expect(getFrameObservations(dataset, 1, new Set(['e2']), 'overlay')).toMatchObject([
      { embryoId: 'e2', cellId: 'AB', x: 2 },
    ])
  })

  it('averages available positions cell-by-cell across selected embryos', () => {
    const mean = getFrameObservations(dataset, 1, new Set(['e1', 'e2']), 'mean', meanCache)
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

  it('optionally holds each embryo latest earlier frame without interpolating coordinates', () => {
    const staggered = buildDatasetFromRows([
      { embryoId: 'e1', cellId: 'AB', temporal: 1, x: 0, y: 0, z: 0 },
      { embryoId: 'e1', cellId: 'AB', temporal: 3, x: 6, y: 0, z: 0 },
      { embryoId: 'e2', cellId: 'AB', temporal: 2, x: 2, y: 0, z: 0 },
    ], { name: 'staggered', mapping, embryos })
    const held = hydrateMeanPositionCache('held', computeMeanPositions({
      observations: staggered.observations,
      activeEmbryoIds: ['e1', 'e2'],
      frameValues: [1, 2, 3],
      holdLastFrame: true,
    }))
    expect(held.frameIndex.get(2)?.[0]).toMatchObject({ x: 1, contributingEmbryoIds: ['e1', 'e2'] })
    expect(held.frameIndex.get(3)?.[0]).toMatchObject({ x: 4, contributingEmbryoIds: ['e1', 'e2'] })
  })

  it('returns separate overlay trails and one averaged trail', () => {
    expect(getCellTrajectories(dataset, 'AB', new Set(['e1', 'e2']), 'overlay', 1, 2)).toHaveLength(2)
    const mean = getCellTrajectories(dataset, 'AB', new Set(['e1', 'e2']), 'mean', 1, 2, meanCache)
    expect(mean).toHaveLength(1)
    expect(mean[0].points.map((point) => point.x)).toEqual([1, 3])
  })

  it('connects a mother trajectory to both daughters in overlay and mean modes', () => {
    const divisionDataset = buildDatasetFromRows([
      { embryoId: 'e1', cellId: 'AB', temporal: 1, x: 0, y: 0, z: 0 },
      { embryoId: 'e1', cellId: 'ABa', temporal: 2, x: 1, y: 1, z: 0 },
      { embryoId: 'e1', cellId: 'ABp', temporal: 2, x: 1, y: -1, z: 0 },
      { embryoId: 'e2', cellId: 'AB', temporal: 1, x: 2, y: 0, z: 0 },
      { embryoId: 'e2', cellId: 'ABa', temporal: 2, x: 3, y: 1, z: 0 },
      { embryoId: 'e2', cellId: 'ABp', temporal: 2, x: 3, y: -1, z: 0 },
    ], { name: 'division', mapping, embryos })
    const cells = new Set(['AB', 'ABa', 'ABp'])
    const parents = new Map<string, string | undefined>([['ABa', 'AB'], ['ABp', 'AB']])
    const divisionMeanCache = hydrateMeanPositionCache('e1\u0000e2', computeMeanPositions({
      observations: divisionDataset.observations,
      activeEmbryoIds: ['e1', 'e2'],
    }))

    const overlay = getDivisionConnections(
      divisionDataset, cells, parents, new Set(['e1', 'e2']), 'overlay', -Infinity, 2,
    )
    expect(overlay).toHaveLength(4)
    expect(overlay.map((connection) => `${connection.embryoId}:${connection.parentCellId}>${connection.childCellId}`))
      .toEqual(['e1:AB>ABa', 'e1:AB>ABp', 'e2:AB>ABa', 'e2:AB>ABp'])

    const mean = getDivisionConnections(
      divisionDataset, cells, parents, new Set(['e1', 'e2']), 'mean', -Infinity, 2, divisionMeanCache,
    )
    expect(mean).toHaveLength(2)
    expect(mean[0].points.map((point) => point.x)).toEqual([1, 2])
    expect(mean.map((connection) => connection.childCellId)).toEqual(['ABa', 'ABp'])
  })
})
