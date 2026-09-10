import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ChevronDown, ChevronUp, Download, Info, Play, X } from 'lucide-react'
import { startGroupAnalysis, type AnalysisJob } from '../analysis/analysisService'
import { downloadAnalysisCsv, metricInfo, metricValue, quantile, summarizeByEmbryo } from '../analysis/resultUtils'
import type { AnalysisGroupSpec, AnalysisMetric, AnalysisProgress, GroupAnalysisRequest, GroupAnalysisResult } from '../analysis/types'
import { useExplorerStore } from '../state/explorerStore'
import { AnalysisTrendChart } from './AnalysisTrendChart'

const allMetrics: AnalysisMetric[] = ['purity', 'connectedness', 'compactness', 'shape']

function formatMetric(value: number | null | undefined, metric: AnalysisMetric) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(metric === 'compactness' ? 3 : 2)
}

function targetFromSelection(): AnalysisGroupSpec | undefined {
  const state = useExplorerStore.getState()
  if (!state.selection.size) return undefined
  if (state.selectionMeta.kind === 'group' && state.selectionMeta.groupId) {
    const saved = state.groups.find((group) => group.id === state.selectionMeta.groupId)
    if (saved) return { ...saved }
  }
  const cellIds = [...state.selection]
  const colored = cellIds.map((id) => state.cellColors[id]).find(Boolean)
  return {
    id: 'current-selection',
    name: state.selectionMeta.kind === 'lineage' && state.selectionMeta.rootCell
      ? `${state.selectionMeta.rootCell} descendants`
      : cellIds.length === 1 ? cellIds[0] : `Current selection (${cellIds.length} cells)`,
    color: colored ?? '#176f67',
    cellIds,
    source: state.selectionMeta.kind,
    rootCell: state.selectionMeta.rootCell,
  }
}

function resultFingerprint(
  target: AnalysisGroupSpec | undefined,
  embryoIds: string[],
  metrics: AnalysisMetric[],
  k: number,
  nullSamples: number,
) {
  if (!target) return ''
  return JSON.stringify({
    id: target.id,
    cells: [...target.cellIds].sort(),
    source: target.source,
    root: target.rootCell,
    embryos: [...embryoIds].sort(),
    metrics: [...metrics].sort(),
    k,
    nullSamples,
  })
}

function insightSummary(result: GroupAnalysisResult) {
  const summaries = summarizeByEmbryo(result)
  const insights: string[] = []
  const favorable = (metric: AnalysisMetric, z: number) => metric === 'compactness' ? z < -1 : z > 1
  for (const metric of result.metrics) {
    const zValues = summaries.map((summary) => summary.nullZ[metric]).filter((value): value is number => value !== null && value !== undefined)
    if (!zValues.length) continue
    const consistent = zValues.filter((value) => favorable(metric, value)).length
    const fraction = consistent / zValues.length
    if (fraction >= 0.6) {
      const wording = metric === 'compactness'
        ? 'more compact than local size-matched random groups'
        : metric === 'shape'
          ? 'more anisotropic than local size-matched random groups'
          : `${metricInfo[metric].shortLabel.toLowerCase()} is higher than local size-matched random groups`
      insights.push(`${Math.round(fraction * 100)}% of embryos show a median ${wording}.`)
    }
  }
  if (summaries.length > 1) {
    const observedFrames = summaries.map((summary) => summary.framesObserved)
    insights.push(`Group observations span ${Math.min(...observedFrames)}–${Math.max(...observedFrames)} time points across ${summaries.length} embryos.`)
  }
  return insights.slice(0, 3)
}

