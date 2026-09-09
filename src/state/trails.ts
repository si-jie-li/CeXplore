import { Color } from 'three'

export type TrailGroupSelection = 'all' | string[]
export type TrailRangeMode = 'all' | 'custom'

export interface TrailStepRange {
  start: number
  end: number
}

export const TRAIL_OLD_OPACITY = 0.04
export const TRAIL_NEW_OPACITY = 1
const TRAIL_OPACITY_EXPONENT = 1.45
const TRAIL_OLD_LIGHTNESS = 0.9
const TRAIL_MAX_NEW_LIGHTNESS = 0.48

interface TrailGroupLike {
  id: string
  cellIds: string[]
}

export function resolveTrailStepRange(
  frameValues: number[],
  currentStep: number,
  mode: TrailRangeMode,
  requestedStart?: number,
  requestedEnd?: number,
): TrailStepRange | undefined {
  if (!frameValues.length || !Number.isFinite(currentStep)) return undefined
  if (mode === 'all') return { start: frameValues[0], end: currentStep }

  const fallbackStart = frameValues[0]
  const fallbackEnd = frameValues.at(-1) ?? currentStep
  const start = Number.isFinite(requestedStart) ? requestedStart! : fallbackStart
  const end = Number.isFinite(requestedEnd) ? requestedEnd! : fallbackEnd
  const lower = Math.min(start, end)
  const upper = Math.min(Math.max(start, end), currentStep)
  const visibleValues = frameValues.filter((value) => value >= lower && value <= upper)
  if (!visibleValues.length) return undefined
  return { start: visibleValues[0], end: visibleValues.at(-1)! }
}

export function resolveTrailGroups<T extends TrailGroupLike>(
  groups: T[],
  selection: TrailGroupSelection,
) {
  if (selection === 'all') return groups
  const selectedIds = new Set(selection)
  return groups.filter((group) => selectedIds.has(group.id))
}

export function resolveTrailCellIds<T extends TrailGroupLike>(
  groups: T[],
  groupSelection: TrailGroupSelection,
  fallbackSelection: Iterable<string>,
) {
  if (!groups.length) return new Set(fallbackSelection)
  return new Set(resolveTrailGroups(groups, groupSelection).flatMap((group) => group.cellIds))
}

export function trailOpacityAtStep(step: number, earliestStep: number, currentStep: number) {
  const progress = trailProgressAtStep(step, earliestStep, currentStep)
  return TRAIL_OLD_OPACITY
    + Math.pow(progress, TRAIL_OPACITY_EXPONENT) * (TRAIL_NEW_OPACITY - TRAIL_OLD_OPACITY)
}

export function trailProgressAtStep(step: number, earliestStep: number, currentStep: number) {
  const duration = currentStep - earliestStep
  if (!Number.isFinite(duration) || duration <= Number.EPSILON) return 1
  return Math.max(0, Math.min(1, (step - earliestStep) / duration))
}

/**
 * Encodes time with three simultaneous visual cues. Old vertices are faint,
 * pale, and desaturated; recent vertices approach a darker, more saturated
 * version of the group color. Keeping this as vertex data lets the GPU
 * interpolate the gradient without adding one render object per segment.
 */
export function trailVertexColor(
  color: string,
  step: number,
  earliestStep: number,
  currentStep: number,
): [number, number, number, number] {
  const progress = trailProgressAtStep(step, earliestStep, currentStep)
  const result = new Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  result.getHSL(hsl)

  const oldSaturation = hsl.s * 0.12
  const newSaturation = Math.min(1, hsl.s * 1.25 + 0.08)
  const newLightness = Math.max(0.18, Math.min(TRAIL_MAX_NEW_LIGHTNESS, hsl.l * 0.82))
  const saturation = oldSaturation + progress * (newSaturation - oldSaturation)
  const lightness = TRAIL_OLD_LIGHTNESS + progress * (newLightness - TRAIL_OLD_LIGHTNESS)
  result.setHSL(hsl.h, saturation, lightness)

  return [result.r, result.g, result.b, trailOpacityAtStep(step, earliestStep, currentStep)]
}
