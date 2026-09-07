import type {
  CellSummary,
  ColumnMapping,
  CoordinateBounds,
  DatasetSource,
  EmbryoDataset,
  EmbryoDescriptor,
  Observation,
  RawMappedRow,
} from './types'

export const makeEmbryoId = (sourceId: string, sourceEmbryoId: string) =>
  `${sourceId}::${encodeURIComponent(sourceEmbryoId)}`

export const trajectoryKey = (embryoId: string, cellId: string) => `${embryoId}\u0000${cellId}`

const finiteNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return undefined
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : undefined
}

const emptyBounds: CoordinateBounds = {
  min: [0, 0, 0],
  max: [0, 0, 0],
  center: [0, 0, 0],
  span: [1, 1, 1],
  scale: 1,
}

function computeBounds(observations: Omit<Observation, 'renderX' | 'renderY' | 'renderZ'>[]) {
  if (!observations.length) return emptyBounds
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const row of observations) {
    min[0] = Math.min(min[0], row.x)
    min[1] = Math.min(min[1], row.y)
    min[2] = Math.min(min[2], row.z)
    max[0] = Math.max(max[0], row.x)
    max[1] = Math.max(max[1], row.y)
    max[2] = Math.max(max[2], row.z)
  }
  const span: [number, number, number] = [
    Math.max(max[0] - min[0], Number.EPSILON),
    Math.max(max[1] - min[1], Number.EPSILON),
    Math.max(max[2] - min[2], Number.EPSILON),
  ]
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ]
  return { min, max, span, center, scale: 16 / Math.max(...span) }
}

export function buildDatasetFromRows(
  rows: RawMappedRow[],
  options: {
    name: string
    sourceSize?: number
    mapping: ColumnMapping
    sources?: DatasetSource[]
    embryos?: EmbryoDescriptor[]
  },
): EmbryoDataset {
  const { mapping } = options
  const defaultEmbryoId = options.embryos?.[0]?.id ?? 'embryo-1'
  const invalid = { missingCell: 0, coordinate: 0, temporal: 0, duplicate: 0 }
  const deDuplicated = new Map<string, Omit<Observation, 'renderX' | 'renderY' | 'renderZ'>>()
  const parentOverrides = new Map<string, string>()

  for (const row of rows) {
    const cellId = String(row.cellId ?? '').trim()
    const embryoId = String(row.embryoId ?? defaultEmbryoId).trim() || defaultEmbryoId
    if (!cellId) {
      invalid.missingCell += 1
      continue
    }
    const x = finiteNumber(row.x)
    const y = finiteNumber(row.y)
    const z = finiteNumber(row.z)
    if (x === undefined || y === undefined || z === undefined) {
      invalid.coordinate += 1
      continue
    }
    const temporal = mapping.playback === 'none' ? 0 : finiteNumber(row.temporal)
    if (temporal === undefined) {
      invalid.temporal += 1
      continue
    }
    const parentId = String(row.parent ?? '').trim() || undefined
    if (parentId) parentOverrides.set(cellId, parentId)
    const key = `${embryoId}\u0000${temporal}\u0000${cellId}`
    if (deDuplicated.has(key)) invalid.duplicate += 1
    deDuplicated.set(key, { cellId, embryoId, step: temporal, x, y, z, parentId })
  }

  const rawObservations = [...deDuplicated.values()]
  const bounds = computeBounds(rawObservations)
  const observations: Observation[] = rawObservations
    .map((row) => ({
      ...row,
      renderX: (row.x - bounds.center[0]) * bounds.scale,
      renderY: (row.y - bounds.center[1]) * bounds.scale,
      renderZ: (row.z - bounds.center[2]) * bounds.scale,
    }))
    .sort((a, b) => a.step - b.step || a.embryoId.localeCompare(b.embryoId) || a.cellId.localeCompare(b.cellId))

  const frameIndex = new Map<number, Observation[]>()
  const trajectoryIndex = new Map<string, Observation[]>()
  const cells = new Map<string, CellSummary>()
  for (const observation of observations) {
    const frame = frameIndex.get(observation.step) ?? []
    frame.push(observation)
    frameIndex.set(observation.step, frame)
    const key = trajectoryKey(observation.embryoId, observation.cellId)
    const trajectory = trajectoryIndex.get(key) ?? []
    trajectory.push(observation)
    trajectoryIndex.set(key, trajectory)
    const summary = cells.get(observation.cellId)
    if (summary) {
      summary.firstStep = Math.min(summary.firstStep, observation.step)
      summary.lastStep = Math.max(summary.lastStep, observation.step)
      summary.observationCount += 1
    } else {
      cells.set(observation.cellId, {
        id: observation.cellId,
        firstStep: observation.step,
        lastStep: observation.step,
        observationCount: 1,
      })
    }
  }

  const warnings: string[] = []
  if (invalid.missingCell) warnings.push(`${invalid.missingCell.toLocaleString()} rows lacked a cell ID.`)
  if (invalid.coordinate) warnings.push(`${invalid.coordinate.toLocaleString()} rows had invalid coordinates.`)
  if (invalid.temporal) warnings.push(`${invalid.temporal.toLocaleString()} rows had an invalid time/frame.`)
  if (invalid.duplicate) warnings.push(`${invalid.duplicate.toLocaleString()} duplicate cell/time rows were replaced by the last value.`)
  if (!observations.length) warnings.push('No valid observations matched this mapping and embryo filter.')

  const observedEmbryoIds = [...new Set(observations.map((observation) => observation.embryoId))]
  const embryos = options.embryos ?? observedEmbryoIds.map((id, index) => ({
    id,
    label: id,
    sourceName: options.name,
    sourceEmbryoId: id,
    color: ['#3978c5', '#df7844', '#3f966c', '#a15ab0', '#d6a22d', '#2d9ca6'][index % 6],
  }))
  const sources = options.sources ?? [{
    id: 'source-1',
    name: options.name,
    size: options.sourceSize ?? 0,
    mapping,
    embryoIds: embryos.map((embryo) => embryo.id),
  }]

  return {
    name: options.name,
    sourceSize: options.sourceSize ?? 0,
    mapping,
    sources,
    embryos,
    temporalMode: mapping.playback === 'none' ? 'generation' : mapping.playback,
    frameValues: [...frameIndex.keys()].sort((a, b) => a - b),
    observations,
    frameIndex,
    trajectoryIndex,
    maxObservationsPerFrame: Math.max(0, ...[...frameIndex.values()].map((frame) => frame.length)),
    cells,
    cellIds: [...cells.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    parentOverrides,
    bounds,
    warnings,
  }
}
