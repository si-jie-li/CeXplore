import { describe, expect, it } from 'vitest'
import type { CellSummary } from '../data/types'
import { resolveLineage } from './lineageResolver'
import { createLineageLayout } from './lineageTree'

function observedCells(entries: Array<[string, number, number]>) {
  return new Map<string, CellSummary>(entries.map(([id, firstStep, lastStep]) => [id, {
    id,
    firstStep,
    lastStep,
    observationCount: lastStep - firstStep + 1,
  }]))
}

describe('classical lineage layout', () => {
  it('ends a mother branch at daughter birth and draws a horizontal division connector', () => {
    const model = resolveLineage(observedCells([
      ['P0', 0, 1],
      ['AB', 2, 3],
      ['P1', 2, 3],
      ['ABa', 4, 5],
      ['ABp', 4, 5],
    ]))
    const layout = createLineageLayout(model, 'frame', 75)
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    const p0 = byId.get('P0')!
    const ab = byId.get('AB')!
    const p1 = byId.get('P1')!

    expect(p0.endValue).toBe(2.5)
    expect(ab.startY).toBeCloseTo(p0.endY)
    expect(p1.startY).toBeCloseTo(p0.endY)
    expect(layout.connectors.find((connector) => connector.parentId === 'P0')).toMatchObject({
      y: p0.endY,
      x1: Math.min(ab.x, p1.x),
      x2: Math.max(ab.x, p1.x),
    })
    expect(layout.axisLabel).toBe('Elapsed time (minutes)')
    expect(layout.valueScale).toBe(1.25)
  })

  it.each([
    ['time', 120, 180, 1],
    ['frame', 1, 2, 75],
  ] as const)('aligns a partial two-cell %s axis with its first observed branches', (
    mode,
    firstStep,
    lastStep,
    interval,
  ) => {
    const model = resolveLineage(observedCells([
      ['AB', firstStep, lastStep],
      ['P1', firstStep, lastStep],
    ]))
    const layout = createLineageLayout(model, mode, interval)
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    const expectedStart = mode === 'frame' ? (firstStep * interval) / 60 : firstStep

    expect(layout.minValue).toBe(expectedStart)
    expect(layout.ticks[0].value).toBe(expectedStart)
    expect(byId.get('AB')?.birthValue).toBe(expectedStart)
    expect(byId.get('P1')?.birthValue).toBe(expectedStart)
    expect(byId.get('P0')?.birthValue).toBe(expectedStart)
    expect(byId.get('P0')?.endValue).toBe(expectedStart)
    expect(byId.get('AB')?.startY).toBeCloseTo(layout.plotTop)
    expect(byId.get('P1')?.startY).toBeCloseTo(layout.plotTop)
  })
})
