import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import {
  resolveTrailCellIds,
  resolveTrailGroups,
  TRAIL_NEW_OPACITY,
  TRAIL_OLD_OPACITY,
  trailOpacityAtStep,
  trailVertexColor,
} from './trails'

const groups = [
  { id: 'ab', cellIds: ['AB', 'ABa', 'ABp'] },
  { id: 'ms', cellIds: ['MS', 'MSa', 'MSp'] },
]

describe('trail group selection', () => {
  it('uses every saved group by default and survives an empty cell selection', () => {
    expect(resolveTrailGroups(groups, 'all')).toEqual(groups)
    expect([...resolveTrailCellIds(groups, 'all', [])].sort())
      .toEqual(['AB', 'ABa', 'ABp', 'MS', 'MSa', 'MSp'].sort())
  })

  it('uses explicit trail groups, with current selection only as a no-group fallback', () => {
    expect(resolveTrailGroups(groups, ['ms'])).toEqual([groups[1]])
    expect([...resolveTrailCellIds(groups, ['ms'], ['AB'])].sort()).toEqual(['MS', 'MSa', 'MSp'])
    expect([...resolveTrailCellIds([], 'all', ['AB'])]).toEqual(['AB'])
  })

  it('fades old positions and makes recent positions progressively more opaque', () => {
    expect(trailOpacityAtStep(10, 10, 30)).toBe(TRAIL_OLD_OPACITY)
    expect(trailOpacityAtStep(20, 10, 30)).toBeGreaterThan(TRAIL_OLD_OPACITY)
    expect(trailOpacityAtStep(20, 10, 30)).toBeLessThan(0.5)
    expect(trailOpacityAtStep(30, 10, 30)).toBe(TRAIL_NEW_OPACITY)
    expect(trailOpacityAtStep(10, 10, 10)).toBe(TRAIL_NEW_OPACITY)

    const oldColor = trailVertexColor('#3978c5', 10, 10, 30)
    const newColor = trailVertexColor('#3978c5', 30, 10, 30)
    const oldHsl = { h: 0, s: 0, l: 0 }
    const newHsl = { h: 0, s: 0, l: 0 }
    new Color().setRGB(...oldColor.slice(0, 3) as [number, number, number]).getHSL(oldHsl)
    new Color().setRGB(...newColor.slice(0, 3) as [number, number, number]).getHSL(newHsl)
    expect(oldColor[3]).toBe(0.04)
    expect(newColor[3]).toBe(1)
    expect(oldHsl.l).toBeGreaterThan(newHsl.l)
    expect(oldHsl.s).toBeLessThan(newHsl.s)
  })
})
