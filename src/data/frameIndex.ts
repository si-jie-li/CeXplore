import type {
  CellSummary,
  ColumnMapping,
  CoordinateBounds,
  EmbryoDataset,
  Observation,
  RawMappedRow,
} from './types'

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
  options: { name: string; sourceSize?: number; mapping: ColumnMapping },
): EmbryoDataset {
  const { mapping } = options
  const invalid = { missingCell: 0, coordinate: 0, temporal: 0, duplicate: 0 }
  const deDuplicated = new Map<string, Omit<Observation, 'renderX' | 'renderY' | 'renderZ'>>()
  const parentOverrides = new Map<string, string>()

  for (const row of rows) {
    const cellId = String(row.cellId ?? '').trim()
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
    const key = `${temporal}\u0000${cellId}`
    if (deDuplicated.has(key)) invalid.duplicate += 1
    deDuplicated.set(key, { cellId, step: temporal, x, y, z, parentId })
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
    .sort((a, b) => a.step - b.step || a.cellId.localeCompare(b.cellId))

  const frameIndex = new Map<number, Observation[]>()
  const trajectoryIndex = new Map<string, Observation[]>()
  const cells = new Map<string, CellSummary>()
  for (const observation of observations) {
    const frame = frameIndex.get(observation.step) ?? []
    frame.push(observation)
    frameIndex.set(observation.step, frame)
    const trajectory = trajectoryIndex.get(observation.cellId) ?? []
    trajectory.push(observation)
    trajectoryIndex.set(observation.cellId, trajectory)
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

  return {
    name: options.name,
    sourceSize: options.sourceSize ?? 0,
    mapping,
    temporalMode: mapping.playback === 'none' ? 'generation' : mapping.playback,
    frameValues: [...frameIndex.keys()].sort((a, b) => a - b),
    observations,
    frameIndex,
    trajectoryIndex,
    cells,
    cellIds: [...cells.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    parentOverrides,
    bounds,
    warnings,
  }
}
