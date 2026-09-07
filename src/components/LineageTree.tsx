import { useEffect, useMemo, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { GitBranch, LocateFixed } from 'lucide-react'
import { createLineageLayout } from '../lineage/lineageTree'
import { getCellAppearance } from '../state/cellAppearance'
import { useExplorerStore } from '../state/explorerStore'

type ClickMode = 'cell' | 'lineage'

export function LineageTree() {
  const svgRef = useRef<SVGSVGElement>(null)
  const contentRef = useRef<SVGGElement>(null)
  const [clickMode, setClickMode] = useState<ClickMode>('cell')
  const [hovered, setHovered] = useState<string>()
  const dataset = useExplorerStore((state) => state.dataset)!
  const lineage = useExplorerStore((state) => state.lineage)!
  const currentFrameIndex = useExplorerStore((state) => state.currentFrameIndex)
  const selection = useExplorerStore((state) => state.selection)
  const groups = useExplorerStore((state) => state.groups)
  const cellColors = useExplorerStore((state) => state.cellColors)
  const settings = useExplorerStore((state) => state.settings)
  const setSelection = useExplorerStore((state) => state.setSelection)
  const selectLineage = useExplorerStore((state) => state.selectLineage)
  const setInspectedCell = useExplorerStore((state) => state.setInspectedCell)
  const layout = useMemo(() => createLineageLayout(lineage, dataset.temporalMode), [dataset.temporalMode, lineage])
  const layoutNodeById = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes])
  const currentValue = dataset.frameValues[currentFrameIndex] ?? 0

  useEffect(() => {
    const svg = svgRef.current
    const content = contentRef.current
    if (!svg || !content) return
    const bounds = svg.getBoundingClientRect()
    const viewportWidth = Math.max(bounds.width, 1)
    const viewportHeight = Math.max(bounds.height, 1)
    const behavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [viewportWidth, viewportHeight]])
      .scaleExtent([0.08, 8])
      .on('zoom', (event) => select(content).attr('transform', event.transform.toString()))
    select(svg).call(behavior)
    const initialScale = Math.min(0.9, (viewportWidth - 32) / layout.width, (viewportHeight - 32) / layout.height)
    select(svg).call(behavior.transform, zoomIdentity.translate(16, 16).scale(Math.max(0.08, initialScale)))
    return () => { select(svg).on('.zoom', null) }
  }, [layout])

  const statusFor = (id: string) => {
    if (dataset.temporalMode === 'generation') return 'static'
    const summary = lineage.nodes.get(id)?.summary
    if (!summary) {
      const value = layoutNodeById.get(id)?.value ?? 0
      return currentValue < value ? 'future' : 'past'
    }
    if (currentValue < summary.firstStep) return 'future'
    if (currentValue > summary.lastStep) return 'past'
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
    : 48 + ((currentValue - layout.minValue) / Math.max(layout.maxValue - layout.minValue, 1)) * (layout.height - 96)

  const clickCell = (cellId: string, shiftKey: boolean) => {
    if (clickMode === 'lineage' || shiftKey) selectLineage(cellId)
    else setSelection([cellId], { kind: 'cell', rootCell: cellId })
    setInspectedCell(cellId)
  }

  return (
    <section className="panel lineage-panel" aria-label="Lineage tree">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">{dataset.temporalMode === 'generation' ? 'Generation' : dataset.temporalMode === 'time' ? 'Time' : 'Frame'} axis</span>
          <h2>Lineage tree</h2>
        </div>
        <div className="segmented compact" aria-label="Tree selection mode">
          <button className={clickMode === 'cell' ? 'active' : ''} onClick={() => setClickMode('cell')}><LocateFixed size={14} /> Cell</button>
          <button className={clickMode === 'lineage' ? 'active' : ''} onClick={() => setClickMode('lineage')}><GitBranch size={14} /> Lineage</button>
        </div>
      </div>
      <div className="tree-stage">
        <svg ref={svgRef} className="tree-svg" role="img" aria-label="Zoomable C. elegans lineage tree">
          <g ref={contentRef}>
            {layout.edges.map((edge) => {
              const appearance = appearanceFor(edge.to.id)
              const status = statusFor(edge.to.id)
              return (
                <path
                  key={edge.id}
                  d={`M ${edge.from.x} ${edge.from.y} V ${edge.to.y} H ${edge.to.x}`}
                  className={`lineage-edge status-${status} ${appearance.selected ? 'selected' : ''}`}
                  stroke={appearance.inVisibleGroup || appearance.selected || cellColors[edge.to.id] ? appearance.color : undefined}
                />
              )
            })}
            {currentLineY !== undefined && (
              <g className="current-time-marker">
                <line x1={0} x2={layout.width} y1={currentLineY} y2={currentLineY} />
                <text x={8} y={currentLineY - 6}>{currentValue}</text>
              </g>
            )}
            {layout.nodes.map((node) => {
              const appearance = appearanceFor(node.id)
              const status = statusFor(node.id)
              const isHovered = hovered === node.id
              return (
                <g
                  key={node.id}
                  className={`lineage-node status-${status} ${node.represented ? 'represented' : 'connector'} ${appearance.selected ? 'selected' : ''}`}
                  transform={`translate(${node.x} ${node.y})`}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(undefined)}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (node.represented) clickCell(node.id, event.shiftKey)
                  }}
                >
                  <circle r={appearance.selected ? 5.2 : node.represented ? 3.5 : 2.2} fill={appearance.inVisibleGroup || appearance.selected || cellColors[node.id] ? appearance.color : undefined} />
                  {(node.represented || isHovered) && <text x={6} y={-5}>{node.id}{!node.resolved ? ' ?' : ''}</text>}
                  <title>{node.id}{node.represented ? '' : ' (connecting ancestor)'} · {status}</title>
                </g>
              )
            })}
          </g>
        </svg>
        <div className="tree-hint">Scroll to zoom · Drag to pan · Shift-click selects descendants</div>
        {lineage.unresolvedCellIds.length > 0 && (
          <div className="unresolved-badge" title={lineage.unresolvedCellIds.join(', ')}>{lineage.unresolvedCellIds.length} unresolved</div>
        )}
      </div>
    </section>
  )
}
