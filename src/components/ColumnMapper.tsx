import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Check, X } from 'lucide-react'
import { suggestMapping, validateMapping } from '../data/columnMapping'
import type { ColumnMapping, SourceInspection } from '../data/types'

interface ColumnMapperProps {
  inspection: SourceInspection
  busy: boolean
  progressLabel?: string
  onCancel: () => void
  onConfirm: (mapping: ColumnMapping) => void
  onDiscoverEmbryos: (column: string, sheet: string | undefined, onProgress: (rows: number) => void) => Promise<string[]>
  fileIndex?: number
  fileCount?: number
}

function FieldSelect({
  label,
  value,
  headers,
  required,
  onChange,
}: {
  label: string
  value?: string
  headers: string[]
  required?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="mapping-field">
      <span>
        {label} {required && <em>Required</em>}
      </span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={!headers.length}>
        <option value="">Not mapped</option>
        {headers.map((header) => (
          <option key={header} value={header}>{header}</option>
        ))}
      </select>
    </label>
  )
}

export function ColumnMapper({
  inspection,
  busy,
  progressLabel,
  onCancel,
  onConfirm,
  onDiscoverEmbryos,
  fileIndex = 0,
  fileCount = 1,
}: ColumnMapperProps) {
  const [activeInspection, setActiveInspection] = useState(inspection)
  const [mapping, setMapping] = useState<ColumnMapping>(() => suggestMapping(inspection))
  const [submitted, setSubmitted] = useState(false)
  const [embryoIds, setEmbryoIds] = useState<string[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [discoveryProgress, setDiscoveryProgress] = useState('')
  const [discoveryError, setDiscoveryError] = useState('')
  const discoveryRun = useRef(0)
  const headers = activeInspection.headers
  const errors = useMemo(() => validateMapping(mapping), [mapping])
  const update = <K extends keyof ColumnMapping>(key: K, value: ColumnMapping[K]) =>
    setMapping((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    const run = ++discoveryRun.current
    if (!mapping.embryo) {
      setEmbryoIds([])
      setDiscoveryProgress('')
      setDiscoveryError('')
      return
    }
    setDiscovering(true)
    setDiscoveryError('')
    setDiscoveryProgress('Scanning embryo IDs…')
    void onDiscoverEmbryos(mapping.embryo, mapping.sheet, (rows) => {
      if (run === discoveryRun.current) setDiscoveryProgress(`${rows.toLocaleString()} rows scanned`)
    }).then((ids) => {
      if (run !== discoveryRun.current) return
      setEmbryoIds(ids)
      setMapping((current) => {
        const retained = (current.embryoValues ?? []).filter((id) => ids.includes(id))
        return { ...current, embryoValues: retained.length ? retained : ids.slice(0, 1), embryoValue: undefined }
      })
      setDiscoveryProgress(`${ids.length.toLocaleString()} embryo ID${ids.length === 1 ? '' : 's'} found`)
    }).catch((reason: unknown) => {
      if (run !== discoveryRun.current) return
      setDiscoveryError(reason instanceof Error ? reason.message : 'Could not scan embryo IDs.')
      setEmbryoIds([])
    }).finally(() => {
      if (run === discoveryRun.current) setDiscovering(false)
    })
  }, [mapping.embryo, mapping.sheet, onDiscoverEmbryos])

  const changeSheet = (sheet: string) => {
    const nextInspection = {
      ...activeInspection,
      headers: activeInspection.headersBySheet?.[sheet] ?? [],
    }
    setActiveInspection(nextInspection)
    setMapping({ ...suggestMapping(nextInspection), sheet })
  }

  const submit = () => {
    setSubmitted(true)
    if (!errors.length) onConfirm(mapping)
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal mapping-modal" role="dialog" aria-modal="true" aria-labelledby="mapping-title">
        <header className="modal-header">
          <div>
            <div className="eyebrow">Import dataset</div>
            <h2 id="mapping-title">Map your columns</h2>
            <p>{inspection.name} · {headers.length} columns detected{fileCount > 1 ? ` · file ${fileIndex + 1} of ${fileCount}` : ''}</p>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Cancel import" disabled={busy}><X size={18} /></button>
        </header>

        <div className="mapping-body">
          {inspection.sheetNames && inspection.sheetNames.length > 1 && (
            <FieldSelect label="Worksheet" value={mapping.sheet} headers={inspection.sheetNames} required onChange={changeSheet} />
          )}
          <div className="mapping-section-label">Identity & coordinates</div>
          <div className="mapping-grid">
            <FieldSelect label="Cell ID / name" value={mapping.cellId} headers={headers} required onChange={(v) => update('cellId', v)} />
            <FieldSelect label="AP coordinate" value={mapping.x} headers={headers} required onChange={(v) => update('x', v)} />
            <FieldSelect label="LR coordinate" value={mapping.y} headers={headers} required onChange={(v) => update('y', v)} />
            <FieldSelect label="VD coordinate" value={mapping.z} headers={headers} required onChange={(v) => update('z', v)} />
          </div>

          <div className="mapping-section-label">Developmental coordinate</div>
          <div className="temporal-choice" role="radiogroup" aria-label="Playback coordinate">
            {(['time', 'frame', 'none'] as const).map((choice) => (
              <button
                key={choice}
                className={mapping.playback === choice ? 'active' : ''}
                onClick={() => update('playback', choice)}
                type="button"
              >
                {mapping.playback === choice && <Check size={14} />}
                {choice === 'none' ? 'Static / canonical time' : choice[0].toUpperCase() + choice.slice(1)}
              </button>
            ))}
          </div>
          <div className="mapping-grid compact-top">
            {mapping.playback === 'time' && <FieldSelect label="Time" value={mapping.time} headers={headers} required onChange={(v) => update('time', v)} />}
            {mapping.playback === 'frame' && <FieldSelect label="Frame" value={mapping.frame} headers={headers} required onChange={(v) => update('frame', v)} />}
            <FieldSelect label="Parent cell" value={mapping.parent} headers={headers} onChange={(v) => update('parent', v)} />
          </div>

          <div className="mapping-section-label">Dataset filter</div>
          <div className="mapping-grid">
            <FieldSelect label="Embryo / sample column" value={mapping.embryo} headers={headers} onChange={(v) => update('embryo', v)} />
          </div>

          {mapping.embryo ? (
            <div className="embryo-import-picker">
              <div className="embryo-import-heading">
                <span>Embryo IDs to import <em>Required</em></span>
                <div>
                  <button type="button" onClick={() => update('embryoValues', embryoIds)} disabled={discovering || !embryoIds.length}>All</button>
                  <button type="button" onClick={() => update('embryoValues', [])} disabled={discovering || !embryoIds.length}>None</button>
                </div>
              </div>
              {discovering ? <div className="embryo-scan-state"><span className="spinner dark" /> {discoveryProgress}</div> : discoveryError ? (
                <div className="embryo-scan-error" role="alert">{discoveryError}</div>
              ) : (
                <div className="embryo-import-list">
                  {embryoIds.map((id) => {
                    const checked = mapping.embryoValues?.includes(id) ?? false
                    return (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => update(
                            'embryoValues',
                            checked
                              ? (mapping.embryoValues ?? []).filter((value) => value !== id)
                              : [...(mapping.embryoValues ?? []), id],
                          )}
                        />
                        <span>{id}</span>
                      </label>
                    )
                  })}
                  {!embryoIds.length && <span className="empty-embryo-list">No non-empty embryo IDs found.</span>}
                </div>
              )}
              {!discovering && !discoveryError && <small>{mapping.embryoValues?.length ?? 0} selected · {discoveryProgress}</small>}
            </div>
          ) : (
            <p className="mapping-note"><AlertCircle size={15} /> This file will be imported as one embryo named after the file.</p>
          )}

          <p className="mapping-note">
            <AlertCircle size={15} /> Large files are streamed; only checked embryos are retained in memory.
          </p>
          {submitted && errors.length > 0 && <div className="form-errors">{errors.map((error) => <div key={error}>{error}</div>)}</div>}
        </div>

        <footer className="modal-footer">
          <span className="progress-label">{progressLabel}</span>
          <button className="button secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="button primary" onClick={submit} disabled={busy || discovering}>
            {busy ? <span className="spinner" /> : <ArrowRight size={16} />}
            {busy ? 'Loading…' : fileIndex + 1 < fileCount ? 'Load & continue' : 'Load selected'}
          </button>
        </footer>
      </section>
    </div>
  )
}
