import { getFrameGroupIndices, resolveGroupCellIds } from './groupMembership'
import { addNullComparison, addShapeNullComparison, buildSymmetricKnnGraph, calculateRawMetrics } from './groupMetrics'
import type { RawMetricValues } from './groupMetrics'
import type { AnalysisMetric, AnalysisObservation, AnalysisPoint, AnalysisProgress, GroupAnalysisRequest, GroupAnalysisResult } from './types'

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function sampleWithoutReplacement(pool: number[], count: number, random: () => number) {
  const copy = [...pool]
  for (let index = 0; index < count; index += 1) {
    const selected = index + Math.floor(random() * (copy.length - index))
    ;[copy[index], copy[selected]] = [copy[selected], copy[index]]
  }
  return copy.slice(0, count)
}

function makeMatchedNullGroups(
  observations: AnalysisObservation[],
  groupIndices: number[],
  count: number,
  random: () => number,
) {
  if (!groupIndices.length || groupIndices.length > observations.length || !count) return []
  const groupPoints = groupIndices.map((index) => observations[index])
  const centroid = groupPoints.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  )
  centroid.x /= groupPoints.length
  centroid.y /= groupPoints.length
  centroid.z /= groupPoints.length
  const spans = (['x', 'y', 'z'] as const).map((axis) => {
    const values = observations.map((point) => point[axis])
    return Math.max(Math.max(...values) - Math.min(...values), Number.EPSILON)
  })
  const rankedPool = observations
    .map((point, index) => ({
      index,
      distance:
        ((point.x - centroid.x) / spans[0]) ** 2
        + ((point.y - centroid.y) / spans[1]) ** 2
        + ((point.z - centroid.z) / spans[2]) ** 2,
    }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ index }) => index)
  const poolSize = Math.min(observations.length, Math.max(groupIndices.length * 4, groupIndices.length + 8, 24))
  const localPool = rankedPool.slice(0, poolSize)
  return Array.from({ length: count }, () => sampleWithoutReplacement(localPool, groupIndices.length, random))
}

function frameKey(observation: AnalysisObservation) {
  return `${observation.embryoId}\u0000${observation.step}`
}

function groupFrames(request: GroupAnalysisRequest) {
  const frames = new Map<string, AnalysisObservation[]>()
  const activeEmbryos = new Set(request.embryoIds)
  for (const observation of request.observations) {
    if (!activeEmbryos.has(observation.embryoId)) continue
    const key = frameKey(observation)
    const frame = frames.get(key) ?? []
    frame.push(observation)
    frames.set(key, frame)
  }
  return [...frames.values()].sort((a, b) =>
    request.embryoIds.indexOf(a[0].embryoId) - request.embryoIds.indexOf(b[0].embryoId)
    || a[0].step - b[0].step,
  )
}

function metricNullValues(metric: AnalysisMetric, samples: RawMetricValues[]) {
  return samples.map((sample) => sample[metric])
}

export function runGroupAnalysis(
  request: GroupAnalysisRequest,
  onProgress?: (progress: AnalysisProgress) => void,
): GroupAnalysisResult {
  const metrics = new Set(request.metrics)
  const resolvedGroup = resolveGroupCellIds(request.group, request.parentByCell)
  const frames = groupFrames(request)
  const points: AnalysisPoint[] = []
  const warnings: string[] = []

  frames.forEach((frame, frameIndex) => {
    const spatialPoints = frame.map(({ x, y, z }) => ({ x, y, z }))
    const groupIndices = getFrameGroupIndices(resolvedGroup, frame.map(({ cellId }) => cellId))
    const groupSize = groupIndices.length
    const eligible = groupSize >= request.minimumGroupSize
    const point: AnalysisPoint = {
      embryoId: frame[0].embryoId,
      step: frame[0].step,
      groupSize,
      totalCells: frame.length,
      eligible,
    }

    if (groupSize) {
      const graph = buildSymmetricKnnGraph(spatialPoints, request.k)
      const apValues = frame.map((observation) => observation.x)
      const apSpan = Math.max(...apValues) - Math.min(...apValues)
      const observed = calculateRawMetrics(spatialPoints, graph, groupIndices, metrics, apSpan)
      const random = mulberry32(request.randomSeed ^ hashString(`${point.embryoId}:${point.step}`))
      const nullGroups = makeMatchedNullGroups(frame, groupIndices, request.nullSamples, random)
      const nullMetrics = nullGroups.map((indices) => calculateRawMetrics(spatialPoints, graph, indices, metrics, apSpan))
      if (metrics.has('purity')) point.purity = addNullComparison(observed.purity, metricNullValues('purity', nullMetrics))
      if (metrics.has('connectedness')) point.connectedness = addNullComparison(observed.connectedness, metricNullValues('connectedness', nullMetrics))
      if (metrics.has('compactness')) point.compactness = addNullComparison(observed.compactness, metricNullValues('compactness', nullMetrics))
      if (metrics.has('shape')) point.shape = addShapeNullComparison(observed.shape, observed.shapeEigenvalues, metricNullValues('shape', nullMetrics))
    }
    points.push(point)
    if ((frameIndex + 1) % 4 === 0 || frameIndex === frames.length - 1) {
      onProgress?.({ completedFrames: frameIndex + 1, totalFrames: frames.length })
    }
  })

  if (!points.some((point) => point.groupSize)) warnings.push('The selected group was not observed in the chosen embryos.')
  if (!points.some((point) => point.eligible)) warnings.push(`No frame contained at least ${request.minimumGroupSize} group cells; values are shown but flagged as low-n.`)
  if (metrics.has('compactness') && points.some((point) => point.groupSize > 0 && point.compactness?.value === null)) {
    warnings.push('Normalized Rg is unavailable where the observed AP span is zero.')
  }
  if (points.some((point) => point.groupSize === point.totalCells && point.groupSize > 0)) {
    warnings.push('At some frames the group contains the whole observed embryo, so neighborhood purity has no outside-cell contrast.')
  }

  return {
    datasetName: request.datasetName,
    temporalMode: request.temporalMode,
    embryoIds: request.embryoIds,
    group: request.group,
    metrics: request.metrics,
    k: request.k,
    nullSamples: request.nullSamples,
    minimumGroupSize: request.minimumGroupSize,
    points,
    warnings,
  }
}
