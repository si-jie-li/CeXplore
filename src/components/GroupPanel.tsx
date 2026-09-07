import { Focus, MousePointer2, Trash2, Eye, EyeOff } from 'lucide-react'
import { useExplorerStore } from '../state/explorerStore'

export function GroupPanel() {
  const groups = useExplorerStore((state) => state.groups)
  const updateGroup = useExplorerStore((state) => state.updateGroup)
  const setGroupColor = useExplorerStore((state) => state.setGroupColor)
  const deleteGroup = useExplorerStore((state) => state.deleteGroup)
  const selectGroup = useExplorerStore((state) => state.selectGroup)
  const focusGroup = useExplorerStore((state) => state.focusGroup)

  if (!groups.length) {
    return (
      <div className="groups-empty">
        <div className="empty-color-row"><i /><i /><i /></div>
        <strong>No saved groups yet</strong>
        <p>Select cells or a lineage, then choose a color. Colored selections are saved here by default.</p>
      </div>
    )
  }

  return (
    <div className="group-list">
      {groups.map((group) => (
        <div key={group.id} className={`group-card ${group.visible ? '' : 'hidden-group'}`}>
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
            <button onClick={() => updateGroup(group.id, { visible: !group.visible })} title={group.visible ? 'Hide group' : 'Show group'}>
              {group.visible ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button onClick={() => selectGroup(group.id)} title="Select all cells"><MousePointer2 size={15} /></button>
            <button onClick={() => focusGroup(group.id)} title="Focus group"><Focus size={15} /></button>
            <button onClick={() => deleteGroup(group.id)} title="Delete group"><Trash2 size={15} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}
