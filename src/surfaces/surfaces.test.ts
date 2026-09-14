import { describe, expect, it } from 'vitest'
import { buildSurfaceGeometry, estimateSurfaceSigma } from './geometry'
import { defaultSurfaceSettings as defaults, parseSurfaceFrames, surfaceFrameIndices, surfaceRange } from './types'
import { SurfaceRuntime } from './runtime'
import { buildDatasetFromRows } from '../data/frameIndex'
import { resolveLineage } from '../lineage/lineageResolver'
import { createSessionConfiguration, useExplorerStore } from '../state/explorerStore'
import { useSurfaceStore } from './surfaceStore'
import { computeMeanPositions } from '../data/meanPositionComputation'
import { hydrateMeanPositionCache, MEAN_EMBRYO_ID } from '../data/embryoView'

describe('surface geometry', () => {
  it('estimates a stable equal-weight nearest-neighbor scale', () => {
    expect(estimateSurfaceSigma([new Float32Array([0, 0, 0, 2, 0, 0])])).toBeCloseTo(1.2)
  })
  it('keeps distant clusters separate and has finite normals', () => {
    const result = buildSurfaceGeometry(new Float32Array([0, 0, 0, 10, 0, 0]), 0.5, 'smooth')
    expect(result.positions.length).toBeGreaterThan(0)
    expect([...result.normals].every(Number.isFinite)).toBe(true)
    const xs = [...result.positions].filter((_, i) => i % 3 === 0)
    expect(xs.every((x) => x < 2 || x > 8)).toBe(true)
  })
  it('translates the surface with the points, including across fixed grid tiles', () => {
    const a = buildSurfaceGeometry(new Float32Array([0, 0, 0]), 0.5, 'smooth')
    const b = buildSurfaceGeometry(new Float32Array([10.5, 0, 0]), 0.5, 'smooth')
    const xs = (p: Float32Array) => [...p].filter((_, i) => i % 3 === 0)
    expect(Math.min(...xs(b.positions)) - Math.min(...xs(a.positions))).toBeCloseTo(10.5, 4)
    expect(Math.max(...xs(b.positions)) - Math.max(...xs(a.positions))).toBeCloseTo(10.5, 4)
  })
  it('handles missing, singleton, collinear and coplanar cells', () => {
    expect(buildSurfaceGeometry(new Float32Array(), 1, 'smooth').positions.length).toBe(0)
    for (const values of [[0, 0, 0], [0, 0, 0, 1, 0, 0, 2, 0, 0], [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]]) {
      const geometry = buildSurfaceGeometry(new Float32Array(values), 0.5, 'convex')
      expect(geometry.fallback).toBe(true)
      expect(geometry.positions.length).toBeGreaterThan(0)
    }
    expect(buildSurfaceGeometry(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), 0.5, 'convex').fallback).toBe(false)
  })
})

describe('surface frame semantics', () => {
  it('strictly validates specified playback ordinals', () => {
    expect(parseSurfaceFrames('78, 15,30,15', 185)).toEqual([15, 30, 78])
    for (const input of ['', '0', '186', '1.5', '1,2,3,4,5,6,7,8,9']) expect(() => parseSurfaceFrames(input, 185)).toThrow()
    expect(surfaceFrameIndices({ ...defaults, mode: 'specified', specifiedFrames: [15, 30, 78] }, 0, 185)).toEqual([14, 29, 77])
  })
  it('limits history without including future snapshots, and uses full specified centroid interval', () => {
    expect(surfaceFrameIndices({ ...defaults, mode: 'history', rangeMode: 'all' }, 10, 185)).toEqual([0, 5, 9, 10])
    expect(surfaceFrameIndices({ ...defaults, mode: 'history', previousFrames: 2 }, 10, 185)).toEqual([9, 10])
    expect(surfaceRange({ ...defaults, mode: 'specified', specifiedFrames: [15, 78] }, 0, 185)).toEqual([14, 77])
  })
})

const dataset = () => buildDatasetFromRows([
  { cellId: 'AB', embryoId: 'a', temporal: 1, x: 0, y: 0, z: 0 },
  { cellId: 'P1', embryoId: 'a', temporal: 1, x: 2, y: 0, z: 0 },
  { cellId: 'AB', embryoId: 'b', temporal: 1, x: 10, y: 0, z: 0 },
  { cellId: 'AB', embryoId: 'a', temporal: 2, x: 1, y: 0, z: 0 },
  { cellId: 'P1', embryoId: 'b', temporal: 2, x: 3, y: 0, z: 0 },
], { name: 'surface.csv', mapping: { cellId: 'cell', x: 'x', y: 'y', z: 'z', frame: 'frame', embryo: 'embryo', playback: 'frame' } })

