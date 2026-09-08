import type { SelectionKind } from '../state/explorerStore'

export type AnalysisMetric = 'purity' | 'connectedness' | 'compactness' | 'shape'

export interface AnalysisObservation {
  cellId: string
  embryoId: string
  step: number
  x: number
  y: number
  z: number
}

export interface AnalysisGroupSpec {
  id: string
  name: string
  color: string
  cellIds: string[]
  source: SelectionKind
  rootCell?: string
}

export interface MetricValue {
  value: number | null
  nullMean: number | null
  nullSd: number | null
  zScore: number | null
  percentile: number | null
}

export interface ShapeValue extends MetricValue {
  eigenvalues: [number, number, number] | null
}

export interface AnalysisPoint {
  embryoId: string
  step: number
  groupSize: number
  totalCells: number
  eligible: boolean
  purity?: MetricValue
  connectedness?: MetricValue
  compactness?: MetricValue
  shape?: ShapeValue
}

export interface GroupAnalysisRequest {
  datasetName: string
  temporalMode: 'time' | 'frame' | 'generation'
  embryoIds: string[]
  observations: AnalysisObservation[]
  parentByCell: Record<string, string | undefined>
  group: AnalysisGroupSpec
  metrics: AnalysisMetric[]
  k: number
  nullSamples: number
  minimumGroupSize: number
  randomSeed: number
}

export interface GroupAnalysisResult {
  datasetName: string
  temporalMode: GroupAnalysisRequest['temporalMode']
  embryoIds: string[]
  group: AnalysisGroupSpec
  metrics: AnalysisMetric[]
  k: number
  nullSamples: number
  minimumGroupSize: number
  points: AnalysisPoint[]
  warnings: string[]
}

export interface AnalysisProgress {
  completedFrames: number
  totalFrames: number
}

export interface AnalysisWorkerRequest {
  id: number
  request: GroupAnalysisRequest
}

export type AnalysisWorkerResponse =
  | { id: number; type: 'progress'; progress: AnalysisProgress }
  | { id: number; type: 'result'; result: GroupAnalysisResult }
  | { id: number; type: 'error'; message: string }
