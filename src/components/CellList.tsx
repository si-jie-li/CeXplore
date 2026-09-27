import { useMemo, useState } from 'react'
import { CheckCheck, GitBranch, Search, X } from 'lucide-react'
import { getCellAppearance } from '../state/cellAppearance'
import { useExplorerStore } from '../state/explorerStore'
import { CELL_PALETTE } from '../utils/palette'

export function CellList() {
  const [query, setQuery] = useState('')
  const [dismissedWarning, setDismissedWarning] = useState('')
  const [saveGroup, setSaveGroup] = useState(true)
  const dataset = useExplorerStore((state) => state.dataset)!
  const lineage = useExplorerStore((state) => state.lineage)!
  const selection = useExplorerStore((state) => state.selection)
  const groups = useExplorerStore((state) => state.groups)
  const cellColors = useExplorerStore((state) => state.cellColors)
  const settings = useExplorerStore((state) => state.settings)
  const toggleCell = useExplorerStore((state) => state.toggleCell)
  const setSelection = useExplorerStore((state) => state.setSelection)
  const selectLineage = useExplorerStore((state) => state.selectLineage)
  const clearSelection = useExplorerStore((state) => state.clearSelection)
  const applyColor = useExplorerStore((state) => state.applyColor)
  const search = useMemo(() => {
    const requested = query.split(/[,，]/).map((value) => value.trim()).filter(Boolean)
    if (!requested.length) return { active: false, matches: dataset.cellIds, missing: [] as string[] }
    const actualByName = new Map(dataset.cellIds.map((id) => [id.toLocaleLowerCase(), id]))
    const seen = new Set<string>()
    const matches: string[] = [], missing: string[] = []
    for (const requestedId of requested) {
      const normalized = requestedId.toLocaleLowerCase()
      if (seen.has(normalized)) continue
      seen.add(normalized)
      const actual = actualByName.get(normalized)
      if (actual) matches.push(actual)
      else missing.push(requestedId)
    }
    return { active: true, matches, missing }
  }, [dataset.cellIds, query])
  const warningKey = search.missing.map((id) => id.toLocaleLowerCase()).join('\u0000')
  const showWarning = warningKey && warningKey !== dismissedWarning

  return (
    <div className="cell-list-component">
      <div className="cell-search-area">
        <div className="list-toolbar">
          <label className="search-field">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Exact names, comma-separated" aria-label="Search cells" />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}
          </label>
          {search.active && <button
            type="button"
            className="select-search-results"
            disabled={!search.matches.length}
            onClick={() => setSelection(search.matches, { kind: 'manual' })}
            title="Select every exact search result"
          ><CheckCheck size={13} /> Select all</button>}
          <span>{search.matches.length}</span>
        </div>
        {showWarning && <div className="cell-search-warning" role="alert">
          <span><strong>Not found:</strong> {search.missing.join(', ')}</span>
          <button type="button" onClick={() => setDismissedWarning(warningKey)} aria-label="Dismiss missing-cell warning"><X size={12} /></button>
        </div>}
      </div>
      <div className="cell-rows" role="listbox" aria-label="Cells" aria-multiselectable="true">
        {search.active && !search.matches.length && <div className="cell-search-empty">No exact cell matches.</div>}
        {search.matches.map((cellId) => {
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
              <button
                className="row-action"
                onClick={() => selectLineage(cellId)}
                title={`Add ${cellId} and represented descendants to selection`}
              ><GitBranch size={14} /></button>
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
