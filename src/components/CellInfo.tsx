import { GitBranch, Info } from 'lucide-react'
import { getAncestors, getDescendants } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { formatNumber } from '../utils/format'

export function CellInfo() {
  const dataset = useExplorerStore((state) => state.dataset)!
  const lineage = useExplorerStore((state) => state.lineage)!
  const frameIndex = useExplorerStore((state) => state.currentFrameIndex)
  const inspected = useExplorerStore((state) => state.inspectedCellId)
  const hovered = useExplorerStore((state) => state.hoveredObservation)
  const currentStep = dataset.frameValues[frameIndex] ?? 0
  const cellId = hovered?.cellId ?? inspected
  const currentObservation = hovered ?? (cellId
    ? (dataset.frameIndex.get(currentStep) ?? []).find((row) => row.cellId === cellId)
    : undefined)
  const node = cellId ? lineage.nodes.get(cellId) : undefined
  const parent = node?.parentId
  const descendants = cellId ? getDescendants(lineage, cellId, true).length - 1 : 0
  const ancestors = cellId ? getAncestors(lineage, cellId) : []

  if (!cellId) {
    return (
      <div className="cell-info empty-state-small">
        <Info size={17} />
        <span>Hover a nucleus or select a cell to inspect it.</span>
      </div>
    )
  }

  return (
    <div className="cell-info">
      <div className="cell-info-title">
        <div className="cell-avatar">{cellId.slice(0, 2)}</div>
        <div>
          <strong>{cellId}</strong>
          <span>{node?.resolved ? 'Lineage resolved' : 'Lineage unresolved'}</span>
        </div>
      </div>
      <dl>
        <div><dt>{dataset.temporalMode === 'time' ? 'Time' : 'Frame'}</dt><dd>{formatNumber(currentStep)}</dd></div>
        <div><dt>Parent</dt><dd>{parent ?? '—'}</dd></div>
        <div><dt>X</dt><dd>{currentObservation ? formatNumber(currentObservation.x, 3) : 'not present'}</dd></div>
        <div><dt>Y</dt><dd>{currentObservation ? formatNumber(currentObservation.y, 3) : 'not present'}</dd></div>
        <div><dt>Z</dt><dd>{currentObservation ? formatNumber(currentObservation.z, 3) : 'not present'}</dd></div>
        <div><dt>Descendants</dt><dd>{descendants}</dd></div>
      </dl>
      {ancestors.length > 0 && <div className="ancestor-line"><GitBranch size={13} /> {ancestors.slice().reverse().join(' › ')} › <b>{cellId}</b></div>}
    </div>
  )
}
