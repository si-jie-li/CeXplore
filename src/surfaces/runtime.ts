import type { EmbryoDataset, Observation } from '../data/types'
import { getFrameObservations, type MeanPositionCache } from '../data/embryoView'
import type { CellGroup } from '../state/explorerStore'
import { surfaceFrameIndices, surfaceRange, type GroupSurfaceSettings, type SurfaceGeometryData, type SurfaceWorkerRequest, type SurfaceWorkerResponse } from './types'

const CACHE_LIMIT = 96 * 1024 * 1024
const sigmaCache = new WeakMap<EmbryoDataset, number>()
const pack = (rows: Observation[]) => Float32Array.from(rows.flatMap((row) => [row.renderX, row.renderY, row.renderZ]))

class SurfaceWorkerClient {
  private worker?: Worker
  private nextId = 0
  private pending = new Map<number, { resolve: (response: SurfaceWorkerResponse) => void; reject: (reason: Error) => void }>()
  private disposed = false
  constructor() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('./surface.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }: MessageEvent<SurfaceWorkerResponse>) => {
        const job = this.pending.get(data.id)
        this.pending.delete(data.id)
        if (data.type === 'error') job?.reject(new Error(data.message))
        else job?.resolve(data)
      }
      this.worker.onerror = (event) => {
        this.disposed = true
        this.worker?.terminate()
        this.fail(new Error(event.message || 'Surface worker failed.'))
      }
    }
  }
  private fail(error: Error) {
    for (const job of this.pending.values()) job.reject(error)
    this.pending.clear()
  }
  async request(input: Omit<Extract<SurfaceWorkerRequest, { type: 'scale' }>, 'id'> | Omit<Extract<SurfaceWorkerRequest, { type: 'mesh' }>, 'id'>): Promise<SurfaceWorkerResponse> {
    if (this.disposed) throw new Error('Surface task cancelled.')
    const id = ++this.nextId
    if (!this.worker) {
      const { buildSurfaceGeometry, estimateSurfaceSigma } = await import('./geometry')
      if (this.disposed) throw new Error('Surface task cancelled.')
      return input.type === 'scale' ? { id, type: 'scale', sigma: estimateSurfaceSigma(input.frames) } : { id, type: 'mesh', geometry: buildSurfaceGeometry(input.points, input.sigma, input.method) }
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const transfer = input.type === 'scale' ? input.frames.map((frame) => frame.buffer) : [input.points.buffer]
      this.worker!.postMessage({ ...input, id }, transfer)
    })
  }
  dispose() {
    this.disposed = true
    this.worker?.terminate()
    this.fail(new Error('Surface task cancelled.'))
  }
}

export interface SurfacePiece {
  key: string
  groupId: string
  embryoId: string
  frame: number
  geometry: SurfaceGeometryData
}
export interface CentroidPath { groupId: string; embryoId: string; points: Array<{ frame: number; position: [number, number, number] }> }
export interface SurfaceBundle { index: number; frames: number[]; pieces: SurfacePiece[]; paths: CentroidPath[]; sigma: number; note: string }

export interface SurfaceInput {
  dataset: EmbryoDataset
  groups: CellGroup[]
  activeEmbryoIds: Set<string>
  mode: 'overlay' | 'mean'
  meanCache?: MeanPositionCache
  hidden: Record<string, boolean>
  settings: GroupSurfaceSettings
}

class BudgetError extends Error {}

/** One runtime owns one immutable geometry configuration and one Worker. */
export class SurfaceRuntime {
  private client = new SurfaceWorkerClient()
  private cache = new Map<string, SurfaceGeometryData>()
  private bytes = 0
  private disposed = false
  private sigma?: number
  private currentKeys = new Set<string>()
  private revision = 0
  private queue: Array<{ key: string; settings: GroupSurfaceSettings; index: number; prefetch: boolean; resolve: (bundle: SurfaceBundle) => void; reject: (error: unknown) => void }> = []
  private pending = new Map<string, Promise<SurfaceBundle>>()
  private running = false
  constructor(private input: SurfaceInput) {}

