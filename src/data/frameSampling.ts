import type { RawMappedRow } from './types'

export const DEFAULT_FRAME_SAMPLE_COUNT = 185

const numeric = (value: unknown) => {
  const result = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(result) ? result : undefined
}

const usable = (row: RawMappedRow) => Boolean(
  String(row.cellId ?? '').trim()
  && numeric(row.temporal) !== undefined
  && numeric(row.x) !== undefined
  && numeric(row.y) !== undefined
  && numeric(row.z) !== undefined,
)

function uniformlySpacedSteps(steps: number[], count: number) {
  if (count >= steps.length) return new Set(steps)
  if (count <= 1) return new Set([steps[Math.floor((steps.length - 1) / 2)]])
  return new Set(Array.from({ length: count }, (_, index) =>
    steps[Math.round(index * (steps.length - 1) / (count - 1))],
  ))
}

export interface FrameSamplingResult {
  rows: RawMappedRow[]
  selectedSteps: number[]
  requestedCount: number
  coverageFramesAdded: number
}

/**
 * Builds a bounded shared time grid from the union of embryo times. Exact
 * frames win; when an embryo has no exact frame, its latest earlier complete
 * frame is held. Frames are added beyond the requested count only when that is
 * necessary for every valid cell ID to occur at least once.
 */
export function sampleRowsByFrame(rows: RawMappedRow[], requestedCount: number): FrameSamplingResult {
  const validRows = rows.filter(usable)
  const steps = [...new Set(validRows.map((row) => numeric(row.temporal)!))].sort((a, b) => a - b)
  const count = Math.max(1, Math.floor(requestedCount))
  if (!steps.length) return { rows: [], selectedSteps: [], requestedCount: count, coverageFramesAdded: 0 }

  const selected = uniformlySpacedSteps(steps, count)
  const allCells = new Set(validRows.map((row) => String(row.cellId).trim()))
  const represented = new Set(validRows
    .filter((row) => selected.has(numeric(row.temporal)!))
    .map((row) => String(row.cellId).trim()))
  const missing = new Set([...allCells].filter((cellId) => !represented.has(cellId)))
  const cellsByStep = new Map<number, Set<string>>()
  for (const row of validRows) {
    const step = numeric(row.temporal)!
    const cells = cellsByStep.get(step) ?? new Set<string>()
    cells.add(String(row.cellId).trim())
    cellsByStep.set(step, cells)
  }
  const initialSize = selected.size
  while (missing.size) {
    const candidate = [...cellsByStep.entries()]
      .filter(([step]) => !selected.has(step))
      .map(([step, cells]) => ({ step, coverage: [...cells].filter((cell) => missing.has(cell)) }))
      .sort((a, b) => b.coverage.length - a.coverage.length || a.step - b.step)[0]
    if (!candidate?.coverage.length) break
    selected.add(candidate.step)
    candidate.coverage.forEach((cell) => missing.delete(cell))
  }

  const selectedSteps = [...selected].sort((a, b) => a - b)
  const byEmbryo = new Map<string, Map<number, RawMappedRow[]>>()
  for (const row of validRows) {
    const embryoId = String(row.embryoId ?? '')
    const frames = byEmbryo.get(embryoId) ?? new Map<number, RawMappedRow[]>()
    const step = numeric(row.temporal)!
    const frame = frames.get(step) ?? []
    frame.push(row)
    frames.set(step, frame)
    byEmbryo.set(embryoId, frames)
  }

  const sampled: RawMappedRow[] = []
  for (const frames of byEmbryo.values()) {
    const embryoSteps = [...frames.keys()].sort((a, b) => a - b)
    let previousIndex = -1
    for (const targetStep of selectedSteps) {
      while (previousIndex + 1 < embryoSteps.length && embryoSteps[previousIndex + 1] <= targetStep) {
        previousIndex += 1
      }
      const source = frames.get(targetStep) ?? (previousIndex >= 0 ? frames.get(embryoSteps[previousIndex]) : undefined)
      if (!source) continue
      for (const row of source) sampled.push({ ...row, temporal: targetStep })
    }
  }
  return {
    rows: sampled,
    selectedSteps,
    requestedCount: count,
    coverageFramesAdded: Math.max(0, selected.size - initialSize),
  }
}
