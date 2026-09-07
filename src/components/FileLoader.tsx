import { useRef, useState } from 'react'
import { Database, FileUp } from 'lucide-react'
import { inspectFile, loadDataset } from '../data/loaders'
import type { ColumnMapping, SourceInspection } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { ColumnMapper } from './ColumnMapper'

interface FileLoaderProps {
  compact?: boolean
}

export function FileLoader({ compact = false }: FileLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [inspection, setInspection] = useState<SourceInspection>()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const setDataset = useExplorerStore((state) => state.setDataset)

  const prepare = async (nextFile: File) => {
    setError('')
    setBusy(true)
    try {
      const nextInspection = await inspectFile(nextFile)
      setFile(nextFile)
      setInspection(nextInspection)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not inspect this file.')
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
      await prepare(new File([blob], 'synthetic_lineage.csv', { type: 'text/csv' }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the example.')
      setBusy(false)
    }
  }

  const confirm = async (mapping: ColumnMapping) => {
    if (!file || !inspection) return
    setBusy(true)
    setError('')
    setProgress('Starting parser…')
    try {
      const dataset = await loadDataset(file, inspection, mapping, ({ processedRows, retainedRows }) => {
        setProgress(`${processedRows.toLocaleString()} rows scanned · ${retainedRows.toLocaleString()} retained`)
      })
      if (!dataset.observations.length) throw new Error(dataset.warnings.at(-1) ?? 'No valid observations were found.')
      setDataset(dataset, resolveLineage(dataset.cells, dataset.parentOverrides))
      setInspection(undefined)
      setFile(undefined)
      setProgress('')
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
        accept=".csv,.tsv,.txt,.xls,.xlsx"
        onChange={(event) => {
          const nextFile = event.target.files?.[0]
          if (nextFile) void prepare(nextFile)
          event.target.value = ''
        }}
      />
      {compact ? (
        <button className="button secondary compact" onClick={() => inputRef.current?.click()} disabled={busy}>
          <FileUp size={15} /> Open dataset
        </button>
      ) : (
        <div className="loader-actions">
          <button className="button primary large" onClick={() => inputRef.current?.click()} disabled={busy}>
            <FileUp size={18} /> Choose CSV, TSV, or XLSX
          </button>
          <button className="button quiet large" onClick={() => void loadDemo()} disabled={busy}>
            <Database size={18} /> Explore example
          </button>
        </div>
      )}
      {error && <div className={compact ? 'header-error' : 'loader-error'} role="alert">{error}</div>}
      {inspection && (
        <ColumnMapper
          inspection={inspection}
          busy={busy}
          progressLabel={progress}
          onCancel={() => { setInspection(undefined); setFile(undefined); setError('') }}
          onConfirm={(mapping) => void confirm(mapping)}
        />
      )}
    </>
  )
}
