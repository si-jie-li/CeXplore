export type TemporalMode = 'time' | 'frame' | 'generation'

export interface ColumnMapping {
  cellId: string
  x: string
  y: string
  z: string
  time?: string
  frame?: string
  playback: 'time' | 'frame' | 'none'
  parent?: string
  embryo?: string
  embryoValues?: string[]
  /** Kept for importing sessions made by v0.1. */
  embryoValue?: string
  sheet?: string
}

export interface SourceInspection {
  kind: 'delimited' | 'xlsx'
  name: string
  headers: string[]
  delimiter?: string
  sheetNames?: string[]
  headersBySheet?: Record<string, string[]>
  samples: Record<string, string>[]
}

export interface RawMappedRow {
  cellId: string
  embryoId?: string
  x: unknown
  y: unknown
  z: unknown
  temporal?: unknown
  parent?: unknown
}

export interface Observation {
  cellId: string
  embryoId: string
  step: number
  x: number
  y: number
  z: number
  renderX: number
  renderY: number
  renderZ: number
  parentId?: string
  contributingEmbryoIds?: string[]
}

export interface EmbryoDescriptor {
  id: string
  label: string
  sourceName: string
  sourceEmbryoId: string
  color: string
}

export interface DatasetSource {
  id: string
  name: string
  size: number
  mapping: ColumnMapping
  embryoIds: string[]
}

export interface CellSummary {
  id: string
  firstStep: number
  lastStep: number
  observationCount: number
}

export interface CoordinateBounds {
  min: [number, number, number]
  max: [number, number, number]
  center: [number, number, number]
  span: [number, number, number]
  scale: number
}

export interface EmbryoDataset {
  name: string
  sourceSize: number
  mapping: ColumnMapping
  sources: DatasetSource[]
  embryos: EmbryoDescriptor[]
  temporalMode: TemporalMode
  frameValues: number[]
  observations: Observation[]
  frameIndex: Map<number, Observation[]>
  embryoIndex: Map<string, Observation[]>
  trajectoryIndex: Map<string, Observation[]>
  maxObservationsPerFrame: number
  cells: Map<string, CellSummary>
  cellIds: string[]
  parentOverrides: Map<string, string>
  bounds: CoordinateBounds
  warnings: string[]
}

export interface ParseProgress {
  processedRows: number
  retainedRows: number
}
