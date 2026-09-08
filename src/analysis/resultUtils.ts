import type { AnalysisMetric, AnalysisPoint, GroupAnalysisResult, MetricValue } from './types'

export const metricInfo: Record<AnalysisMetric, { label: string; shortLabel: string; hint: string; direction: 'high' | 'low' }> = {
  purity: {
    label: 'Neighborhood purity',
    shortLabel: 'Purity',
    hint: 'Fraction of group-incident kNN edge ends that stay within the group.',
    direction: 'high',
  },
  connectedness: {
    label: 'Largest connected component',
    shortLabel: 'LCC',
    hint: 'Fraction of group cells in the largest connected kNN component.',
    direction: 'high',
  },
  compactness: {
    label: 'Normalized radius of gyration',
    shortLabel: 'Normalized Rg',
    hint: 'Group spatial spread divided by the embryo AP span; lower is more compact.',
    direction: 'low',
  },
  shape: {
    label: 'Shape anisotropy',
    shortLabel: 'Anisotropy',
    hint: 'Covariance-axis anisotropy from 0 (isotropic) to 1 (elongated/flat).',
    direction: 'high',
  },
}

export function metricValue(point: AnalysisPoint, metric: AnalysisMetric): MetricValue | undefined {
  return point[metric]
}

export function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function quantile(values: number[], q: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] * (upper - position) + sorted[upper] * (position - lower)
}

export interface EmbryoMetricSummary {
  embryoId: string
  framesObserved: number
  values: Partial<Record<AnalysisMetric, number | null>>
  nullZ: Partial<Record<AnalysisMetric, number | null>>
}

export function summarizeByEmbryo(result: GroupAnalysisResult): EmbryoMetricSummary[] {
  return result.embryoIds.map((embryoId) => {
    const points = result.points.filter((point) => point.embryoId === embryoId && point.groupSize > 0)
    const values: EmbryoMetricSummary['values'] = {}
    const nullZ: EmbryoMetricSummary['nullZ'] = {}
    for (const metric of result.metrics) {
      values[metric] = median(points.map((point) => metricValue(point, metric)?.value).filter((value): value is number => value !== null && value !== undefined))
      nullZ[metric] = median(points.map((point) => metricValue(point, metric)?.zScore).filter((value): value is number => value !== null && value !== undefined))
    }
    return { embryoId, framesObserved: points.length, values, nullZ }
  })
}

function escapeCsv(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function analysisResultToCsv(result: GroupAnalysisResult, embryoLabels: Record<string, string> = {}) {
  const metricColumns = result.metrics.flatMap((metric) => [
    `${metric}_value`, `${metric}_null_mean`, `${metric}_null_sd`, `${metric}_z_score`, `${metric}_percentile`,
  ])
  const headers = [
    'dataset', 'group', 'group_source', 'group_root', 'embryo_id', 'embryo_label',
    result.temporalMode, 'group_size', 'total_cells', 'minimum_n_pass', 'k', 'null_samples',
    ...metricColumns,
    ...(result.metrics.includes('shape') ? ['shape_lambda_1', 'shape_lambda_2', 'shape_lambda_3'] : []),
  ]
  const rows = result.points.map((point) => {
    const base: Array<string | number | boolean | null | undefined> = [
      result.datasetName, result.group.name, result.group.source, result.group.rootCell,
      point.embryoId, embryoLabels[point.embryoId], point.step, point.groupSize, point.totalCells,
      point.eligible, result.k, result.nullSamples,
    ]
    for (const metric of result.metrics) {
      const value = metricValue(point, metric)
      base.push(value?.value, value?.nullMean, value?.nullSd, value?.zScore, value?.percentile)
    }
    if (result.metrics.includes('shape')) base.push(...(point.shape?.eigenvalues ?? [null, null, null]))
    return base.map(escapeCsv).join(',')
  })
  return [headers.map(escapeCsv).join(','), ...rows].join('\n')
}

export function downloadAnalysisCsv(result: GroupAnalysisResult, embryoLabels: Record<string, string> = {}) {
  const csv = analysisResultToCsv(result, embryoLabels)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeGroup = result.group.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'group'
  link.href = url
  link.download = `${safeGroup}-spatial-metrics.csv`
  link.click()
  URL.revokeObjectURL(url)
}