  get cacheBytes() { return this.bytes }

  configure(settings: GroupSurfaceSettings) {
    this.input.settings = settings
    this.revision++
    for (const job of this.queue) { job.reject(new Error('Surface task superseded.')); this.pending.delete(job.key) }
    this.queue = []
  }

  activate(bundle: SurfaceBundle) { this.currentKeys = new Set(bundle.pieces.map((piece) => piece.key)) }

  prepare(index: number, prefetch = false): Promise<SurfaceBundle> {
    if (this.disposed) return Promise.reject(new Error('Surface task cancelled.'))
    const key = `${this.revision}:${index}`
    const existing = this.pending.get(key)
    if (existing) {
      if (!prefetch) { const job = this.queue.find((item) => item.key === key); if (job) job.prefetch = false }
      return existing
    }
    if (!prefetch) {
      this.queue = this.queue.filter((job) => {
        if (job.prefetch) return true
        job.reject(new Error('Surface task superseded.'))
        this.pending.delete(job.key)
        return false
      })
    }
    const promise = new Promise<SurfaceBundle>((resolve, reject) => { this.queue.push({ key, settings: this.input.settings, index, prefetch, resolve, reject }) })
    this.pending.set(key, promise)
    void this.drain()
    return promise
  }

  private async drain() {
    if (this.running) return
    this.running = true
    while (this.queue.length && !this.disposed) {
      this.queue.sort((a, b) => Number(a.prefetch) - Number(b.prefetch))
      const job = this.queue.shift()!
      try { job.resolve(await this.build(job.index, job.prefetch, job.settings)) } catch (error) { job.reject(error) }
      this.pending.delete(job.key)
    }
    this.running = false
  }

  private async getSigma() {
    if (this.sigma) return this.sigma
    const dataset = this.input.dataset
    let base = sigmaCache.get(dataset)
    if (!base) {
      const length = Math.min(16, dataset.frameValues.length)
      const indices = [...new Set(Array.from({ length }, (_, i) => Math.round(i * (dataset.frameValues.length - 1) / Math.max(1, length - 1))))]
      const frames: Float32Array[] = []
      for (const index of indices) {
        const byEmbryo = new Map<string, Observation[]>()
        for (const row of dataset.frameIndex.get(dataset.frameValues[index]) ?? []) {
          const rows = byEmbryo.get(row.embryoId) ?? []
          rows.push(row)
          byEmbryo.set(row.embryoId, rows)
        }
        for (const rows of byEmbryo.values()) frames.push(pack(rows))
      }
      const result = await this.client.request({ type: 'scale', frames })
      if (result.type !== 'scale') throw new Error('Invalid scale result.')
      base = result.sigma
      sigmaCache.set(dataset, base)
    }
    this.sigma = base * this.input.settings.radiusScale
    return this.sigma
  }

  private rows(index: number) {
    const { dataset, activeEmbryoIds, mode, meanCache } = this.input
    return getFrameObservations(dataset, dataset.frameValues[index], activeEmbryoIds, mode, meanCache)
  }

  private byGroup(index: number): Array<{ groupId: string; embryoId: string; rows: Observation[] }> {
    const rows = this.rows(index)
    return this.input.groups.flatMap((group) => {
      const ids = new Set(group.cellIds)
      const embryos = new Map<string, Observation[]>()
      for (const row of rows) {
        if (!ids.has(row.cellId) || this.input.hidden[row.cellId] === false) continue
        const members = embryos.get(row.embryoId) ?? []
        members.push(row)
        embryos.set(row.embryoId, members)
      }
      return [...embryos].map(([embryoId, members]) => ({ groupId: group.id, embryoId, rows: members }))
    })
  }

