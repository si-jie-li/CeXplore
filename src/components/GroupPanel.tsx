import { useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Focus,
  MousePointer2,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react'
import { useExplorerStore } from '../state/explorerStore'
import { createGroupListFile, readGroupListFile } from '../utils/groupList'
import { downloadJson } from '../utils/session'

const safeFilename = (name: string) => name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'cexplore'

export function GroupPanel() {
  const importInput = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [groupQuery, setGroupQuery] = useState('')
  const dataset = useExplorerStore((state) => state.dataset)!
  const groups = useExplorerStore((state) => state.groups)
  const selection = useExplorerStore((state) => state.selection)
  const toggleCell = useExplorerStore((state) => state.toggleCell)
  const updateGroup = useExplorerStore((state) => state.updateGroup)
  const setGroupsVisible = useExplorerStore((state) => state.setGroupsVisible)
  const setGroupColor = useExplorerStore((state) => state.setGroupColor)
  const addCellsToGroup = useExplorerStore((state) => state.addCellsToGroup)
  const removeCellsFromGroup = useExplorerStore((state) => state.removeCellsFromGroup)
  const deleteGroup = useExplorerStore((state) => state.deleteGroup)
  const selectGroup = useExplorerStore((state) => state.selectGroup)
  const focusGroup = useExplorerStore((state) => state.focusGroup)
  const importGroupList = useExplorerStore((state) => state.importGroupList)
  const normalizedQuery = groupQuery.trim().toLocaleLowerCase()
  const filteredGroups = useMemo(() => normalizedQuery
    ? groups.filter((group) => group.name.toLocaleLowerCase().includes(normalizedQuery))
    : groups, [groups, normalizedQuery])

  const toggleExpanded = (groupId: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(groupId)) next.delete(groupId)
    else next.add(groupId)
    return next
  })

  const exportGroups = () => {
    downloadJson(
      createGroupListFile(dataset.name, groups),
      `${safeFilename(dataset.name.replace(/\.[^.]+$/, ''))}.groups.json`,
    )
  }

  return (
    <div className="group-panel-component">
      <div className="group-panel-toolbars">
        <div className="group-list-toolbar">
          <span>{message || 'Groups with the same color are merged automatically.'}</span>
          <button type="button" onClick={() => importInput.current?.click()} title="Import group list">
            <Upload size={13} /> Import
          </button>
          <button type="button" onClick={exportGroups} disabled={!groups.length} title="Export readable group list">
            <Download size={13} /> Export
          </button>
          <input
            ref={importInput}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void readGroupListFile(file)
                .then((groupFile) => {
                  const warnings = importGroupList(groupFile.dataset, groupFile.groups)
                  setMessage(`Imported ${groupFile.groups.length} group entr${groupFile.groups.length === 1 ? 'y' : 'ies'}.${warnings.length ? ` ${warnings.join(' ')}` : ''}`)
                })
                .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Could not import group list.'))
              event.target.value = ''
            }}
          />
        </div>
        {groups.length > 0 && (
          <div className="group-visibility-toolbar">
            <input
              type="search"
              value={groupQuery}
              onChange={(event) => setGroupQuery(event.target.value)}
              placeholder="Filter group names…"
              aria-label="Filter groups by name"
            />
            <span>{filteredGroups.length}/{groups.length} shown</span>
            <button
              type="button"
              onClick={() => setGroupsVisible(filteredGroups.map((group) => group.id), true)}
              disabled={!filteredGroups.some((group) => !group.visible)}
              title="Make all displayed groups visible"
            ><Eye size={12} /> All</button>
            <button
              type="button"
              onClick={() => setGroupsVisible(filteredGroups.map((group) => group.id), false)}
              disabled={!filteredGroups.some((group) => group.visible)}
              title="Make all displayed groups invisible"
            ><EyeOff size={12} /> None</button>
          </div>
        )}
      </div>

      {!groups.length ? (
        <div className="groups-empty">
          <div className="empty-color-row"><i /><i /><i /></div>
          <strong>No saved groups yet</strong>
          <p>Select cells or a lineage, then choose a color—or import a CeXplore group-list JSON.</p>
        </div>
      ) : !filteredGroups.length ? (
        <div className="groups-empty groups-filter-empty">
          <strong>No matching groups</strong>
          <p>Try another group-name keyword.</p>
        </div>
      ) : (
        <div className="group-list">
          {filteredGroups.map((group) => {
            const isExpanded = expanded.has(group.id)
            const markedCells = group.cellIds.filter((cellId) => selection.has(cellId))
            const canAddSelection = selection.size > 0 && [...selection].some((cellId) => !group.cellIds.includes(cellId))
            return (
              <div key={group.id} className={`group-card ${group.visible ? '' : 'hidden-group'} ${isExpanded ? 'expanded' : ''}`}>
                <div className="group-card-summary">
                  <button
                    type="button"
                    className="group-expand"
                    onClick={() => toggleExpanded(group.id)}
                    title={isExpanded ? 'Hide group cells' : 'View group cells'}
                    aria-expanded={isExpanded}
                  >{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                  <div className="group-main">
                    <input
                      className="group-color"
                      type="color"
                      value={group.color}
                      onChange={(event) => setGroupColor(group.id, event.target.value)}
                      aria-label={`Color for ${group.name}`}
                    />
                    <div className="group-copy">
                      <input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} aria-label="Group name" />
                      <span>{group.cellIds.length} cells · {group.source === 'lineage' ? `lineage from ${group.rootCell}` : group.source}</span>
                    </div>
                  </div>
                  <div className="group-actions">
                    <button
                      onClick={() => addCellsToGroup(group.id, selection)}
                      disabled={!canAddSelection}
                      title="Add current selection to group"
                    ><UserPlus size={15} /></button>
                    <button onClick={() => updateGroup(group.id, { visible: !group.visible })} title={group.visible ? 'Hide group' : 'Show group'}>
                      {group.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    <button onClick={() => selectGroup(group.id)} title="Select all cells"><MousePointer2 size={15} /></button>
                    <button onClick={() => focusGroup(group.id)} title="Focus group"><Focus size={15} /></button>
                    <button onClick={() => deleteGroup(group.id)} title="Delete group"><Trash2 size={15} /></button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="group-members">
                    <div className="group-members-heading">
                      <span>Select cells to remove</span>
                      <button
                        type="button"
                        disabled={!markedCells.length}
                        onClick={() => {
                          removeCellsFromGroup(group.id, markedCells)
                        }}
                      >Remove selected{markedCells.length ? ` (${markedCells.length})` : ''}</button>
                    </div>
                    <div className="group-member-list">
                      {group.cellIds.map((cellId) => (
                        <label key={cellId}>
                          <input
                            type="checkbox"
                            checked={selection.has(cellId)}
                            onChange={() => toggleCell(cellId)}
                          />
                          <span>{cellId}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
