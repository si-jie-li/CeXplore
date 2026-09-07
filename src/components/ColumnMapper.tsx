import { useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, Check, X } from 'lucide-react'
import { suggestMapping, validateMapping } from '../data/columnMapping'
import type { ColumnMapping, SourceInspection } from '../data/types'

interface ColumnMapperProps {
  inspection: SourceInspection
  busy: boolean
  progressLabel?: string
  onCancel: () => void
  onConfirm: (mapping: ColumnMapping) => void
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

export function ColumnMapper({ inspection, busy, progressLabel, onCancel, onConfirm }: ColumnMapperProps) {
  const [activeInspection, setActiveInspection] = useState(inspection)
  const [mapping, setMapping] = useState<ColumnMapping>(() => suggestMapping(inspection))
  const [submitted, setSubmitted] = useState(false)
  const headers = activeInspection.headers
  const errors = useMemo(() => validateMapping(mapping), [mapping])
  const sampleEmbryos = useMemo(() => {
    if (!mapping.embryo) return []
    return [...new Set(activeInspection.samples.map((row) => row[mapping.embryo!]).filter(Boolean))]
  }, [activeInspection.samples, mapping.embryo])
  const update = <K extends keyof ColumnMapping>(key: K, value: ColumnMapping[K]) =>
    setMapping((current) => ({ ...current, [key]: value }))

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
            <p>{inspection.name} · {headers.length} columns detected</p>
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
            <FieldSelect label="X coordinate" value={mapping.x} headers={headers} required onChange={(v) => update('x', v)} />
            <FieldSelect label="Y coordinate" value={mapping.y} headers={headers} required onChange={(v) => update('y', v)} />
            <FieldSelect label="Z coordinate" value={mapping.z} headers={headers} required onChange={(v) => update('z', v)} />
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
                {choice === 'none' ? 'Static / generation' : choice[0].toUpperCase() + choice.slice(1)}
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
            {mapping.embryo && (
              <label className="mapping-field">
                <span>Embryo ID <em>Required</em></span>
                <input
                  value={mapping.embryoValue ?? ''}
                  list="embryo-suggestions"
                  onChange={(event) => update('embryoValue', event.target.value)}
                  placeholder="Exact value to load"
                />
                <datalist id="embryo-suggestions">
                  {sampleEmbryos.map((value) => <option key={value} value={value} />)}
                </datalist>
              </label>
            )}
          </div>

          <p className="mapping-note">
            <AlertCircle size={15} /> Large multi-embryo files are streamed; only the matching embryo is retained in memory.
          </p>
          {submitted && errors.length > 0 && <div className="form-errors">{errors.map((error) => <div key={error}>{error}</div>)}</div>}
        </div>

        <footer className="modal-footer">
          <span className="progress-label">{progressLabel}</span>
          <button className="button secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="button primary" onClick={submit} disabled={busy}>
            {busy ? <span className="spinner" /> : <ArrowRight size={16} />}
            {busy ? 'Loading…' : 'Load embryo'}
          </button>
        </footer>
      </section>
    </div>
  )
}
