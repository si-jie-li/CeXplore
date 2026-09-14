export interface GroupSurfaceSettings {
  enabled: boolean
  groupIds: string[] | null
  method: 'smooth' | 'convex'
  radiusScale: number
  opacity: number
  mode: 'current' | 'history' | 'specified'
  rangeMode: 'previous' | 'all' | 'range'
  previousFrames: number
  startFrame: number
  endFrame: number
  specifiedFrames: number[]
  historyCount: number
  showCentroidTrail: boolean
}

export const defaultSurfaceSettings: GroupSurfaceSettings = {
  enabled: false, groupIds: null, method: 'smooth', radiusScale: 1, opacity: .25,
  mode: 'current', rangeMode: 'previous', previousFrames: 10, startFrame: 1,
  endFrame: 185, specifiedFrames: [1], historyCount: 3, showCentroidTrail: false,
}

export interface SurfaceGeometryData {
  positions: Float32Array
  normals: Float32Array
  fallback: boolean
}

export type SurfaceWorkerRequest =
  | { id: number; type: 'scale'; frames: Float32Array[] }
  | { id: number; type: 'mesh'; points: Float32Array; sigma: number; method: 'smooth' | 'convex' }

export type SurfaceWorkerResponse =
  | { id: number; type: 'scale'; sigma: number }
  | { id: number; type: 'mesh'; geometry: SurfaceGeometryData }
  | { id: number; type: 'error'; message: string }

export function parseSurfaceFrames(value: string, frameCount: number): number[] {
  const parts = value.trim().split(/[,，\s]+/).filter(Boolean)
  if (!parts.length) throw new Error('Enter at least one playback frame number.')
  if (parts.some((part) => !/^\d+$/.test(part))) throw new Error('Use whole playback frame numbers separated by commas.')
  const frames = [...new Set(parts.map(Number))].sort((a, b) => a - b)
  if (frames.some((frame) => frame < 1 || frame > frameCount)) throw new Error(`Playback frame numbers must be between 1 and ${frameCount}.`)
  if (frames.length > 8) throw new Error('Compare at most 8 specified frames at once.')
  return frames
}

export function normalizeSurfaceSettings(input?: Partial<GroupSurfaceSettings>): GroupSurfaceSettings {
  const value = { ...defaultSurfaceSettings, ...input }
  const bounded = (number: number, fallback: number, min: number, max: number) => Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
  return {
    ...value,
    enabled: value.enabled === true,
    groupIds: Array.isArray(value.groupIds) ? value.groupIds.filter((id) => typeof id === 'string') : null,
    method: value.method === 'convex' ? 'convex' : 'smooth',
    mode: ['current', 'history', 'specified'].includes(value.mode) ? value.mode : 'current',
    rangeMode: ['previous', 'all', 'range'].includes(value.rangeMode) ? value.rangeMode : 'previous',
    radiusScale: bounded(value.radiusScale, 1, .5, 2),
    opacity: bounded(value.opacity, .25, .05, .8),
    previousFrames: Math.floor(bounded(value.previousFrames, 10, 1, Number.MAX_SAFE_INTEGER)),
    startFrame: Math.floor(bounded(value.startFrame, 1, 1, Number.MAX_SAFE_INTEGER)),
    endFrame: Math.floor(bounded(value.endFrame, 185, 1, Number.MAX_SAFE_INTEGER)),
    specifiedFrames: Array.isArray(value.specifiedFrames) ? [...new Set(value.specifiedFrames.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b).slice(0, 8) : [1],
    historyCount: Math.floor(bounded(value.historyCount, 3, 1, 8)),
    showCentroidTrail: value.showCentroidTrail === true,
  }
}

export function surfaceRange(settings: GroupSurfaceSettings, current: number, count: number): [number, number] {
  if (settings.mode === 'specified') return [Math.min(...settings.specifiedFrames) - 1, Math.max(...settings.specifiedFrames) - 1]
  if (settings.rangeMode === 'all') return [0, current]
  if (settings.rangeMode === 'previous') return [Math.max(0, current - settings.previousFrames + 1), current]
  return [Math.min(count - 1, Math.min(settings.startFrame, settings.endFrame) - 1), Math.min(current, Math.max(settings.startFrame, settings.endFrame) - 1)]
}

export function surfaceFrameIndices(settings: GroupSurfaceSettings, current: number, count: number, historyCount = settings.historyCount): number[] {
  if (settings.mode === 'specified') return settings.specifiedFrames.filter((n) => n <= count).map((n) => n - 1)
  if (settings.mode === 'current') return [current]
  const [start, end] = surfaceRange(settings, current, count)
  const last = Math.min(current - 1, end)
  const amount = Math.min(historyCount, last - start + 1)
  const history = amount <= 0 ? [] : Array.from({ length: amount }, (_, i) => amount === 1 ? last : Math.round(start + i * (last - start) / (amount - 1)))
  return [...history, current]
}