  private put(key: string, geometry: SurfaceGeometryData, protectedKeys: Set<string>) {
    const size = geometry.positions.byteLength + geometry.normals.byteLength
    for (const [candidate, item] of this.cache) {
      if (this.bytes + size <= CACHE_LIMIT) break
      if (protectedKeys.has(candidate) || this.currentKeys.has(candidate)) continue
      this.cache.delete(candidate)
      this.bytes -= item.positions.byteLength + item.normals.byteLength
    }
    if (this.bytes + size > CACHE_LIMIT) throw new BudgetError('Surface memory budget reached. Show fewer groups, embryos or specified frames, or increase smoothing.')
    this.cache.set(key, geometry)
    this.bytes += size
  }

  private centroidPaths(index: number, settings: GroupSurfaceSettings): CentroidPath[] {
    if (!settings.showCentroidTrail) return []
    const [start, end] = surfaceRange(settings, index, this.input.dataset.frameValues.length)
    const paths: CentroidPath[] = []
    const active = new Map<string, CentroidPath>()
    for (let frame = Math.max(0, start); frame <= Math.min(end, this.input.dataset.frameValues.length - 1); frame++) {
      const present = new Set<string>()
      for (const group of this.byGroup(frame)) {
        const key = `${group.groupId}:${group.embryoId}`
        present.add(key)
        let path = active.get(key)
        if (!path) { path = { groupId: group.groupId, embryoId: group.embryoId, points: [] }; active.set(key, path); paths.push(path) }
        const position: [number, number, number] = [0, 0, 0]
        for (const row of group.rows) { position[0] += row.renderX; position[1] += row.renderY; position[2] += row.renderZ }
        path.points.push({ frame, position: position.map((n) => n / group.rows.length) as [number, number, number] })
      }
      for (const key of active.keys()) if (!present.has(key)) active.delete(key)
    }
    return paths
  }

  private async build(index: number, prefetch: boolean, settings: GroupSurfaceSettings): Promise<SurfaceBundle> {
    if (!this.input.groups.length) return { index, frames: [], pieces: [], paths: [], sigma: 0, note: '' }
    const sigma = await this.getSigma()
    const { dataset } = this.input
    for (let count = settings.historyCount; count >= 0; count--) {
      const frames = surfaceFrameIndices(settings, index, dataset.frameValues.length, count)
      const pieces: SurfacePiece[] = []
      const protectedKeys = new Set<string>()
      try {
        for (const frame of frames) for (const group of this.byGroup(frame)) {
          const key = JSON.stringify([group.groupId, group.embryoId, frame])
          protectedKeys.add(key)
          let geometry = this.cache.get(key)
          if (geometry) { this.cache.delete(key); this.cache.set(key, geometry) }
          else {
            const response = await this.client.request({ type: 'mesh', points: pack(group.rows), sigma, method: settings.method })
            if (this.disposed) throw new Error('Surface task cancelled.')
            if (response.type !== 'mesh') throw new Error('Invalid surface result.')
            geometry = response.geometry
            this.put(key, geometry, protectedKeys)
          }
          pieces.push({ key, groupId: group.groupId, embryoId: group.embryoId, frame, geometry })
        }
        return { index, frames, pieces, paths: this.centroidPaths(index, settings), sigma, note: count < settings.historyCount ? `History reduced to ${count} snapshots to stay within the memory budget.` : pieces.some((p) => p.geometry.fallback) ? 'Some groups have too few non-coplanar points; smooth envelopes are used instead of convex hulls.' : '' }
      } catch (error) {
        if (!(error instanceof BudgetError) || settings.mode !== 'history' || count === 0 || prefetch) throw error
      }
    }
    throw new Error('Unable to prepare surfaces.')
  }

  dispose() {
    this.disposed = true
    this.client.dispose()
    for (const job of this.queue) job.reject(new Error('Surface task cancelled.'))
    this.queue = []
    this.cache.clear()
    this.pending.clear()
    this.currentKeys.clear()
    this.bytes = 0
  }
}
