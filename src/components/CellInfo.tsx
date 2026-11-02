import { Eye, EyeOff, GitBranch, Info, Route } from 'lucide-react'
import { getFrameObservations, MEAN_EMBRYO_ID } from '../data/embryoView'
import { getAncestors, getDescendants } from '../lineage/lineageResolver'
import { getCellAppearance } from '../state/cellAppearance'
import { useExplorerStore } from '../state/explorerStore'
import { resolveTrailCellIds } from '../state/trails'
import { formatNumber } from '../utils/format'

function VisibilityActions({ cellId }: { cellId?: string }) {
  const groups = useExplorerStore((state) => state.groups)
  const selection = useExplorerStore((state) => state.selection)
  const cellColors = useExplorerStore((state) => state.cellColors)
  const cellVisibility = useExplorerStore((state) => state.cellVisibility)
  const cellTrailVisibility = useExplorerStore((state) => state.cellTrailVisibility)
  const settings = useExplorerStore((state) => state.settings)
  const setCellsVisible = useExplorerStore((state) => state.setCellsVisible)
  const setAllCellsVisible = useExplorerStore((state) => state.setAllCellsVisible)
  const setCellTrailsVisible = useExplorerStore((state) => state.setCellTrailsVisible)
  const setAllCellTrailsVisible = useExplorerStore((state) => state.setAllCellTrailsVisible)
  const selectedTargets = selection.size > 1 ? [...selection] : []
  const targets = selectedTargets.length ? selectedTargets : cellId ? [cellId] : []
  const multiple = targets.length > 1
  const cellStates = targets.map((target) => getCellAppearance({
    cellId: target, selection, cellColors, cellVisibility, groups,
    displayMode: settings.displayMode, unselectedOpacity: settings.unselectedOpacity,
  }).visible)
  const trailTargets = resolveTrailCellIds(groups, settings.trailGroupIds, selection, cellTrailVisibility)
  const trailStates = targets.map((target) => settings.showTrajectories && trailTargets.has(target))
  const allCellsVisible = targets.length > 0 && cellStates.every(Boolean)
  const allCellsHidden = targets.length > 0 && cellStates.every((visible) => !visible)
  const allTrailsVisible = targets.length > 0 && trailStates.every(Boolean)
  const allTrailsHidden = targets.length > 0 && trailStates.every((visible) => !visible)
  const cellSubject = multiple ? `${targets.length} selected cells` : `cell ${targets[0]}`
  const trailSubject = multiple ? `trails for ${targets.length} selected cells` : `trail for ${targets[0]}`

  return (
    <div className="cell-visibility-controls">
      {targets.length > 0 && (
        <div className="cell-visibility-row current-cell-actions">
          <span title={multiple ? `${targets.length} selected cells` : 'Current cell'}>{multiple ? `Selected (${targets.length})` : 'Current'}</span>
          <div className="cell-visibility-pair">
            <em>{multiple ? 'Cells' : 'Cell'}</em>
            <button
              type="button"
              className={allCellsVisible ? 'active' : ''}
              onClick={() => setCellsVisible(targets, true)}
              aria-label={`Show ${cellSubject}`}
              title={`Show ${cellSubject}`}
            ><Eye size={11} /></button>
            <button
              type="button"
              className={allCellsHidden ? 'active' : ''}
              onClick={() => setCellsVisible(targets, false)}
              aria-label={`Hide ${cellSubject}`}
              title={`Hide ${cellSubject}`}
            ><EyeOff size={11} /></button>
          </div>
          <div className="cell-visibility-pair">
            <em>{multiple ? 'Trails' : 'Trail'}</em>
            <button
              type="button"
              className={allTrailsVisible ? 'active' : ''}
              onClick={() => setCellTrailsVisible(targets, true)}
              aria-label={`Show ${trailSubject}`}
              title={`Show ${trailSubject}; each includes its incoming segment from the mother`}
            ><Route size={11} /></button>
            <button
              type="button"
              className={allTrailsHidden ? 'active' : ''}
              onClick={() => setCellTrailsVisible(targets, false)}
              aria-label={`Hide ${trailSubject}`}
              title={`Hide ${trailSubject}`}
            ><EyeOff size={11} /></button>
          </div>
        </div>
      )}
      <div className="cell-visibility-row all-cell-actions">
        <span>All</span>
        <div className="cell-visibility-pair">
          <em>Cells</em>
          <button type="button" onClick={() => setAllCellsVisible(true)} aria-label="Show all cells" title="Show all cells"><Eye size={11} /></button>
          <button type="button" onClick={() => setAllCellsVisible(false)} aria-label="Hide all cells" title="Hide all cells"><EyeOff size={11} /></button>
        </div>
        <div className="cell-visibility-pair">
          <em>Trails</em>
          <button type="button" onClick={() => setAllCellTrailsVisible(true)} aria-label="Show all cell trails" title="Show all cell trails"><Route size={11} /></button>
          <button type="button" onClick={() => setAllCellTrailsVisible(false)} aria-label="Hide all cell trails" title="Hide all cell trails"><EyeOff size={11} /></button>
        </div>
      </div>
      <p>Latest cell or group visibility command wins.</p>
    </div>
  )
}

