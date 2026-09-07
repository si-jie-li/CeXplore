import { useMemo, useState } from 'react'
import { GitBranch, Search, X } from 'lucide-react'
import { getCellAppearance } from '../state/cellAppearance'
import { useExplorerStore } from '../state/explorerStore'
import { CELL_PALETTE } from '../utils/palette'

export function CellList() {
  const [query, setQuery] = useState('')
  const [saveGroup, setSaveGroup] = useState(true)
  const dataset = useExplorerStore((state) => state.dataset)!
  const lineage = useExplorerStore((state) => state.lineage)!
  const selection = useExplorerStore((state) => state.selection)
  const groups = useExplorerStore((state) => state.groups)
  const cellColors = useExplorerStore((state) => state.cellColors)
  const settings = useExplorerStore((state) => state.settings)
  const toggleCell = useExplorerStore((state) => state.toggleCell)
  const selectLineage = useExplorerStore((state) => state.selectLineage)
  const clearSelection = useExplorerStore((state) => state.clearSelection)
  const applyColor = useExplorerStore((state) => state.applyColor)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? dataset.cellIds.filter((id) => id.toLowerCase().includes(normalized)) : dataset.cellIds
  }, [dataset.cellIds, query])

  return (
    <div className="cell-list-component">
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cells" aria-label="Search cells" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}
        </label>
        <span>{filtered.length}</span>
      </div>
      <div className="cell-rows" role="listbox" aria-label="Cells" aria-multiselectable="true">
        {filtered.map((cellId) => {
          const selected = selection.has(cellId)
          const appearance = getCellAppearance({
            cellId,
            selection,
            cellColors,
            groups,
            displayMode: settings.displayMode,
            unselectedOpacity: settings.unselectedOpacity,
          })
          const node = lineage.nodes.get(cellId)
          return (
            <div key={cellId} className={`cell-row ${selected ? 'selected' : ''}`} role="option" aria-selected={selected}>
              <label>
                <input type="checkbox" checked={selected} onChange={() => toggleCell(cellId)} />
                <span className="color-dot" style={{ background: appearance.inVisibleGroup || cellColors[cellId] ? appearance.color : '#c9d0ce' }} />
                <span className="cell-name">{cellId}</span>
                {!node?.resolved && <span className="unresolved-mark" title="Lineage unresolved">?</span>}
              </label>
              <button className="row-action" onClick={() => selectLineage(cellId)} title={`Select ${cellId} and represented descendants`}><GitBranch size={14} /></button>
            </div>
          )
        })}
      </div>
      <div className={`color-assignment ${selection.size ? '' : 'disabled'}`}>
        <div className="selection-summary">
          <strong>{selection.size ? `${selection.size} selected` : 'Select cells to color'}</strong>
          {selection.size > 0 && <button onClick={clearSelection}>Clear</button>}
        </div>
        <div className="palette">
          {CELL_PALETTE.map((color) => (
            <button
              key={color}
              disabled={!selection.size}
              style={{ background: color }}
              onClick={() => applyColor(color, saveGroup)}
              aria-label={`Assign ${color}`}
              title={`Assign ${color}`}
            />
          ))}
          <label className="custom-color" title="Custom color">
            <input type="color" disabled={!selection.size} onChange={(event) => applyColor(event.target.value, saveGroup)} />
            <span>+</span>
          </label>
        </div>
        <label className="save-group-toggle">
          <input type="checkbox" checked={saveGroup} onChange={(event) => setSaveGroup(event.target.checked)} />
          Save colored selection as a group
        </label>
      </div>
    </div>
  )
}
