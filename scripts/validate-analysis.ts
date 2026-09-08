import { createReadStream } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { runGroupAnalysis } from '../src/analysis/runAnalysis'
import { summarizeByEmbryo } from '../src/analysis/resultUtils'
import type { AnalysisGroupSpec, GroupAnalysisRequest } from '../src/analysis/types'
import { buildDatasetFromRows, makeEmbryoId } from '../src/data/frameIndex'
import type { ColumnMapping, RawMappedRow } from '../src/data/types'
import { getDescendants, resolveLineage } from '../src/lineage/lineageResolver'
import { CELL_PALETTE } from '../src/utils/palette'

const sourceArgument = process.argv[2]
if (!sourceArgument) {
  throw new Error('Usage: npm run validate:analysis -- /absolute/path/to/data.tsv [embryo_id,embryo_id] [null_samples]')
}
const source = resolve(sourceArgument)
const sourceEmbryoIds = (process.argv[3] || 'ctr_emb1').split(',').map((value) => value.trim()).filter(Boolean)
const nullSamples = Math.max(1, Number(process.argv[4]) || 20)
const requestedEmbryos = new Set(sourceEmbryoIds)
const rows: RawMappedRow[] = []
const lines = createInterface({ input: createReadStream(source), crlfDelay: Infinity })
let indices: Record<string, number> | undefined

for await (const line of lines) {
  const fields = line.split('\t')
  if (!indices) {
    indices = Object.fromEntries(fields.map((field, index) => [field, index]))
    continue
  }
  const sourceEmbryoId = fields[indices.embryo_id]
  if (!requestedEmbryos.has(sourceEmbryoId)) continue
  rows.push({
    cellId: fields[indices.cell_name],
    embryoId: makeEmbryoId('source-1', sourceEmbryoId),
    temporal: fields[indices.time],
    x: fields[indices.A_pos],
    y: fields[indices.L_pos],
    z: fields[indices.D_pos],
  })
}

const mapping: ColumnMapping = {
  cellId: 'cell_name', x: 'A_pos', y: 'L_pos', z: 'D_pos', time: 'time', playback: 'time',
  embryo: 'embryo_id', embryoValues: sourceEmbryoIds,
}
const embryos = sourceEmbryoIds.map((sourceEmbryoId, index) => ({
  id: makeEmbryoId('source-1', sourceEmbryoId),
  label: sourceEmbryoId,
  sourceName: basename(source),
  sourceEmbryoId,
  color: CELL_PALETTE[index % CELL_PALETTE.length],
}))
const dataset = buildDatasetFromRows(rows, { name: basename(source), mapping, embryos })
const lineage = resolveLineage(dataset.cells)
const parentByCell = Object.fromEntries([...lineage.nodes].map(([cellId, node]) => [cellId, node.parentId]))

const validation = ['ABpl', 'MS', 'C'].map((rootCell, index) => {
  const group: AnalysisGroupSpec = {
    id: rootCell,
    name: `${rootCell} descendants`,
    color: CELL_PALETTE[index],
    cellIds: getDescendants(lineage, rootCell, true),
    source: 'lineage',
    rootCell,
  }
  const request: GroupAnalysisRequest = {
    datasetName: dataset.name,
    temporalMode: dataset.temporalMode,
    embryoIds: embryos.map((embryo) => embryo.id),
    observations: dataset.observations.map(({ cellId, embryoId, step, x, y, z }) => ({ cellId, embryoId, step, x, y, z })),
    parentByCell,
    group,
    metrics: ['purity', 'connectedness', 'compactness', 'shape'],
    k: 6,
    nullSamples,
    minimumGroupSize: 4,
    randomSeed: 1729,
  }
  const result = runGroupAnalysis(request)
  const summaries = summarizeByEmbryo(result)
  return {
    group: group.name,
    explicitCells: group.cellIds.length,
    observedFrames: result.points.filter((point) => point.groupSize > 0).length,
    eligibleFrames: result.points.filter((point) => point.eligible).length,
    maxGroupSize: Math.max(...result.points.map((point) => point.groupSize)),
    perEmbryoMedian: Object.fromEntries(summaries.map((summary) => [
      embryos.find((embryo) => embryo.id === summary.embryoId)?.label ?? summary.embryoId,
      summary.values,
    ])),
    warnings: result.warnings,
  }
})

console.log(JSON.stringify({
  source: basename(source),
  sourceEmbryoIds,
  observations: dataset.observations.length,
  timePoints: dataset.frameValues.length,
  nullSamples,
  validation,
}, null, 2))
