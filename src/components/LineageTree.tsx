import { useEffect, useMemo, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { GitBranch, LocateFixed } from 'lucide-react'
import { createLineageLayout } from '../lineage/lineageTree'
import { getCellAppearance } from '../state/cellAppearance'
import { useExplorerStore } from '../state/explorerStore'

type ClickMode = 'cell' | 'lineage'

const EARLY_LABEL_MAX_DEPTH = 5

export function LineageTree() {
  const svgRef = useRef<SVGSVGElement>(null)
  const contentRef = useRef<SVGGElement>(null)
  const [clickMode, setClickMode] = useState<ClickMode>('cell')
  const [hovered, setHovered] = useState<string>()
  const dataset = useExplorerStore((state) => state.dataset)!
  const lineage = useExplorerStore((state) => state.lineage)!
  const currentFrameIndex = useExplorerStore((state) => state.currentFrameIndex)
  const activeEmbryoIds = useExplorerStore((state) => state.activeEmbryoIds)
  const selection = useExplorerStore((state) => state.selection)
  const groups = useExplorerStore((state) => state.groups)
  const cellColors = useExplorerStore((state) => state.cellColors)
  const settings = useExplorerStore((state) => state.settings)
  const setSelection = useExplorerStore((state) => state.setSelection)
  const toggleCell = useExplorerStore((state) => state.toggleCell)
  const selectLineage = useExplorerStore((state) => state.selectLineage)
  const setInspectedCell = useExplorerStore((state) => state.setInspectedCell)
  const layout = useMemo(
    () => createLineageLayout(lineage, dataset.temporalMode),
    [dataset.temporalMode, lineage],
  )
  const layoutNodeById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  )
  const currentValue = dataset.frameValues[currentFrameIndex] ?? 0
  const activeCellRanges = useMemo(() => {
    const ranges = new Map<string, { first: number; last: number }>()
    for (const observation of dataset.observations) {
      if (!activeEmbryoIds.has(observation.embryoId)) continue
      const range = ranges.get(observation.cellId)
      if (range) {
        range.first = Math.min(range.first, observation.step)
        range.last = Math.max(range.last, observation.step)
      } else ranges.set(observation.cellId, { first: observation.step, last: observation.step })
    }
    return ranges
  }, [activeEmbryoIds, dataset.observations])

  useEffect(() => {
    const svg = svgRef.current
    const content = contentRef.current
    if (!svg || !content) return
    const bounds = svg.getBoundingClientRect()
    const viewportWidth = Math.max(bounds.width, 1)
    const viewportHeight = Math.max(bounds.height, 1)
    const behavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [viewportWidth, viewportHeight]])
      .scaleExtent([0.025, 16])
      .on('zoom', (event) => select(content).attr('transform', event.transform.toString()))
    select(svg).call(behavior)
    const initialScale = Math.min(
      0.95,
      (viewportWidth - 18) / layout.width,
      (viewportHeight - 18) / layout.height,
    )
    select(svg).call(
      behavior.transform,
      zoomIdentity.translate(9, 9).scale(Math.max(0.025, initialScale)),
    )
    return () => { select(svg).on('.zoom', null) }
  }, [layout])

  const statusFor = (id: string) => {
    if (dataset.temporalMode === 'generation') return 'static'
    const range = activeCellRanges.get(id)
    if (!range) {
      const birthValue = layoutNodeById.get(id)?.birthValue ?? 0
      return currentValue < birthValue ? 'future' : 'past'
    }
    if (currentValue < range.first) return 'future'
    if (currentValue > range.last) return 'past'
    return 'current'
  }

  const appearanceFor = (id: string) => getCellAppearance({
    cellId: id,
    selection,
    cellColors,
    groups,
    displayMode: settings.displayMode,
    unselectedOpacity: settings.unselectedOpacity,
  })

  const currentLineY = dataset.temporalMode === 'generation'
    ? undefined
    : layout.plotTop
      + ((currentValue - layout.minValue) / Math.max(layout.maxValue - layout.minValue, 1))
        * (layout.plotBottom - layout.plotTop)

  const clickBranch = (cellId: string, shiftKey: boolean, additive: boolean) => {
    const node = lineage.nodes.get(cellId)
    if (clickMode === 'lineage' || shiftKey || !node?.represented) {
      selectLineage(cellId, additive)
    } else if (additive) {
      toggleCell(cellId)
    } else {
      setSelection([cellId], { kind: 'cell', rootCell: cellId })
    }
    if (node?.represented) setInspectedCell(cellId)
  }

  const branchColor = (cellId: string) => {
    const appearance = appearanceFor(cellId)
    return appearance.inVisibleGroup || appearance.selected || cellColors[cellId]
      ? appearance.color
      : undefined
  }

  return (
    <section className="panel lineage-panel" aria-label="Lineage tree">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">
            {layout.usesCanonicalTime
              ? 'Canonical time axis'
              : dataset.temporalMode === 'time' ? 'Time axis' : 'Frame axis'}
          </span>
          <h2>Lineage tree</h2>
        </div>
        <div className="segmented compact" aria-label="Tree selection mode">
          <button className={clickMode === 'cell' ? 'active' : ''} onClick={() => setClickMode('cell')}>
            <LocateFixed size={14} /> Cell
          </button>
          <button className={clickMode === 'lineage' ? 'active' : ''} onClick={() => setClickMode('lineage')}>
            <GitBranch size={14} /> Lineage
          </button>
        </div>
      </div>
      <div className="tree-stage">
        <svg ref={svgRef} className="tree-svg" role="img" aria-label="Zoomable C. elegans lineage tree">
          <g ref={contentRef}>
            <g className="lineage-time-axis" aria-hidden="true">
              <line className="axis-spine" x1={layout.plotLeft} x2={layout.plotLeft} y1={layout.plotTop} y2={layout.plotBottom} />
              {layout.ticks.map((tick) => (
                <g key={tick.value}>
                  <line className="axis-grid" x1={layout.plotLeft} x2={layout.plotRight} y1={tick.y} y2={tick.y} />
                  <line className="axis-tick" x1={layout.plotLeft - 4} x2={layout.plotLeft} y1={tick.y} y2={tick.y} />
                  <text className="axis-tick-label" x={layout.plotLeft - 8} y={tick.y + 3} textAnchor="end">{tick.label}</text>
                </g>
              ))}
              <text
                className="axis-title"
                x={16}
                y={(layout.plotTop + layout.plotBottom) / 2}
                textAnchor="middle"
                transform={`rotate(-90 16 ${(layout.plotTop + layout.plotBottom) / 2})`}
              >
                {layout.axisLabel}
              </text>
            </g>

            {currentLineY !== undefined && currentLineY >= layout.plotTop && currentLineY <= layout.plotBottom && (
              <g className="current-time-marker">
                <line x1={layout.plotLeft} x2={layout.plotRight} y1={currentLineY} y2={currentLineY} />
                <text x={layout.plotLeft + 6} y={currentLineY - 6}>{currentValue}</text>
              </g>
            )}

            {layout.connectors.map((connector) => {
              const appearance = appearanceFor(connector.parentId)
              const status = statusFor(connector.parentId)
              return (
                <g
                  key={connector.id}
                  className={`lineage-branch-group connector status-${status} ${cellColors[connector.parentId] ? 'colored' : ''} ${appearance.selected ? 'selected' : ''}`}
                  onMouseEnter={() => setHovered(connector.parentId)}
                  onMouseLeave={() => setHovered(undefined)}
                  onClick={(event) => {
                    event.stopPropagation()
                    clickBranch(connector.parentId, event.shiftKey, event.metaKey || event.ctrlKey)
                  }}
                >
                  <line
                    className="lineage-connector"
                    x1={connector.x1}
                    x2={connector.x2}
                    y1={connector.y}
                    y2={connector.y}
                    style={{ stroke: branchColor(connector.parentId) }}
                  />
                  <line
                    className="lineage-hit-area"
                    x1={connector.x1}
                    x2={connector.x2}
                    y1={connector.y}
                    y2={connector.y}
                  />
                </g>
              )
            })}

            {layout.nodes.map((node) => {
              const appearance = appearanceFor(node.id)
              const status = statusFor(node.id)
              const isHovered = hovered === node.id
              const showEarlyLabel = node.depth <= EARLY_LABEL_MAX_DEPTH
              const labelY = showEarlyLabel
                ? Math.max(layout.plotTop + 9, node.startY - 5)
                : (node.startY + node.endY) / 2 - 5
              return (
                <g
                  key={node.id}
                  className={`lineage-branch-group status-${status} ${node.represented ? 'represented' : 'connector'} ${cellColors[node.id] ? 'colored' : ''} ${appearance.selected ? 'selected' : ''}`}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(undefined)}
                  onClick={(event) => {
                    event.stopPropagation()
                    clickBranch(node.id, event.shiftKey, event.metaKey || event.ctrlKey)
                  }}
                >
                  <line
                    className="lineage-branch"
                    x1={node.x}
                    x2={node.x}
                    y1={node.startY}
                    y2={node.endY}
                    style={{ stroke: branchColor(node.id) }}
                  />
                  <line
                    className="lineage-hit-area"
                    x1={node.x}
                    x2={node.x}
                    y1={node.startY}
                    y2={node.endY}
                  />
                  {(showEarlyLabel || isHovered) && (
                    <text
                      className={`branch-label ${showEarlyLabel ? 'early-label' : 'hover-label'}`}
                      x={node.x + 4}
                      y={labelY}
                    >
                      {node.id}{!node.resolved ? ' ?' : ''}
                    </text>
                  )}
                  <title>
                    {node.id}{node.represented ? '' : ' (connecting ancestor)'} · {status} · {node.birthValue}–{node.endValue}
                  </title>
                </g>
              )
            })}
          </g>
        </svg>
        <div className="tree-hint">Scroll to zoom · Drag to pan · ⌘/Ctrl-click adds cells · Shift-click selects lineage</div>
        {lineage.unresolvedCellIds.length > 0 && (
          <div className="unresolved-badge" title={lineage.unresolvedCellIds.join(', ')}>
            {lineage.unresolvedCellIds.length} unresolved
          </div>
        )}
      </div>
    </section>
  )
}
