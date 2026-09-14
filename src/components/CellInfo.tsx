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
  const setCellVisible = useExplorerStore((state) => state.setCellVisible)
  const setAllCellsVisible = useExplorerStore((state) => state.setAllCellsVisible)
  const setCellTrailVisible = useExplorerStore((state) => state.setCellTrailVisible)
  const setAllCellTrailsVisible = useExplorerStore((state) => state.setAllCellTrailsVisible)
  const cellIsVisible = cellId ? getCellAppearance({
    cellId,
    selection,
    cellColors,
    cellVisibility,
    groups,
    displayMode: settings.displayMode,
    unselectedOpacity: settings.unselectedOpacity,
  }).visible : false
  const trailIsVisible = cellId
    ? settings.showTrajectories && resolveTrailCellIds(
      groups,
      settings.trailGroupIds,
      selection,
      cellTrailVisibility,
    ).has(cellId)
    : false

  return (
    <div className="cell-visibility-controls">
      {cellId && (
        <div className="cell-visibility-row current-cell-actions">
          <span>Current</span>
          <div className="cell-visibility-pair">
            <em>Cell</em>
            <button
              type="button"
              className={cellIsVisible ? 'active' : ''}
              onClick={() => setCellVisible(cellId, true)}
              aria-label={`Show cell ${cellId}`}
              title={`Show cell ${cellId}`}
            ><Eye size={11} /></button>
            <button
              type="button"
              className={!cellIsVisible ? 'active' : ''}
              onClick={() => setCellVisible(cellId, false)}
              aria-label={`Hide cell ${cellId}`}
              title={`Hide cell ${cellId}`}
            ><EyeOff size={11} /></button>
          </div>
          <div className="cell-visibility-pair">
            <em>Trail</em>
            <button
              type="button"
              className={trailIsVisible ? 'active' : ''}
              onClick={() => setCellTrailVisible(cellId, true)}
              aria-label={`Show trail for ${cellId}`}
              title={`Show trail for ${cellId}; includes its incoming segment from the mother`}
            ><Route size={11} /></button>
            <button
              type="button"
              className={!trailIsVisible ? 'active' : ''}
              onClick={() => setCellTrailVisible(cellId, false)}
              aria-label={`Hide trail for ${cellId}`}
              title={`Hide trail for ${cellId}`}
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
          <span>Hover a nucleus or select a cell to inspect it.</span>
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
        <div><dt>VD</dt><dd>{currentObservation ? formatNumber(currentObservation.z, 3) : 'not present'}</dd></div>
        <div><dt>Descendants</dt><dd>{descendants}</dd></div>
      </dl>
      {ancestors.length > 0 && <div className="ancestor-line"><GitBranch size={13} /> {ancestors.slice().reverse().join(' › ')} › <b>{cellId}</b></div>}
      <VisibilityActions cellId={cellId} />
    </div>
  )
}
