import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import {
  resolveTrailCellIds,
  resolveTrailGroups,
  resolveTrailStepRange,
  TRAIL_NEW_OPACITY,
  TRAIL_OLD_OPACITY,
  trailOpacityAtStep,
  trailVertexColor,
} from './trails'

const groups = [
  { id: 'ab', cellIds: ['AB', 'ABa', 'ABp'], visible: true },
  { id: 'ms', cellIds: ['MS', 'MSa', 'MSp'], visible: false },
]

describe('trail group selection', () => {
  it('uses visible groups by default and survives an empty cell selection', () => {
    expect(resolveTrailGroups(groups, [])).toEqual([groups[0]])
    expect([...resolveTrailCellIds(groups, [], [])].sort())
      .toEqual(['AB', 'ABa', 'ABp'].sort())

    expect(resolveTrailGroups(groups, 'all')).toEqual(groups)
    expect([...resolveTrailCellIds(groups, 'all', [])].sort())
      .toEqual(['AB', 'ABa', 'ABp', 'MS', 'MSa', 'MSp'].sort())
  })

  it('adds explicit hidden groups to the visible base, with current selection only as a no-group fallback', () => {
    expect(resolveTrailGroups(groups, ['ms'])).toEqual(groups)
    expect([...resolveTrailCellIds(groups, ['ms'], ['AB'])].sort())
      .toEqual(['AB', 'ABa', 'ABp', 'MS', 'MSa', 'MSp'].sort())
    expect([...resolveTrailCellIds([], 'all', ['AB'])]).toEqual(['AB'])
  })

  it('resolves all-previous or explicit playback ranges without exposing future frames', () => {
    const frames = [10, 20, 30, 40]
    expect(resolveTrailStepRange(frames, 30, 'all')).toEqual({ start: 10, end: 30 })
    expect(resolveTrailStepRange(frames, 40, 'previous', undefined, undefined, 2)).toEqual({ start: 30, end: 40 })
    expect(resolveTrailStepRange(frames, 20, 'previous', undefined, undefined, 20)).toEqual({ start: 10, end: 20 })
    expect(resolveTrailStepRange(frames, 40, 'custom', 15, 35)).toEqual({ start: 20, end: 30 })
    expect(resolveTrailStepRange(frames, 30, 'custom', 10, 40)).toEqual({ start: 10, end: 30 })
    expect(resolveTrailStepRange(frames, 10, 'custom', 20, 40)).toBeUndefined()
    expect(resolveTrailStepRange(frames, 40, 'custom', 40, 20)).toEqual({ start: 20, end: 40 })
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
