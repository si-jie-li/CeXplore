import { useCallback, useRef, useState } from 'react'
import { Database, FileUp } from 'lucide-react'
import { buildDatasetFromRows, makeEmbryoId } from '../data/frameIndex'
import { inspectFile, listEmbryoIds, loadMappedRows } from '../data/loaders'
import type {
  ColumnMapping,
  DatasetSource,
  EmbryoDescriptor,
  RawMappedRow,
  SourceInspection,
} from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { CELL_PALETTE } from '../utils/palette'
import { ColumnMapper } from './ColumnMapper'

interface FileLoaderProps {
  compact?: boolean
}

const fileEmbryoName = (file: File) => file.name.replace(/\.[^.]+$/, '') || file.name

export function FileLoader({ compact = false }: FileLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const accumulatedRows = useRef<RawMappedRow[]>([])
  const accumulatedSources = useRef<DatasetSource[]>([])
  const accumulatedEmbryos = useRef<EmbryoDescriptor[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [fileIndex, setFileIndex] = useState(0)
  const [inspection, setInspection] = useState<SourceInspection>()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const setDataset = useExplorerStore((state) => state.setDataset)
  const file = files[fileIndex]

  const resetImport = () => {
    setFiles([])
    setFileIndex(0)
    setInspection(undefined)
    setProgress('')
    accumulatedRows.current = []
    accumulatedSources.current = []
    accumulatedEmbryos.current = []
  }

  const inspectAt = async (nextFiles: File[], index: number) => {
    const nextInspection = await inspectFile(nextFiles[index])
    setFiles(nextFiles)
    setFileIndex(index)
    setInspection(nextInspection)
  }

  const prepare = async (nextFiles: File[]) => {
    if (!nextFiles.length) return
    setError('')
    setBusy(true)
    accumulatedRows.current = []
    accumulatedSources.current = []
    accumulatedEmbryos.current = []
    try {
      await inspectAt(nextFiles, 0)
    } catch (reason) {
      resetImport()
      setError(reason instanceof Error ? reason.message : 'Could not inspect these files.')
    } finally {
      setBusy(false)
    }
  }

  const loadDemo = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/examples/synthetic_lineage.csv')
      if (!response.ok) throw new Error('The bundled example could not be loaded.')
      const blob = await response.blob()
      await prepare([new File([blob], 'synthetic_lineage.csv', { type: 'text/csv' })])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the example.')
      setBusy(false)
    }
  }

  const discoverEmbryos = useCallback(async (
    column: string,
    sheet: string | undefined,
    onProgress: (rows: number) => void,
  ) => {
    if (!file || !inspection) return []
    return listEmbryoIds(file, inspection, column, sheet, ({ processedRows }) => onProgress(processedRows))
  }, [file, inspection])

  const confirm = async (mapping: ColumnMapping) => {
    if (!file || !inspection) return
    setBusy(true)
    setError('')
    setProgress(`Reading ${file.name}…`)
    try {
      const firstPlayback = accumulatedSources.current[0]?.mapping.playback
      if (firstPlayback && firstPlayback !== mapping.playback) {
        throw new Error('All files in one import must use the same playback mode: Time, Frame, or Static.')
      }
      const rows = await loadMappedRows(file, inspection, mapping, ({ processedRows, retainedRows }) => {
        setProgress(`${fileIndex + 1}/${files.length} · ${processedRows.toLocaleString()} rows scanned · ${retainedRows.toLocaleString()} retained`)
      })
      const sourceId = `source-${fileIndex + 1}`
      const sourceEmbryoIds = mapping.embryo
        ? (mapping.embryoValues?.length ? mapping.embryoValues : mapping.embryoValue ? [mapping.embryoValue] : [])
        : [fileEmbryoName(file)]
      const descriptors = sourceEmbryoIds.map((sourceEmbryoId, index) => ({
        id: makeEmbryoId(sourceId, sourceEmbryoId),
        label: sourceEmbryoId,
        sourceName: file.name,
        sourceEmbryoId,
        color: CELL_PALETTE[(accumulatedEmbryos.current.length + index) % CELL_PALETTE.length],
      }))
      const idsBySourceValue = new Map(descriptors.map((descriptor) => [descriptor.sourceEmbryoId, descriptor.id]))
      const defaultSourceEmbryoId = sourceEmbryoIds[0]
      accumulatedRows.current.push(...rows.map((row) => ({
        ...row,
        embryoId: idsBySourceValue.get(row.embryoId || defaultSourceEmbryoId),
      })))
      accumulatedEmbryos.current.push(...descriptors)
      accumulatedSources.current.push({
        id: sourceId,
        name: file.name,
        size: file.size,
        mapping,
        embryoIds: descriptors.map((descriptor) => descriptor.id),
      })

      const nextIndex = fileIndex + 1
      if (nextIndex < files.length) {
        setProgress(`Inspecting ${files[nextIndex].name}…`)
        try {
          await inspectAt(files, nextIndex)
        } catch (reason) {
          // The current file has already been accumulated. Reset the whole import
          // so retrying cannot append it a second time.
          resetImport()
          throw reason
        }
        setProgress('')
        return
      }

      const sources = accumulatedSources.current
      const embryos = accumulatedEmbryos.current
      const dataset = buildDatasetFromRows(accumulatedRows.current, {
        name: files.length === 1 ? file.name : `${files.length} files`,
        sourceSize: files.reduce((sum, item) => sum + item.size, 0),
        mapping: sources[0].mapping,
        sources,
        embryos,
      })
      if (!dataset.observations.length) throw new Error(dataset.warnings.at(-1) ?? 'No valid observations were found.')
      setDataset(dataset, resolveLineage(dataset.cells, dataset.parentOverrides))
      resetImport()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The dataset could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        accept=".csv,.tsv,.txt,.xls,.xlsx"
        onChange={(event) => {
          const nextFiles = [...(event.target.files ?? [])]
          if (nextFiles.length) void prepare(nextFiles)
          event.target.value = ''
        }}
      />
      {compact ? (
        <button className="button secondary compact" onClick={() => inputRef.current?.click()} disabled={busy}>
          <FileUp size={15} /> Open datasets
        </button>
      ) : (
        <div className="loader-actions">
          <button className="button primary large" onClick={() => inputRef.current?.click()} disabled={busy}>
            <FileUp size={18} /> Choose dataset files
          </button>
          <button className="button quiet large" onClick={() => void loadDemo()} disabled={busy}>
            <Database size={18} /> Explore example
          </button>
        </div>
      )}
      {error && <div className={compact ? 'header-error' : 'loader-error'} role="alert">{error}</div>}
      {inspection && file && (
        <ColumnMapper
          key={`${file.name}-${fileIndex}`}
          inspection={inspection}
          busy={busy}
          progressLabel={progress}
          fileIndex={fileIndex}
          fileCount={files.length}
          onDiscoverEmbryos={discoverEmbryos}
          onCancel={() => { resetImport(); setError('') }}
          onConfirm={(mapping) => void confirm(mapping)}
        />
      )}
    </>
  )
}
