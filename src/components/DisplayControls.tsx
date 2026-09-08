import { Axis3D, Eye, Route, Tags } from 'lucide-react'
import { useExplorerStore, type DisplayMode, type TrailLength } from '../state/explorerStore'
import { resolveTrailGroups } from '../state/trails'

export function DisplayControls() {
  const settings = useExplorerStore((state) => state.settings)
  const setSettings = useExplorerStore((state) => state.setSettings)
  const selectionSize = useExplorerStore((state) => state.selection.size)
  const groups = useExplorerStore((state) => state.groups)
  const selectedTrailGroups = resolveTrailGroups(groups, settings.trailGroupIds)

  const toggleTrailGroup = (groupId: string) => {
    const currentIds = settings.trailGroupIds === 'all'
      ? groups.map((group) => group.id)
      : settings.trailGroupIds
    setSettings({
      trailGroupIds: currentIds.includes(groupId)
        ? currentIds.filter((id) => id !== groupId)
        : [...currentIds, groupId],
    })
  }

  return (
    <div className="display-controls">
      <div className="mode-control">
        <span>Display</span>
        <div className="segmented">
          {([
            ['color', 'Color groups'],
            ['highlight', 'Highlight'],
            ['isolate', 'Isolate'],
          ] as [DisplayMode, string][]).map(([value, label]) => (
            <button key={value} className={settings.displayMode === value ? 'active' : ''} onClick={() => setSettings({ displayMode: value })}>{label}</button>
          ))}
        </div>
      </div>
      <div className="settings-grid">
        <label className="range-setting">
          <span>Nucleus size <b>{settings.nucleusSize.toFixed(2)}</b></span>
          <input type="range" min="0.05" max="0.75" step="0.01" value={settings.nucleusSize} onChange={(event) => setSettings({ nucleusSize: Number(event.target.value) })} />
        </label>
        <label className="range-setting">
          <span>Background opacity <b>{Math.round(settings.unselectedOpacity * 100)}%</b></span>
          <input type="range" min="0.03" max="0.5" step="0.01" value={settings.unselectedOpacity} onChange={(event) => setSettings({ unselectedOpacity: Number(event.target.value) })} />
        </label>
        <label className="range-setting">
          <span>Trail width <b>{settings.trailWidth.toFixed(1)} px</b></span>
          <input
            type="range"
            min="0.5"
            max="4"
            step="0.1"
            value={settings.trailWidth}
            disabled={!settings.showTrajectories}
            aria-label="Trail width"
            onChange={(event) => setSettings({ trailWidth: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="toggle-row">
        <button
          className={settings.showTrajectories ? 'active' : ''}
          onClick={() => setSettings({ showTrajectories: !settings.showTrajectories })}
          disabled={!selectionSize && !groups.length}
        ><Route size={15} /> Trails</button>
        <select
          value={settings.trailLength}
          onChange={(event) => setSettings({ trailLength: event.target.value === 'all' ? 'all' : Number(event.target.value) as TrailLength })}
          disabled={!settings.showTrajectories}
          aria-label="Trail length"
        >
          <option value={5}>5 frames</option>
          <option value={10}>10 frames</option>
          <option value={25}>25 frames</option>
          <option value="all">All previous</option>
        </select>
        {settings.showTrajectories && groups.length > 0 && (
          <details className="trail-group-picker">
            <summary>
              {settings.trailGroupIds === 'all'
                ? `All ${groups.length} groups`
                : `${selectedTrailGroups.length}/${groups.length} groups`}
            </summary>
            <div className="trail-group-menu">
              <div>
                <span>Trail groups</span>
                <button type="button" onClick={() => setSettings({ trailGroupIds: 'all' })}>All</button>
                <button type="button" onClick={() => setSettings({ trailGroupIds: [] })}>None</button>
              </div>
              {groups.map((group) => (
                <label key={group.id}>
                  <input
                    type="checkbox"
                    checked={settings.trailGroupIds === 'all' || settings.trailGroupIds.includes(group.id)}
                    onChange={() => toggleTrailGroup(group.id)}
                  />
                  <i style={{ background: group.color }} />
                  <span>{group.name}</span>
                </label>
              ))}
            </div>
          </details>
        )}
        <button className={settings.showLabels ? 'active' : ''} onClick={() => setSettings({ showLabels: !settings.showLabels })}><Tags size={15} /> Labels</button>
        <button className={settings.showAxes ? 'active' : ''} onClick={() => setSettings({ showAxes: !settings.showAxes })}><Axis3D size={15} /> Axes</button>
        <span className="display-note"><Eye size={14} /> several groups can remain visible</span>
      </div>
    </div>
  )
}