describe('surface runtime and sessions', () => {
  it('separates overlay embryos, excludes hidden cells, reuses geometry and disposes cache', async () => {
    const data = dataset()
    const runtime = new SurfaceRuntime({ dataset: data, groups: [{ id: 'g', name: 'Group', color: '#ff0000', visible: true, source: 'manual', createdAt: 0, cellIds: ['AB', 'P1'] }], activeEmbryoIds: new Set(['a', 'b']), mode: 'overlay', hidden: { P1: false }, settings: { ...defaults, showCentroidTrail: true, rangeMode: 'all' } })
    const first = await runtime.prepare(0)
    expect(first.pieces.map((p) => p.embryoId).sort()).toEqual(['a', 'b'])
    const second = await runtime.prepare(1)
    expect(second.pieces.map((p) => p.embryoId)).toEqual(['a'])
    expect(second.paths.find((p) => p.embryoId === 'b')?.points).toHaveLength(1)
    expect(second.paths.find((p) => p.embryoId === 'a')?.points[0].position[0]).toBe(data.frameIndex.get(data.frameValues[0])!.find((r) => r.cellId === 'AB' && r.embryoId === 'a')!.renderX)
    runtime.configure({ ...defaults, opacity: .7 })
    expect((await runtime.prepare(0)).pieces[0].geometry).toBe(first.pieces[0].geometry)
    expect(runtime.cacheBytes).toBeGreaterThan(0)
    runtime.dispose()
    expect(runtime.cacheBytes).toBe(0)
    await expect(runtime.prepare(0)).rejects.toThrow('cancelled')
  })
  it('round-trips settings, resets for old sessions and synchronizes visibility', () => {
    const data = dataset()
    useExplorerStore.getState().setDataset(data, resolveLineage(data.cells))
    useExplorerStore.getState().setSelection(['AB'])
    useExplorerStore.getState().applyColor('#ff0000', true)
    const group = useExplorerStore.getState().groups[0]
    useSurfaceStore.getState().setSettings({ enabled: true, mode: 'specified', specifiedFrames: [1, 2], groupIds: [group.id] })
    const session = createSessionConfiguration(useExplorerStore.getState())!
    useSurfaceStore.getState().reset()
    useExplorerStore.getState().importConfiguration(session)
    expect(useSurfaceStore.getState().settings.specifiedFrames).toEqual([1, 2])
    expect(useSurfaceStore.getState().settings.enabled).toBe(true)
    useExplorerStore.getState().updateGroup(group.id, { visible: false })
    expect(useSurfaceStore.getState().settings.groupIds).toEqual([])
    useExplorerStore.getState().importConfiguration({ ...session, surfaceSettings: undefined })
    expect(useSurfaceStore.getState().settings.enabled).toBe(false)
    useExplorerStore.getState().clearDataset()
    expect(useSurfaceStore.getState().prepareFrame).toBeUndefined()
  })
  it('builds mean-mode surfaces from per-cell mean cache, not mixed embryo clouds', async () => {
    const data = dataset()
    const meanCache = hydrateMeanPositionCache('test', computeMeanPositions({ observations: data.observations, activeEmbryoIds: ['a', 'b'] }))
    const runtime = new SurfaceRuntime({ dataset: data, groups: [{ id: 'g', name: 'Group', color: '#ff0000', visible: true, source: 'manual', createdAt: 0, cellIds: ['AB'] }], activeEmbryoIds: new Set(['a', 'b']), mode: 'mean', meanCache, hidden: {}, settings: { ...defaults, showCentroidTrail: true } })
    const result = await runtime.prepare(0)
    expect(result.pieces).toHaveLength(1)
    expect(result.pieces[0].embryoId).toBe(MEAN_EMBRYO_ID)
    expect(result.paths[0].points[0].position[0]).toBe(meanCache.frameIndex.get(data.frameValues[0])!.find((r) => r.cellId === 'AB')!.renderX)
    runtime.dispose()
  })
})
