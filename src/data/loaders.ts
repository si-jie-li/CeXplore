import Papa from 'papaparse'
import type {
  ColumnMapping,
  EmbryoDataset,
  ParseProgress,
  RawMappedRow,
  SourceInspection,
} from './types'
import { buildDatasetFromRows } from './frameIndex'

const readDelimitedPreview = async (file: File): Promise<SourceInspection> => {
  const preview = await file.slice(0, 512 * 1024).text()
  const parsed = Papa.parse<Record<string, string>>(preview, {
    header: true,
    preview: 200,
    skipEmptyLines: 'greedy',
  })
  // Preserve exact header spelling because Papa uses it as the record key.
  const headers = parsed.meta.fields ?? []
  return {
    kind: 'delimited',
    name: file.name,
    headers,
    delimiter: parsed.meta.delimiter || (file.name.endsWith('.tsv') ? '\t' : ','),
    samples: parsed.data.slice(0, 50),
  }
}

const inspectWorkbook = async (file: File): Promise<SourceInspection> => {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const headersBySheet: Record<string, string[]> = {}
  let samples: Record<string, string>[] = []
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      blankrows: false,
    })
    headersBySheet[sheetName] = (rows[0] ?? []).map(String)
    if (!samples.length && rows.length > 1) {
      samples = rows.slice(1).map((row) =>
        Object.fromEntries(headersBySheet[sheetName].map((header, index) => [header, String(row[index] ?? '')])),
      )
    }
  }
  const firstSheet = workbook.SheetNames[0]
  return {
    kind: 'xlsx',
    name: file.name,
    headers: headersBySheet[firstSheet] ?? [],
    sheetNames: workbook.SheetNames,
    headersBySheet,
    samples,
  }
}

export async function inspectFile(file: File): Promise<SourceInspection> {
  if (/\.xlsx?$/i.test(file.name)) return inspectWorkbook(file)
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
    throw new Error('Choose a CSV, TSV, XLS, or XLSX file.')
  }
  return readDelimitedPreview(file)
}

function mapRecord(record: Record<string, unknown>, mapping: ColumnMapping): RawMappedRow {
  const temporalColumn = mapping.playback === 'time' ? mapping.time : mapping.frame
  return {
    cellId: String(record[mapping.cellId] ?? ''),
    embryoId: mapping.embryo ? String(record[mapping.embryo] ?? '').trim() : undefined,
    x: record[mapping.x],
    y: record[mapping.y],
    z: record[mapping.z],
    temporal: temporalColumn ? record[temporalColumn] : 0,
    parent: mapping.parent ? record[mapping.parent] : undefined,
  }
}

const selectedEmbryos = (mapping: ColumnMapping) => new Set(
  mapping.embryoValues?.length
    ? mapping.embryoValues
    : mapping.embryoValue?.trim() ? [mapping.embryoValue.trim()] : [],
)

const matchesEmbryo = (record: Record<string, unknown>, mapping: ColumnMapping, selected = selectedEmbryos(mapping)) =>
  !mapping.embryo || selected.has(String(record[mapping.embryo] ?? '').trim())

async function parseWorkbook(file: File, mapping: ColumnMapping) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = mapping.sheet || workbook.SheetNames[0]
  if (!workbook.Sheets[sheetName]) throw new Error(`Worksheet “${sheetName}” was not found.`)
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
    raw: true,
  })
  const selected = selectedEmbryos(mapping)
  return records.filter((record) => matchesEmbryo(record, mapping, selected)).map((record) => mapRecord(record, mapping))
}

function parseDelimited(
  file: File,
  mapping: ColumnMapping,
  delimiter: string | undefined,
  onProgress?: (progress: ParseProgress) => void,
): Promise<RawMappedRow[]> {
  return new Promise((resolve, reject) => {
    const retained: RawMappedRow[] = []
    const selected = selectedEmbryos(mapping)
    let processedRows = 0
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      delimiter,
      worker: true,
      skipEmptyLines: 'greedy',
      step(result) {
        processedRows += 1
        if (matchesEmbryo(result.data, mapping, selected)) retained.push(mapRecord(result.data, mapping))
        if (processedRows % 10_000 === 0) {
          onProgress?.({ processedRows, retainedRows: retained.length })
        }
      },
      complete() {
        onProgress?.({ processedRows, retainedRows: retained.length })
        resolve(retained)
      },
      error(error) {
        reject(error)
      },
    })
  })
}

async function listWorkbookEmbryos(file: File, column: string, sheet?: string) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = sheet || workbook.SheetNames[0]
  if (!workbook.Sheets[sheetName]) throw new Error(`Worksheet “${sheetName}” was not found.`)
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
    raw: true,
  })
  return [...new Set(records.map((record) => String(record[column] ?? '').trim()).filter(Boolean))]
}

function listDelimitedEmbryos(
  file: File,
  column: string,
  delimiter: string | undefined,
  onProgress?: (progress: ParseProgress) => void,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const ids = new Set<string>()
    let processedRows = 0
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      delimiter,
      worker: true,
      skipEmptyLines: 'greedy',
      step(result) {
        processedRows += 1
        const value = String(result.data[column] ?? '').trim()
        if (value) ids.add(value)
        if (processedRows % 10_000 === 0) {
          onProgress?.({ processedRows, retainedRows: ids.size })
        }
      },
      complete() {
        onProgress?.({ processedRows, retainedRows: ids.size })
        resolve([...ids])
      },
      error(error) {
        reject(error)
      },
    })
  })
}

export async function listEmbryoIds(
  file: File,
  inspection: SourceInspection,
  column: string,
  sheet?: string,
  onProgress?: (progress: ParseProgress) => void,
) {
  const ids = inspection.kind === 'xlsx'
    ? await listWorkbookEmbryos(file, column, sheet)
    : await listDelimitedEmbryos(file, column, inspection.delimiter, onProgress)
  return ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export async function loadMappedRows(
  file: File,
  inspection: SourceInspection,
  mapping: ColumnMapping,
  onProgress?: (progress: ParseProgress) => void,
) {
  return inspection.kind === 'xlsx'
    ? parseWorkbook(file, mapping)
    : parseDelimited(file, mapping, inspection.delimiter, onProgress)
}

export async function loadDataset(
  file: File,
  inspection: SourceInspection,
  mapping: ColumnMapping,
  onProgress?: (progress: ParseProgress) => void,
): Promise<EmbryoDataset> {
  const rows = await loadMappedRows(file, inspection, mapping, onProgress)
  return buildDatasetFromRows(rows, { name: file.name, sourceSize: file.size, mapping })
}