export function CellInfo() {
  const dataset = useExplorerStore((state) => state.dataset)!
  const lineage = useExplorerStore((state) => state.lineage)!
  const frameIndex = useExplorerStore((state) => state.currentFrameIndex)
  const inspected = useExplorerStore((state) => state.inspectedCellId)
  const hovered = useExplorerStore((state) => state.hoveredObservation)
  const selection = useExplorerStore((state) => state.selection)
  const activeEmbryoIds = useExplorerStore((state) => state.activeEmbryoIds)
  const settings = useExplorerStore((state) => state.settings)
  const meanPositionCache = useExplorerStore((state) => state.meanPositionCache)
  const currentStep = dataset.frameValues[frameIndex] ?? 0
  const cellId = hovered?.cellId ?? inspected
  const visibleObservations = getFrameObservations(
    dataset,
    currentStep,
    activeEmbryoIds,
    settings.embryoViewMode,
    meanPositionCache,
  )
  const currentObservation = hovered ?? (cellId
    ? visibleObservations.find((row) => row.cellId === cellId)
    : undefined)
  const embryo = currentObservation?.embryoId === MEAN_EMBRYO_ID
    ? `${currentObservation.contributingEmbryoIds?.length ?? 0}-embryo mean`
    : dataset.embryos.find((item) => item.id === currentObservation?.embryoId)?.label
  const node = cellId ? lineage.nodes.get(cellId) : undefined
  const parent = node?.parentId
  const descendants = cellId ? getDescendants(lineage, cellId, true).length - 1 : 0
  const ancestors = cellId ? getAncestors(lineage, cellId) : []

  if (!cellId) {
    return (
      <div className="cell-info">
        <div className="empty-state-small cell-info-empty">
          <Info size={17} />
          <span>{selection.size > 1 ? `${selection.size} cells selected. Use Selected below for batch visibility.` : 'Hover a nucleus or select a cell to inspect it.'}</span>
        </div>
        <VisibilityActions />
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
        <div><dt>Embryo</dt><dd>{embryo ?? 'not present'}</dd></div>
        <div><dt>Parent</dt><dd>{parent ?? '—'}</dd></div>
        <div><dt>AP</dt><dd>{currentObservation ? formatNumber(currentObservation.x, 3) : 'not present'}</dd></div>
        <div><dt>LR</dt><dd>{currentObservation ? formatNumber(currentObservation.y, 3) : 'not present'}</dd></div>
        <div><dt>DV</dt><dd>{currentObservation ? formatNumber(currentObservation.z, 3) : 'not present'}</dd></div>
        <div><dt>Descendants</dt><dd>{descendants}</dd></div>
      </dl>
      {ancestors.length > 0 && <div className="ancestor-line"><GitBranch size={13} /> {ancestors.slice().reverse().join(' › ')} › <b>{cellId}</b></div>}
      <VisibilityActions cellId={cellId} />
    </div>
  )
}
