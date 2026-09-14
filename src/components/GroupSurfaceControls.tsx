import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Layers3, X } from 'lucide-react'
import { useExplorerStore } from '../state/explorerStore'
import { useSurfaceStore } from '../surfaces/surfaceStore'
import { parseSurfaceFrames, type GroupSurfaceSettings } from '../surfaces/types'

export function GroupSurfaceControls() {
  const groups = useExplorerStore((s) => s.groups)
  const count = useExplorerStore((s) => s.dataset?.frameValues.length ?? 1)
  const state = useSurfaceStore()
  const { settings: s, setSettings: set } = state
  const [text, setText] = useState(s.specifiedFrames.join(', '))
  const [error, setError] = useState('')
  const [tip, setTip] = useState(true)
  const [open, setOpen] = useState(false)
  useEffect(() => setText(s.specifiedFrames.join(', ')), [s.specifiedFrames.join(',')])
  useEffect(() => { if (s.enabled) setTip(true) }, [s.enabled])
  const number = (label: string, key: 'previousFrames' | 'startFrame' | 'endFrame' | 'historyCount', max: number) => <label>{label}<input aria-label={label} type="number" min={1} max={max} value={s[key]} onChange={(e) => set({ [key]: Math.max(1, Math.min(max, Number(e.target.value))) })} /></label>
  return <section className={`group-surfaces-drawer ${open ? 'open' : ''}`} aria-label="Group surfaces">
    <button className="group-surfaces-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} title={open ? 'Collapse Group surfaces' : 'Open Group surfaces'}>
      <span><Layers3 size={15} /><strong>Group surfaces</strong><em>{s.enabled ? `${s.groupIds?.length ?? 0} groups · ${s.mode}` : 'Off'}</em></span>
      {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
    </button>
    {open && <div className="group-surfaces-drawer-body">
      <div className="group-surfaces-heading">
        <div><span className="panel-kicker">Spatial envelope</span><h2>Group surfaces</h2></div>
        <button onClick={() => setOpen(false)} aria-label="Close group surfaces"><X size={15} /></button>
      </div>
      <p className="group-surfaces-intro">Display each cell group as a continuous 3D envelope and follow its overall spatial change.</p>
      <div className="surface-controls-body">
      <label><input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked, groupIds: e.target.checked ? groups.filter((g) => g.visible).map((g) => g.id) : s.groupIds })} /> Show group surfaces</label>
      {s.enabled && <>
        {tip && <div className="surface-tip">For smoother interaction, pause before calculating. Playback waits for each surface.
          <button onClick={() => { useExplorerStore.getState().setPlaying(false); void state.prepareFrame?.(useExplorerStore.getState().currentFrameIndex) }}>Pause and calculate</button>
          <button aria-label="Dismiss surface suggestion" onClick={() => setTip(false)}>×</button>
        </div>}
        <div className="surface-group-options">{groups.map((g) => <label key={g.id}><input type="checkbox" checked={(s.groupIds ?? []).includes(g.id)} onChange={(e) => set({ groupIds: e.target.checked ? [...(s.groupIds ?? []), g.id] : (s.groupIds ?? []).filter((id) => id !== g.id) })} /><span style={{ color: g.color }}>●</span> {g.name}</label>)}</div>
        {!groups.length && <small>Create a cell group to show its envelope.</small>}
        <label>Shape<select value={s.method} onChange={(e) => set({ method: e.target.value as GroupSurfaceSettings['method'] })}><option value="smooth">Smooth envelope</option><option value="convex">Convex hull</option></select></label>
        <label>Smoothing ×{s.radiusScale}<input aria-label="Surface smoothing" type="number" min="0.5" max="2" step="0.1" defaultValue={s.radiusScale} key={s.radiusScale} onBlur={(e) => set({ radiusScale: Number(e.target.value) })} /></label>
        <label>Opacity {Math.round(s.opacity * 100)}%<input aria-label="Surface opacity" type="range" min="0.05" max="0.8" step="0.01" value={s.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} /></label>
        <label>Display<select value={s.mode} onChange={(e) => set({ mode: e.target.value as GroupSurfaceSettings['mode'] })}><option value="current">Current only</option><option value="history">History</option><option value="specified">Specified frames</option></select></label>
        {s.mode === 'specified' ? <>
          <label>Playback frames<input aria-label="Surface specified frames" value={text} placeholder="15, 30, 78" onChange={(e) => setText(e.target.value)} /></label>
          <button onClick={() => { try { set({ specifiedFrames: parseSurfaceFrames(text, count) }); setError('') } catch (e) { setError((e as Error).message) } }}>Apply frames</button>
          <small>1–{count}: playback order after sampling, not source timestamps. Up to 8 frames; current frame is not added.</small>
          {error && <p role="alert">{error}</p>}
        </> : <>
          <label>History / center trail range<select value={s.rangeMode} onChange={(e) => set({ rangeMode: e.target.value as GroupSurfaceSettings['rangeMode'] })}><option value="previous">Previous N frames</option><option value="all">All previous</option><option value="range">Frame range</option></select></label>
          {s.rangeMode === 'previous' && number('Previous frames (including current)', 'previousFrames', count)}
          {s.rangeMode === 'range' && <>{number('Start frame', 'startFrame', count)}{number('End frame', 'endFrame', count)}</>}
          {s.mode === 'history' && number('Maximum older snapshots', 'historyCount', 8)}
        </>}
        <label><input type="checkbox" checked={s.showCentroidTrail} onChange={(e) => set({ showCentroidTrail: e.target.checked })} /> Show group center trajectory</label>
        <small>Centers are equal-weight cell means. Hidden cells are excluded. Overlay embryos remain separate. Envelopes are estimates, not cell membranes.</small>
        {s.mode !== 'current' && <small>Older (lighter) → Newer (darker)</small>}
        {state.busy && <p role="status">Preparing surfaces…</p>}
        {state.error && <p role="alert">{state.error} <button onClick={state.retry}>Retry</button></p>}
        {state.note && <small>{state.note}</small>}
        {!!state.displayedFrames.length && <small>Displayed frames: {state.displayedFrames.join(', ')}</small>}
      </>}
      </div>
    </div>}
  </section>
}
