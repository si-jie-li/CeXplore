import { useMemo, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, X } from 'lucide-react'
import { getFrameObservations } from '../data/embryoView'
import { useExplorerStore } from '../state/explorerStore'
import { calculateGroupProjectedDisplacement, projectionElapsedValue, type ProjectionAxis } from '../state/trailProjection'
import { resolveTrailStepRange } from '../state/trails'

const AXES: Array<{ axis: ProjectionAxis; dash?: string; styleName: string }> = [
  { axis: 'AP', styleName: 'solid' },
  { axis: 'LR', dash: '1 6', styleName: 'dotted' },
  { axis: 'VD', dash: '14 7', styleName: 'long dash' },
]

export function TrailProjectionPanel() {
  const [open, setOpen] = useState(false)
  const [visibleAxes, setVisibleAxes] = useState<Set<ProjectionAxis>>(new Set(['AP', 'LR', 'VD']))
  const [groupSelection, setGroupSelection] = useState<'all' | string[]>('all')
  const dataset = useExplorerStore((state) => state.dataset)!
  const currentFrameIndex = useExplorerStore((state) => state.currentFrameIndex)
  const groups = useExplorerStore((state) => state.groups)
  const activeEmbryoIds = useExplorerStore((state) => state.activeEmbryoIds)
  const settings = useExplorerStore((state) => state.settings)
  const meanCache = useExplorerStore((state) => state.meanPositionCache)
  const currentStep = dataset.frameValues[currentFrameIndex] ?? dataset.frameValues[0]
  const range = resolveTrailStepRange(
    dataset.frameValues, currentStep, settings.trailRangeMode,
    settings.trailRangeStart, settings.trailRangeEnd, settings.trailPreviousFrames,
  )
  const selectedGroups = useMemo(() => groupSelection === 'all'
    ? groups
    : groups.filter((group) => groupSelection.includes(group.id)), [groupSelection, groups])
  const frames = useMemo(() => range
    ? dataset.frameValues
        .filter((step) => step >= range.start && step <= range.end)
        .map((step) => ({
          step,
          observations: getFrameObservations(
            dataset, step, activeEmbryoIds, settings.embryoViewMode, meanCache,
          ),
        }))
    : [], [activeEmbryoIds, dataset, meanCache, range?.end, range?.start, settings.embryoViewMode])
  const series = useMemo(() => selectedGroups.map((group) => ({
    group,
    points: calculateGroupProjectedDisplacement(frames, group.cellIds, range?.start),
  })), [frames, range?.start, selectedGroups])
  const selectedAxes = AXES.filter(({ axis }) => visibleAxes.has(axis))
  const xUnit = projectionElapsedValue(0, 0, dataset.temporalMode, dataset.mapping.frameIntervalSeconds).unit
  const maxX = Math.max(...series.flatMap(({ points }) => points.map((point) => projectionElapsedValue(
    point.step, range?.start ?? point.step, dataset.temporalMode, dataset.mapping.frameIntervalSeconds,
  ).value)), 1)
  const maxY = Math.max(...series.flatMap(({ points }) => points.flatMap(
    (point) => selectedAxes.map(({ axis }) => point[axis]),
  )), 1)
  const left = 48
  const top = 17
  const width = 720
  const height = 250
  const pathFor = (points: typeof series[number]['points'], axis: ProjectionAxis) => points.map((point, index) => {
    const elapsed = projectionElapsedValue(
      point.step, range?.start ?? point.step, dataset.temporalMode, dataset.mapping.frameIntervalSeconds,
    ).value
    const x = left + elapsed / maxX * width
    const y = top + height - point[axis] / maxY * height
    return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
  const toggleGroup = (groupId: string) => {
    const ids = groupSelection === 'all' ? groups.map((group) => group.id) : groupSelection
    setGroupSelection(ids.includes(groupId) ? ids.filter((id) => id !== groupId) : [...ids, groupId])
  }

  return (
    <section className={`trail-projection-drawer ${open ? 'open' : ''}`} aria-label="Projected group motion">
      <button className="trail-projection-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} title={open ? 'Collapse Projected motion' : 'Open Projected motion'}>
        <span><Activity size={15} /><strong>Projected motion</strong><em>Group centroid displacement · {xUnit}</em></span>
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {open && (
        <div className="trail-projection-body">
          <aside className="trail-projection-controls">
            <div className="trail-projection-controls-heading">
              <div><span className="panel-kicker">Trails</span><h2>Projected motion</h2></div>
              <button onClick={() => setOpen(false)} aria-label="Close projected motion"><X size={15} /></button>
            </div>
            <p>Each curve follows the mean position of all currently observed cells in one group.</p>
            <fieldset>
              <legend>Groups</legend>
              <div className="projection-picker-actions">
                <button onClick={() => setGroupSelection('all')}>All</button>
                <button onClick={() => setGroupSelection([])}>None</button>
              </div>
              {groups.map((group) => (
                <label key={group.id}>
                  <input type="checkbox" checked={groupSelection === 'all' || groupSelection.includes(group.id)} onChange={() => toggleGroup(group.id)} />
                  <i style={{ background: group.color }} />
                  <span>{group.name}</span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Axes and line styles</legend>
              {AXES.map(({ axis, dash, styleName }) => (
                <label key={axis}>
                  <input type="checkbox" checked={visibleAxes.has(axis)} onChange={() => setVisibleAxes((current) => {
                    const next = new Set(current)
                    if (next.has(axis)) next.delete(axis)
                    else next.add(axis)
                    return next
                  })} />
                  <svg viewBox="0 0 34 8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" /></svg>
                  <span>{axis} · {styleName}</span>
                </label>
              ))}
            </fieldset>
            <small>Uses the current Trails range and displayed embryos. x=0 is the range start; displacement is in source pixels.</small>
          </aside>
          <main className="trail-projection-chart-wrap">
            <div className="trail-projection-chart-heading">
              <div><span className="panel-kicker">Group mean position</span><h2>Axis-projected displacement</h2></div>
              <span>{selectedGroups.length}/{groups.length} groups · {selectedAxes.length}/3 axes</span>
            </div>
            {series.some(({ points }) => points.length > 1) && selectedAxes.length ? (
              <svg className="trail-projection-chart" viewBox="0 0 790 295" role="img" aria-label="Projected group motion chart">
                {[0, .25, .5, .75, 1].map((fraction) => <line key={fraction} x1={left} y1={top + height * fraction} x2={left + width} y2={top + height * fraction} className="projection-gridline" />)}
                <line x1={left} y1={top} x2={left} y2={top + height} className="projection-axis" />
                <line x1={left} y1={top + height} x2={left + width} y2={top + height} className="projection-axis" />
                <text x="6" y={top + 5}>{maxY.toFixed(1)}</text>
                <text x="30" y={top + height + 3}>0</text>
                <text x={left + width} y={top + height + 17} textAnchor="end">{maxX.toFixed(1)} {xUnit}</text>
                <text x="9" y="145" transform="rotate(-90 9 145)" textAnchor="middle">displacement (px)</text>
                {series.flatMap(({ group, points }) => selectedAxes.map(({ axis, dash }) => points.length > 1 && (
                  <path key={`${group.id}-${axis}`} d={pathFor(points, axis)} fill="none" stroke={group.color} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                )))}
              </svg>
            ) : <div className="trail-projection-empty">Select at least one group and axis with two observed group positions in the current range.</div>}
            <div className="trail-projection-group-legend">
              {selectedGroups.map((group) => <span key={group.id}><i style={{ background: group.color }} />{group.name}</span>)}
            </div>
          </main>
        </div>
      )}
    </section>
  )
}
