import { createReadStream } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { buildDatasetFromRows } from '../src/data/frameIndex'
import { resolveLineage } from '../src/lineage/lineageResolver'
import type { ColumnMapping, RawMappedRow } from '../src/data/types'

const sourceArgument = process.argv[2]
if (!sourceArgument) {
  throw new Error('Usage: npm run validate:sample -- /absolute/path/to/data.tsv [embryo_id]')
}
const source = resolve(sourceArgument)
const embryoId = process.argv[3] || 'ctr_emb1'
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
  if (fields[embryoIndex] !== embryoId) continue
  rows.push({
    cellId: fields[cellIndex],
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
  embryoValue: embryoId,
}
const dataset = buildDatasetFromRows(rows, {
  name: basename(source),
  mapping,
})
const lineage = resolveLineage(dataset.cells)

console.log(JSON.stringify({
  embryoId,
  retainedRows: rows.length,
  validObservations: dataset.observations.length,
  cells: dataset.cellIds.length,
  timePoints: dataset.frameValues.length,
  timeRange: [dataset.frameValues[0], dataset.frameValues.at(-1)],
  maxNucleiInFrame: Math.max(...[...dataset.frameIndex.values()].map((frame) => frame.length)),
  unresolved: lineage.unresolvedCellIds.length,
  warnings: dataset.warnings,
}, null, 2))
