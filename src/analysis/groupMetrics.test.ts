import { describe, expect, it } from 'vitest'
import { buildSymmetricKnnGraph, calculateLargestConnectedFraction, calculatePurity, calculateRawMetrics, calculateShape } from './groupMetrics'

const compactCluster = [
  { x: 0, y: 0, z: 0 },
  { x: .1, y: 0, z: 0 },
  { x: 0, y: .1, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 4.1, y: 0, z: 0 },
  { x: 4, y: .1, z: 0 },
]

describe('synthetic spatial metrics', () => {
  it('reports an internally connected, pure compact cluster', () => {
    const graph = buildSymmetricKnnGraph(compactCluster, 1)
    expect(calculatePurity(graph, [0, 1, 2])).toBe(1)
    expect(calculateLargestConnectedFraction(graph, [0, 1, 2])).toBe(1)
  })

  it('normalizes radius of gyration against AP scale', () => {
    const metrics = new Set(['compactness'] as const)
    const original = calculateRawMetrics(compactCluster, buildSymmetricKnnGraph(compactCluster, 2), [0, 1, 2], metrics, 4.1)
    const scaled = compactCluster.map((point) => ({ x: point.x * 7, y: point.y * 7, z: point.z * 7 }))
    const scaledMetrics = calculateRawMetrics(scaled, buildSymmetricKnnGraph(scaled, 2), [0, 1, 2], metrics, 4.1 * 7)
    expect(scaledMetrics.compactness).toBeCloseTo(original.compactness!, 10)
  })

  it('distinguishes an elongated line from an isotropic point cloud', () => {
    const line = [{ x: -2, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]
    const tetrahedron = [{ x: 1, y: 1, z: 1 }, { x: -1, y: -1, z: 1 }, { x: -1, y: 1, z: -1 }, { x: 1, y: -1, z: -1 }]
    expect(calculateShape(line, [0, 1, 2, 3]).anisotropy).toBeCloseTo(1)
    expect(calculateShape(tetrahedron, [0, 1, 2, 3]).anisotropy).toBeCloseTo(0)
  })
})
