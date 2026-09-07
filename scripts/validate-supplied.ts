import { createReadStream } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { buildDatasetFromRows, makeEmbryoId } from '../src/data/frameIndex'
import { getFrameObservations } from '../src/data/embryoView'
import { resolveLineage } from '../src/lineage/lineageResolver'
import { createLineageLayout } from '../src/lineage/lineageTree'
import type { ColumnMapping, RawMappedRow } from '../src/data/types'
import { CELL_PALETTE } from '../src/utils/palette'

const sourceArgument = process.argv[2]
if (!sourceArgument) {
  throw new Error('Usage: npm run validate:sample -- /absolute/path/to/data.tsv [embryo_id,embryo_id]')
}
const source = resolve(sourceArgument)
const embryoIds = (process.argv[3] || 'ctr_emb1').split(',').map((value) => value.trim()).filter(Boolean)
const selectedEmbryos = new Set(embryoIds)
const rows: RawMappedRow[] = []
const lines = createInterface({ input: createReadStream(source), crlfDelay: Infinity })
let header: string[] = []
let embryoIndex = -1
let timeIndex = -1
let cellIndex = -1
let xIndex = -1
let yIndex = -1
let zIndex = -1

for await (const line of lines) {
  const fields = line.split('\t')
  if (!header.length) {
    header = fields
    embryoIndex = header.indexOf('embryo_id')
    timeIndex = header.indexOf('time')
    cellIndex = header.indexOf('cell_name')
    xIndex = header.indexOf('A_pos')
    yIndex = header.indexOf('L_pos')
    zIndex = header.indexOf('D_pos')
    continue
  }
  const sourceEmbryoId = fields[embryoIndex]
  if (!selectedEmbryos.has(sourceEmbryoId)) continue
  rows.push({
    cellId: fields[cellIndex],
    embryoId: makeEmbryoId('source-1', sourceEmbryoId),
    temporal: fields[timeIndex],
    x: fields[xIndex],
    y: fields[yIndex],
    z: fields[zIndex],
  })
}

const mapping: ColumnMapping = {
  cellId: 'cell_name',
  x: 'A_pos',
  y: 'L_pos',
  z: 'D_pos',
  time: 'time',
  playback: 'time',
  embryo: 'embryo_id',
  embryoValues: embryoIds,
}
const embryos = embryoIds.map((sourceEmbryoId, index) => ({
  id: makeEmbryoId('source-1', sourceEmbryoId),
  label: sourceEmbryoId,
  sourceName: basename(source),
  sourceEmbryoId,
  color: CELL_PALETTE[index % CELL_PALETTE.length],
}))
const dataset = buildDatasetFromRows(rows, {
  name: basename(source),
  mapping,
  embryos,
})
const lineage = resolveLineage(dataset.cells)
const lineageLayout = createLineageLayout(lineage, dataset.temporalMode)

console.log(JSON.stringify({
  embryoIds,
  retainedRows: rows.length,
  validObservations: dataset.observations.length,
  cells: dataset.cellIds.length,
  timePoints: dataset.frameValues.length,
  timeRange: [dataset.frameValues[0], dataset.frameValues.at(-1)],
  maxNucleiInFrame: Math.max(...[...dataset.frameIndex.values()].map((frame) => frame.length)),
  observationsByEmbryo: Object.fromEntries(embryos.map((embryo) => [
    embryo.label,
    dataset.observations.filter((row) => row.embryoId === embryo.id).length,
  ])),
  meanNucleiAtFinalTime: getFrameObservations(
    dataset,
    dataset.frameValues.at(-1) ?? 0,
    new Set(embryos.map((embryo) => embryo.id)),
    'mean',
  ).length,
  unresolved: lineage.unresolvedCellIds.length,
  lineageBranches: lineageLayout.nodes.length,
  lineageDivisions: lineageLayout.connectors.length,
  lineageAxis: lineageLayout.axisLabel,
  lineageRange: [lineageLayout.minValue, lineageLayout.maxValue],
  warnings: dataset.warnings,
}, null, 2))