function CurrentStepSummary({ result, currentStep }: { result: GroupAnalysisResult; currentStep: number }) {
  return (
    <div className="analysis-stat-strip">
      {result.metrics.map((metric) => {
        const values = result.points
          .filter((point) => point.step === currentStep)
          .map((point) => metricValue(point, metric)?.value)
          .filter((value): value is number => value !== null && value !== undefined)
        return (
          <div key={metric}>
            <span>{metricInfo[metric].shortLabel}</span>
            <strong>{formatMetric(quantile(values, 0.5), metric)}</strong>
            <small>{values.length ? `IQR ${formatMetric(quantile(values, .25), metric)}–${formatMetric(quantile(values, .75), metric)} · n=${values.length}` : 'no group cells now'}</small>
          </div>
        )
      })}
    </div>
  )
}

function ResultTable({
  result,
  currentStep,
  embryoLabels,
}: {
  result: GroupAnalysisResult
  currentStep: number
  embryoLabels: Record<string, string>
}) {
  const [mode, setMode] = useState<'current' | 'summary'>('current')
  const summaries = useMemo(() => summarizeByEmbryo(result), [result])
  const currentPoints = result.embryoIds.map((embryoId) =>
    result.points.find((point) => point.embryoId === embryoId && point.step === currentStep),
  )
  const valueRange = (metric: AnalysisMetric) => {
    const values = summaries.map((summary) => summary.values[metric]).filter((value): value is number => value !== null && value !== undefined)
    return { min: Math.min(...values), max: Math.max(...values) }
  }

  return (
    <section className="analysis-result-table">
      <div className="analysis-subheading">
        <div><strong>Embryo comparison</strong><span>{mode === 'current' ? `At ${result.temporalMode} ${currentStep}` : 'Median across observed time'}</span></div>
        <div className="analysis-mini-tabs">
          <button className={mode === 'current' ? 'active' : ''} onClick={() => setMode('current')}>Now</button>
          <button className={mode === 'summary' ? 'active' : ''} onClick={() => setMode('summary')}>Across time</button>
        </div>
      </div>
      <div className="analysis-table-scroll">
        <table>
          <thead><tr><th>Embryo</th><th>n</th>{result.metrics.map((metric) => <th key={metric} title={metricInfo[metric].label}>{metricInfo[metric].shortLabel}</th>)}</tr></thead>
          <tbody>
            {mode === 'current' ? currentPoints.map((point, index) => (
              <tr key={result.embryoIds[index]}>
                <td title={embryoLabels[result.embryoIds[index]]}>{embryoLabels[result.embryoIds[index]] ?? result.embryoIds[index]}</td>
                <td>{point?.groupSize ?? 0}</td>
                {result.metrics.map((metric) => <td key={metric}>{formatMetric(point ? metricValue(point, metric)?.value : null, metric)}</td>)}
              </tr>
            )) : summaries.map((summary) => (
              <tr key={summary.embryoId}>
                <td title={embryoLabels[summary.embryoId]}>{embryoLabels[summary.embryoId] ?? summary.embryoId}</td>
                <td>{summary.framesObserved}</td>
                {result.metrics.map((metric) => {
                  const value = summary.values[metric]
                  const range = valueRange(metric)
                  const rawFraction = value === null || value === undefined || range.max === range.min ? .5 : (value - range.min) / (range.max - range.min)
                  const favorableFraction = metricInfo[metric].direction === 'low' ? 1 - rawFraction : rawFraction
                  return <td key={metric} style={{ background: `rgba(23,111,103,${.04 + favorableFraction * .16})` }}>{formatMetric(value, metric)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{mode === 'current' ? 'n = group cells present now.' : 'n = time points with at least one group cell. Darker teal indicates a more favorable relative value within this embryo set.'}</p>
    </section>
  )
}

export function AnalysisPanel() {
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState('selection')
  const [metrics, setMetrics] = useState<AnalysisMetric[]>(allMetrics)
  const [k, setK] = useState(6)
  const [nullSamples, setNullSamples] = useState(100)
  const [progress, setProgress] = useState<AnalysisProgress>()
  const [result, setResult] = useState<GroupAnalysisResult>()
  const [resultKey, setResultKey] = useState('')
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const jobRef = useRef<AnalysisJob | undefined>(undefined)
  const dataset = useExplorerStore((state) => state.dataset)!
  const lineage = useExplorerStore((state) => state.lineage)!
  const groups = useExplorerStore((state) => state.groups)
  const selection = useExplorerStore((state) => state.selection)
  const selectionMeta = useExplorerStore((state) => state.selectionMeta)
  const cellColors = useExplorerStore((state) => state.cellColors)
  const activeEmbryoIds = useExplorerStore((state) => state.activeEmbryoIds)
  const currentFrameIndex = useExplorerStore((state) => state.currentFrameIndex)
  const setCurrentFrameIndex = useExplorerStore((state) => state.setCurrentFrameIndex)

  useEffect(() => () => jobRef.current?.cancel(), [])

  const currentSelection = useMemo(
    () => targetFromSelection(),
    [selection, selectionMeta, groups, cellColors],
  )
  const target = targetId === 'selection'
    ? currentSelection
    : groups.find((group) => group.id === targetId)
  const embryoIds = [...activeEmbryoIds]
  const fingerprint = resultFingerprint(target, embryoIds, metrics, k, nullSamples)
  const stale = Boolean(result && resultKey !== fingerprint)
  const currentStep = dataset.frameValues[currentFrameIndex] ?? 0
  const embryoLabels = Object.fromEntries(dataset.embryos.map((embryo) => [embryo.id, embryo.label]))

  useEffect(() => {
    if (!result || !target || result.group.id !== target.id) return
    if (result.group.name === target.name && result.group.color === target.color) return
    setResult((current) => current ? { ...current, group: { ...current.group, name: target.name, color: target.color } } : current)
  }, [result, target])

  const run = () => {
    if (!target || !metrics.length || !embryoIds.length) return
    jobRef.current?.cancel()
    setError('')
    setRunning(true)
    setProgress({ completedFrames: 0, totalFrames: 0 })
    const observations = embryoIds
      .flatMap((embryoId) => dataset.embryoIndex.get(embryoId) ?? [])
      .map(({ cellId, embryoId, step, x, y, z }) => ({ cellId, embryoId, step, x, y, z }))
    const parentByCell = Object.fromEntries(
      [...lineage.nodes].map(([cellId, node]) => [cellId, node.parentId]),
    )
    const request: GroupAnalysisRequest = {
      datasetName: dataset.name,
      temporalMode: dataset.temporalMode,
      embryoIds,
      observations,
      parentByCell,
      group: { ...target, cellIds: [...target.cellIds] },
      metrics,
      k,
      nullSamples,
      minimumGroupSize: 4,
      randomSeed: 1729,
    }
    const keyAtStart = fingerprint
    const job = startGroupAnalysis(request, setProgress)
    jobRef.current = job
    void job.promise.then((nextResult) => {
      if (jobRef.current !== job) return
      setResult(nextResult)
      setResultKey(keyAtStart)
      setRunning(false)
    }).catch((reason: unknown) => {
      if (jobRef.current !== job) return
      setRunning(false)
      setError(reason instanceof Error ? reason.message : 'Analysis failed.')
    })
  }

  const setStep = (step: number) => {
    const nearestIndex = dataset.frameValues.reduce((best, value, index) =>
      Math.abs(value - step) < Math.abs(dataset.frameValues[best] - step) ? index : best,
    0)
    setCurrentFrameIndex(nearestIndex)
  }

  const insights = result ? insightSummary(result) : []

  return (
    <section className={`analysis-drawer ${open ? 'open' : ''}`} aria-label="Cell-group spatial analysis">
      <button className="analysis-drawer-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} title={open ? 'Collapse Group analysis' : 'Open Group analysis'}>
        <span><BarChart3 size={15} /><strong>Group analysis</strong>{result && <em>{result.group.name} · {result.embryoIds.length} embryos</em>}</span>
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {open && (
        <div className="analysis-drawer-body">
          <aside className="analysis-controls">
            <div className="analysis-controls-heading"><div><span className="panel-kicker">On demand</span><h2>Spatial metrics</h2></div><button onClick={() => setOpen(false)} aria-label="Close analysis"><X size={15} /></button></div>
            <label className="analysis-field"><span>Cell group</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="selection" disabled={!currentSelection}>Current selection{currentSelection ? ` — ${currentSelection.name}` : ' (empty)'}</option>
              {groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
            </select></label>
            <div className="analysis-embryo-note"><strong>{embryoIds.length} displayed embryos</strong><span>Uses the embryo selection from the 3D viewer. Results are never pooled before measurement.</span></div>
            <fieldset className="analysis-metric-picker"><legend>Metrics to calculate</legend>{allMetrics.map((metric) => (
              <label key={metric} title={metricInfo[metric].hint}><input type="checkbox" checked={metrics.includes(metric)} onChange={() => setMetrics((current) => current.includes(metric) ? current.filter((item) => item !== metric) : [...current, metric])} /><span>{metricInfo[metric].shortLabel}</span></label>
            ))}</fieldset>
            <div className="analysis-parameter-row"><label><span>k neighbors</span><select value={k} onChange={(event) => setK(Number(event.target.value))}>{[4, 6, 8, 10].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Null samples</span><select value={nullSamples} onChange={(event) => setNullSamples(Number(event.target.value))}>{[50, 100, 250].map((value) => <option key={value}>{value}</option>)}</select></label></div>
            <button className="button primary analysis-run" disabled={!target || !metrics.length || running} onClick={run}>{running ? <><i className="spinner" /> Calculating…</> : <><Play size={13} /> Run analysis</>}</button>
            {running && <div className="analysis-progress"><i style={{ width: `${progress?.totalFrames ? progress.completedFrames / progress.totalFrames * 100 : 2}%` }} /><span>{progress?.completedFrames ?? 0}/{progress?.totalFrames || '?'} embryo-time states</span></div>}
            {result && <button className="button secondary analysis-export" onClick={() => downloadAnalysisCsv(result, embryoLabels)}><Download size={13} /> Export full CSV</button>}
            {stale && <p className="analysis-stale">Inputs changed. Existing results remain visible until you run again.</p>}
            {error && <p className="analysis-error">{error}</p>}
            <details className="analysis-method-note"><summary><Info size={12} /> What is being compared?</summary><p>A symmetric kNN graph is built separately for every embryo and time point. The null draws groups with the same size from the local spatial neighborhood. Minimum recommended group size is 4; low-n rows remain in the CSV and are flagged.</p></details>
          </aside>

          <main className="analysis-visuals">
            {!result ? <div className="analysis-empty"><BarChart3 size={28} /><strong>Select a group, embryos, and metrics</strong><p>Nothing is calculated until you press Run analysis. Results will show synchronized time trends and cross-embryo comparisons.</p></div> : <>
              <div className="analysis-result-heading"><div><span className="panel-kicker">Cohort view · {result.temporalMode} {currentStep}</span><h2>{result.group.name}</h2></div><span>{result.points.filter((point) => point.groupSize > 0).length.toLocaleString()} observed embryo-time states</span></div>
              <CurrentStepSummary result={result} currentStep={currentStep} />
              <div className="analysis-chart-grid">{result.metrics.map((metric) => <AnalysisTrendChart key={metric} result={result} metric={metric} currentStep={currentStep} onStepChange={setStep} />)}</div>
              {insights.length > 0 && <div className="analysis-insights"><strong>Descriptive readout</strong>{insights.map((insight) => <span key={insight}>{insight}</span>)}</div>}
              {result.warnings.length > 0 && <div className="analysis-warnings">{result.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
            </>}
          </main>
          {result ? <ResultTable result={result} currentStep={currentStep} embryoLabels={embryoLabels} /> : <div className="analysis-table-placeholder"><strong>Table output</strong><span>One row per embryo and time point will be available here and in CSV.</span></div>}
        </div>
      )}
    </section>
  )
}
