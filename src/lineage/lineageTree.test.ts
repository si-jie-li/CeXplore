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
    const layout = createLineageLayout(model, 'frame')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    const p0 = byId.get('P0')!
    const ab = byId.get('AB')!
    const p1 = byId.get('P1')!

    expect(p0.endValue).toBe(2)
    expect(ab.startY).toBeCloseTo(p0.endY)
    expect(p1.startY).toBeCloseTo(p0.endY)
    expect(layout.connectors.find((connector) => connector.parentId === 'P0')).toMatchObject({
      y: p0.endY,
      x1: Math.min(ab.x, p1.x),
      x2: Math.max(ab.x, p1.x),
    })
    expect(layout.axisLabel).toBe('Frame')
  })

  it('uses canonical developmental minutes when no uploaded time or frame exists', () => {
    const model = resolveLineage(observedCells([
      ['ABpl', 0, 0],
      ['MS', 0, 0],
    ]))
    const layout = createLineageLayout(model, 'generation')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))

    expect(layout.usesCanonicalTime).toBe(true)
    expect(layout.axisLabel).toBe('Canonical developmental time (min)')
    expect(byId.get('P0')?.birthValue).toBe(0)
    expect(byId.get('P0')?.endValue).toBe(40)
    expect(byId.get('AB')?.birthValue).toBe(40)
  })
})
