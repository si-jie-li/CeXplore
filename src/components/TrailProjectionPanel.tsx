import { useEffect, useId, useMemo, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Activity, ChevronDown, ChevronUp, Download, RotateCcw, X } from 'lucide-react'
import { getFrameObservations } from '../data/embryoView'
import { useExplorerStore, type CellGroup } from '../state/explorerStore'
import {
  calculateGroupProjectedPosition,
  projectionElapsedValue,
  projectionSeriesToCsv,
  type ProjectionAxis,
  type ProjectionPoint,
} from '../state/trailProjection'
import { resolveTrailStepRange } from '../state/trails'

const AXES: Array<{ axis: ProjectionAxis; dash?: string; styleName: string }> = [
  { axis: 'AP', styleName: 'solid' },
  { axis: 'LR', dash: '1 6', styleName: 'dotted' },
  { axis: 'VD', dash: '14 7', styleName: 'long dash' },
]

interface PlottedSeries {
  group: CellGroup
  cellId?: string
  seriesId: string
  points: ProjectionPoint[]
}

interface ChartDomain {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

interface DragSelection {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface ChartTooltip {
  x: number
  y: number
  title: string
  detail: string
  observation: string
}

const VIEWBOX_WIDTH = 790
const VIEWBOX_HEIGHT = 295
const PLOT_LEFT = 48
const PLOT_TOP = 17
const PLOT_WIDTH = 720
const PLOT_HEIGHT = 250

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function svgPosition(svg: SVGSVGElement, clientX: number, clientY: number) {
  const bounds = svg.getBoundingClientRect()
  return {
    x: (clientX - bounds.left) * VIEWBOX_WIDTH / (bounds.width || VIEWBOX_WIDTH),
    y: (clientY - bounds.top) * VIEWBOX_HEIGHT / (bounds.height || VIEWBOX_HEIGHT),
  }
}

function downloadProjectionCsv(csv: string, datasetName: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = datasetName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-') || 'cexplore'
  link.href = href
  link.download = `${safeName}-projected-motion.csv`
  link.click()
  URL.revokeObjectURL(href)
}

export function TrailProjectionPanel() {
  const [open, setOpen] = useState(false)
  const [axisMode, setAxisMode] = useState<'multiple' | 'single'>('multiple')
  const [visibleAxes, setVisibleAxes] = useState<Set<ProjectionAxis>>(new Set(['AP', 'LR', 'VD']))
  const [singleAxis, setSingleAxis] = useState<ProjectionAxis>('AP')
  const [groupSelection, setGroupSelection] = useState<'all' | string[]>('all')
  const [showIndividualCells, setShowIndividualCells] = useState(false)
  const [zoom, setZoom] = useState<ChartDomain | null>(null)
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null)
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null)
  const clipId = `projection-clip-${useId().replaceAll(':', '')}`
  const dataset = useExplorerStore((state) => state.dataset)!
  const currentFrameIndex = useExplorerStore((state) => state.currentFrameIndex)
  const groups = useExplorerStore((state) => state.groups)
  const lineage = useExplorerStore((state) => state.lineage)!
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
  const series = useMemo<PlottedSeries[]>(() => selectedGroups.flatMap((group): PlottedSeries[] => showIndividualCells
    ? group.cellIds.map((cellId) => ({
        group,
        cellId,
        seriesId: `${group.id}:${cellId}`,
        points: calculateGroupProjectedPosition(frames, [cellId]),
      }))
    : [{
        group,
        cellId: undefined,
        seriesId: group.id,
        points: calculateGroupProjectedPosition(frames, group.cellIds),
      }]), [frames, range?.start, selectedGroups, showIndividualCells])
  const divisionConnectors = useMemo(() => {
    if (!showIndividualCells) return []
    return selectedGroups.flatMap((group) => group.cellIds.flatMap((childCellId) => {
      const parentCellId = lineage.nodes.get(childCellId)?.parentId
      if (!parentCellId || !group.cellIds.includes(parentCellId)) return []
      const parent = series.find((item) => item.group.id === group.id && item.cellId === parentCellId)
      const child = series.find((item) => item.group.id === group.id && item.cellId === childCellId)
      const from = parent?.points.at(-1)
      const to = child?.points[0]
      return from && to && from.step <= to.step ? [{ group, parentCellId, childCellId, from, to }] : []
    }))
  }, [lineage.nodes, selectedGroups, series, showIndividualCells])
  const selectedAxes = axisMode === 'single'
    ? AXES.filter(({ axis }) => axis === singleAxis)
    : AXES.filter(({ axis }) => visibleAxes.has(axis))
  const selectedAxisIds = selectedAxes.map(({ axis }) => axis)
  const rangeStart = range?.start ?? currentStep ?? 0
  const xUnit = projectionElapsedValue(0, 0, dataset.temporalMode, dataset.mapping.frameIntervalSeconds).unit
  const elapsedAt = (step: number) => projectionElapsedValue(
    step, rangeStart, dataset.temporalMode, dataset.mapping.frameIntervalSeconds,
  ).value
  const selectedAxesKey = selectedAxisIds.join('|')
  const baseDomain = useMemo<ChartDomain>(() => {
    const xValues = series.flatMap(({ points }) => points.map((point) => projectionElapsedValue(
      point.step, rangeStart, dataset.temporalMode, dataset.mapping.frameIntervalSeconds,
    ).value))
    const yValues = series.flatMap(({ points }) => points.flatMap(
      (point) => selectedAxisIds.map((axis) => point[axis]),
    ))
    const xMax = Math.max(...xValues, 1)
    let yMin = Math.min(...yValues)
    let yMax = Math.max(...yValues)
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      yMin = -1
      yMax = 1
    }
    if (yMin === yMax) {
      yMin -= 1
      yMax += 1
    } else {
      const padding = (yMax - yMin) * .08
      yMin -= padding
      yMax += padding
    }
    return { xMin: 0, xMax, yMin, yMax }
  }, [dataset.mapping.frameIntervalSeconds, dataset.temporalMode, rangeStart, selectedAxesKey, series])
  const selectedGroupsKey = selectedGroups.map(({ id }) => id).join('|')
  const activeEmbryosKey = [...activeEmbryoIds].sort().join('|')
  useEffect(() => {
    setZoom(null)
    setDragSelection(null)
    setTooltip(null)
  }, [
    settings.trailRangeMode, settings.trailRangeStart, settings.trailRangeEnd, settings.trailPreviousFrames,
    axisMode, selectedAxesKey, selectedGroupsKey, showIndividualCells, settings.embryoViewMode, activeEmbryosKey,
  ])
  const domain = zoom ?? baseDomain
  const scaleX = (value: number) => PLOT_LEFT + (value - domain.xMin) / (domain.xMax - domain.xMin) * PLOT_WIDTH
  const scaleY = (value: number) => PLOT_TOP + (domain.yMax - value) / (domain.yMax - domain.yMin) * PLOT_HEIGHT
  const unscaleX = (value: number) => domain.xMin + (value - PLOT_LEFT) / PLOT_WIDTH * (domain.xMax - domain.xMin)
  const unscaleY = (value: number) => domain.yMax - (value - PLOT_TOP) / PLOT_HEIGHT * (domain.yMax - domain.yMin)
  const pathFor = (points: ProjectionPoint[], axis: ProjectionAxis) => points.map((point, index) => {
    const x = scaleX(elapsedAt(point.step))
    const y = scaleY(point[axis])
    return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
  const toggleGroup = (groupId: string) => {
    const ids = groupSelection === 'all' ? groups.map((group) => group.id) : groupSelection
    setGroupSelection(ids.includes(groupId) ? ids.filter((id) => id !== groupId) : [...ids, groupId])
  }
  const showTooltip = (event: ReactMouseEvent<SVGPathElement>, item: PlottedSeries, axis: ProjectionAxis) => {
    if (dragSelection || !item.points.length) return
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const pointer = svgPosition(svg, event.clientX, event.clientY)
    const targetElapsed = unscaleX(pointer.x)
    const visiblePoints = item.points.filter((point) => {
      const elapsed = elapsedAt(point.step)
      return elapsed >= domain.xMin && elapsed <= domain.xMax
    })
    const point = visiblePoints.reduce<ProjectionPoint | undefined>((nearest, candidate) => !nearest
      || Math.abs(elapsedAt(candidate.step) - targetElapsed) < Math.abs(elapsedAt(nearest.step) - targetElapsed)
      ? candidate : nearest, undefined)
    if (!point) return
    const elapsed = elapsedAt(point.step)
    setTooltip({
      x: scaleX(elapsed),
      y: scaleY(point[axis]),
      title: item.cellId ? `${item.cellId} · ${item.group.name}` : item.group.name,
      detail: `${axis}: x=${elapsed.toFixed(3)} ${xUnit}, coordinate=${point[axis].toFixed(3)} px`,
      observation: `${dataset.temporalMode}=${point.step} · n=${point.sampleCount}`,
    })
  }
  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragSelection) return
    const end = svgPosition(event.currentTarget, event.clientX, event.clientY)
    const x1 = clamp(Math.min(dragSelection.startX, end.x), PLOT_LEFT, PLOT_LEFT + PLOT_WIDTH)
    const x2 = clamp(Math.max(dragSelection.startX, end.x), PLOT_LEFT, PLOT_LEFT + PLOT_WIDTH)
    const y1 = clamp(Math.min(dragSelection.startY, end.y), PLOT_TOP, PLOT_TOP + PLOT_HEIGHT)
    const y2 = clamp(Math.max(dragSelection.startY, end.y), PLOT_TOP, PLOT_TOP + PLOT_HEIGHT)
    setDragSelection(null)
    if (x2 - x1 < 8 || y2 - y1 < 8) return
    setZoom({ xMin: unscaleX(x1), xMax: unscaleX(x2), yMin: unscaleY(y2), yMax: unscaleY(y1) })
  }
  const wheelZoom = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const pointer = svgPosition(event.currentTarget, event.clientX, event.clientY)
    if (pointer.x < PLOT_LEFT || pointer.x > PLOT_LEFT + PLOT_WIDTH || pointer.y < PLOT_TOP || pointer.y > PLOT_TOP + PLOT_HEIGHT) return
    const factor = event.deltaY < 0 ? .8 : 1.25
    const anchorX = unscaleX(pointer.x)
    const anchorY = unscaleY(pointer.y)
    const zoomRange = (minimum: number, maximum: number, baseMinimum: number, baseMaximum: number, anchor: number) => {
      const baseSpan = baseMaximum - baseMinimum
      const span = clamp((maximum - minimum) * factor, baseSpan / 200, baseSpan)
      const ratio = (anchor - minimum) / (maximum - minimum)
      let nextMinimum = anchor - span * ratio
      nextMinimum = clamp(nextMinimum, baseMinimum, baseMaximum - span)
      return [nextMinimum, nextMinimum + span] as const
    }
    const [xMin, xMax] = zoomRange(domain.xMin, domain.xMax, baseDomain.xMin, baseDomain.xMax, anchorX)
    const [yMin, yMax] = zoomRange(domain.yMin, domain.yMax, baseDomain.yMin, baseDomain.yMax, anchorY)
    const isReset = xMin === baseDomain.xMin && xMax === baseDomain.xMax
      && yMin === baseDomain.yMin && yMax === baseDomain.yMax
    setZoom(isReset ? null : { xMin, xMax, yMin, yMax })
    setTooltip(null)
  }
  const exportCsv = () => {
    if (!selectedAxisIds.length) return
    const csv = projectionSeriesToCsv(series.map((item) => ({
      groupId: item.group.id,
      groupName: item.group.name,
      groupColor: item.group.color,
      cellId: item.cellId,
      points: item.points,
    })), selectedAxisIds, rangeStart, dataset.temporalMode, dataset.mapping.frameIntervalSeconds)
    downloadProjectionCsv(csv, dataset.name)
  }
  const hasCurves = series.some(({ points }) => points.length > 1) && selectedAxes.length > 0
  const tooltipX = tooltip ? clamp(tooltip.x + 8, PLOT_LEFT, PLOT_LEFT + PLOT_WIDTH - 190) : 0
  const tooltipY = tooltip ? clamp(tooltip.y - 51, PLOT_TOP, PLOT_TOP + PLOT_HEIGHT - 50) : 0

  return (
    <section className={`trail-projection-drawer ${open ? 'open' : ''}`} aria-label="Projected group motion">
      <button className="trail-projection-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} title={open ? 'Collapse Projected motion' : 'Open Projected motion'}>
        <span><Activity size={15} /><strong>Projected motion</strong><em>{showIndividualCells ? 'Individual cell' : 'Group centroid'} coordinates · {xUnit}</em></span>
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {open && (
        <div className="trail-projection-body">
          <aside className="trail-projection-controls">
            <div className="trail-projection-controls-heading">
              <div><span className="panel-kicker">Trails</span><h2>Projected motion</h2></div>
              <button onClick={() => setOpen(false)} aria-label="Close projected motion"><X size={15} /></button>
            </div>
            <p>{showIndividualCells
              ? 'Each curve follows one cell, averaged across displayed embryos; lineage divisions are connected as forks.'
              : 'Each curve follows the mean position of all currently observed cells in one group.'}</p>
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
            <div className="projection-axis-mode" role="radiogroup" aria-label="Axis display mode">
              <button type="button" className={axisMode === 'multiple' ? 'active' : ''} onClick={() => setAxisMode('multiple')} aria-pressed={axisMode === 'multiple'}>Multiple axes</button>
              <button type="button" className={axisMode === 'single' ? 'active' : ''} onClick={() => setAxisMode('single')} aria-pressed={axisMode === 'single'}>Single axis</button>
            </div>
            <fieldset>
              <legend>{axisMode === 'single' ? 'Axis · solid line' : 'Axes and line styles'}</legend>
              {AXES.map(({ axis, dash, styleName }) => {
                const checked = axisMode === 'single' ? singleAxis === axis : visibleAxes.has(axis)
                return (
                  <label key={axis}>
                    <input
                      type={axisMode === 'single' ? 'radio' : 'checkbox'}
                      name={axisMode === 'single' ? 'projection-single-axis' : undefined}
                      checked={checked}
                      onChange={() => axisMode === 'single' ? setSingleAxis(axis) : setVisibleAxes((current) => {
                        const next = new Set(current)
                        if (next.has(axis)) next.delete(axis)
                        else next.add(axis)
                        return next
                      })}
                    />
                    <svg viewBox="0 0 34 8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={axisMode === 'single' ? undefined : dash} strokeLinecap="round" /></svg>
                    <span>{axis} · {axisMode === 'single' ? 'solid' : styleName}</span>
                  </label>
                )
              })}
            </fieldset>
            <label className="projection-individual-toggle">
              <input type="checkbox" checked={showIndividualCells} onChange={(event) => setShowIndividualCells(event.target.checked)} />
              Show individual cell projections
            </label>
            <small>Uses the current Trails range and displayed embryos. x=0 is the range start; y is the direct AP/LR/VD coordinate in source pixels.</small>
          </aside>
          <main className="trail-projection-chart-wrap">
            <div className="trail-projection-chart-heading">
              <div><span className="panel-kicker">{showIndividualCells ? 'Individual cells' : 'Group mean position'}</span><h2>Axis-projected position</h2></div>
              <div className="projection-chart-actions">
                <span>{selectedGroups.length}/{groups.length} groups · {selectedAxes.length}/3 axes</span>
                <button type="button" onClick={() => setZoom(null)} disabled={!zoom} title="Reset chart zoom"><RotateCcw size={11} /> Reset zoom</button>
                <button type="button" onClick={exportCsv} disabled={!hasCurves} title="Export the currently selected projection curves"><Download size={11} /> Export CSV</button>
              </div>
            </div>
            {hasCurves ? (
              <>
                <svg
                  className={`trail-projection-chart ${dragSelection ? 'selecting' : ''}`}
                  viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                  role="img"
                  aria-label="Projected group motion chart"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    const point = svgPosition(event.currentTarget, event.clientX, event.clientY)
                    if (point.x < PLOT_LEFT || point.x > PLOT_LEFT + PLOT_WIDTH || point.y < PLOT_TOP || point.y > PLOT_TOP + PLOT_HEIGHT) return
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                    setDragSelection({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
                    setTooltip(null)
                  }}
                  onPointerMove={(event) => {
                    if (!dragSelection) return
                    const point = svgPosition(event.currentTarget, event.clientX, event.clientY)
                    setDragSelection((current) => current && ({ ...current, currentX: point.x, currentY: point.y }))
                  }}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDragSelection(null)}
                  onWheel={wheelZoom}
                >
                  <defs><clipPath id={clipId}><rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_WIDTH} height={PLOT_HEIGHT} /></clipPath></defs>
                  {[0, .25, .5, .75, 1].map((fraction) => {
                    const x = PLOT_LEFT + PLOT_WIDTH * fraction
                    const y = PLOT_TOP + PLOT_HEIGHT * fraction
                    const xValue = domain.xMin + (domain.xMax - domain.xMin) * fraction
                    const yValue = domain.yMax - (domain.yMax - domain.yMin) * fraction
                    return <g key={fraction}>
                      <line x1={PLOT_LEFT} y1={y} x2={PLOT_LEFT + PLOT_WIDTH} y2={y} className="projection-gridline" />
                      <line x1={x} y1={PLOT_TOP} x2={x} y2={PLOT_TOP + PLOT_HEIGHT} className="projection-gridline" />
                      <text x={PLOT_LEFT - 5} y={y + 3} textAnchor="end">{yValue.toFixed(1)}</text>
                      <text x={x} y={PLOT_TOP + PLOT_HEIGHT + 15} textAnchor="middle">{xValue.toFixed(1)}</text>
                    </g>
                  })}
                  {domain.yMin <= 0 && domain.yMax >= 0 && <line x1={PLOT_LEFT} y1={scaleY(0)} x2={PLOT_LEFT + PLOT_WIDTH} y2={scaleY(0)} className="projection-zero-line" />}
                  <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_TOP + PLOT_HEIGHT} className="projection-axis" />
                  <line x1={PLOT_LEFT} y1={PLOT_TOP + PLOT_HEIGHT} x2={PLOT_LEFT + PLOT_WIDTH} y2={PLOT_TOP + PLOT_HEIGHT} className="projection-axis" />
                  <text x={PLOT_LEFT + PLOT_WIDTH} y={PLOT_TOP + PLOT_HEIGHT + 27} textAnchor="end">elapsed {xUnit}</text>
                  <text x="9" y="145" transform="rotate(-90 9 145)" textAnchor="middle">axis position (px)</text>
                  <g clipPath={`url(#${clipId})`}>
                    {series.flatMap((item) => selectedAxes.map(({ axis, dash }) => item.points.length > 1 && (
                      <path
                        key={`${item.seriesId}-${axis}`}
                        className="projection-series-line"
                        d={pathFor(item.points, axis)}
                        fill="none"
                        stroke={item.group.color}
                        strokeWidth={showIndividualCells ? 1.35 : 2}
                        strokeOpacity={showIndividualCells ? .72 : 1}
                        strokeDasharray={axisMode === 'single' ? undefined : dash}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    )))}
                    {divisionConnectors.flatMap(({ group, parentCellId, childCellId, from, to }) => selectedAxes.map(({ axis, dash }) => (
                      <line
                        key={`${group.id}-${parentCellId}-${childCellId}-${axis}`}
                        className="projection-division-connector"
                        x1={scaleX(elapsedAt(from.step))}
                        y1={scaleY(from[axis])}
                        x2={scaleX(elapsedAt(to.step))}
                        y2={scaleY(to[axis])}
                        stroke={group.color}
                        strokeWidth="1.35"
                        strokeOpacity=".72"
                        strokeDasharray={axisMode === 'single' ? undefined : dash}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    )))}
                    {series.flatMap((item) => selectedAxes.map(({ axis }) => item.points.length > 1 && (
                      <path
                        key={`hit-${item.seriesId}-${axis}`}
                        className="projection-hit-line"
                        d={pathFor(item.points, axis)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="12"
                        pointerEvents="stroke"
                        onMouseMove={(event) => showTooltip(event, item, axis)}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )))}
                  </g>
                  {tooltip && !dragSelection && (
                    <g className="projection-tooltip" pointerEvents="none">
                      <circle cx={tooltip.x} cy={tooltip.y} r="3.2" />
                      <rect x={tooltipX} y={tooltipY} width="190" height="47" rx="4" />
                      <text x={tooltipX + 7} y={tooltipY + 13} className="projection-tooltip-title">{tooltip.title}</text>
                      <text x={tooltipX + 7} y={tooltipY + 27}>{tooltip.detail}</text>
                      <text x={tooltipX + 7} y={tooltipY + 40}>{tooltip.observation}</text>
                    </g>
                  )}
                  {dragSelection && (
                    <rect
                      className="projection-zoom-selection"
                      x={Math.min(dragSelection.startX, dragSelection.currentX)}
                      y={Math.min(dragSelection.startY, dragSelection.currentY)}
                      width={Math.abs(dragSelection.currentX - dragSelection.startX)}
                      height={Math.abs(dragSelection.currentY - dragSelection.startY)}
                    />
                  )}
                </svg>
                <div className="projection-chart-help">Drag a rectangle to zoom time and coordinate · scroll to zoom around the cursor · hover a curve for exact values</div>
              </>
            ) : <div className="trail-projection-empty">Select at least one group and axis with two observed positions in the current range.</div>}
            <div className="trail-projection-group-legend">
              {selectedGroups.map((group) => <span key={group.id}><i style={{ background: group.color }} />{group.name}</span>)}
            </div>
          </main>
        </div>
      )}
    </section>
  )
}
