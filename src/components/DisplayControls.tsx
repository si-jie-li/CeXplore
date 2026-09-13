import { Axis3D, Eye, Route, Tags } from 'lucide-react'
import { useExplorerStore, type DisplayMode } from '../state/explorerStore'
import { resolveTrailGroups } from '../state/trails'

export function DisplayControls() {
  const settings = useExplorerStore((state) => state.settings)
  const setSettings = useExplorerStore((state) => state.setSettings)
  const selectionSize = useExplorerStore((state) => state.selection.size)
  const groups = useExplorerStore((state) => state.groups)
  const dataset = useExplorerStore((state) => state.dataset)
  const selectedTrailGroups = resolveTrailGroups(groups, settings.trailGroupIds)
  const visibleTrailGroupCount = selectedTrailGroups.filter((group) => group.visible).length
  const extraTrailGroupCount = selectedTrailGroups.length - visibleTrailGroupCount
  const firstStep = dataset?.frameValues[0] ?? 0
  const lastStep = dataset?.frameValues.at(-1) ?? firstStep
  const stepName = dataset?.temporalMode === 'time' ? 'time' : 'frame'

  const toggleTrailGroup = (groupId: string) => {
    if (groups.find((group) => group.id === groupId)?.visible) return
    const currentIds = settings.trailGroupIds === 'all'
      ? groups.filter((group) => !group.visible).map((group) => group.id)
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
          value={settings.trailRangeMode}
          onChange={(event) => setSettings(event.target.value === 'custom'
            ? {
                trailRangeMode: 'custom',
                trailRangeStart: settings.trailRangeStart ?? firstStep,
                trailRangeEnd: settings.trailRangeEnd ?? lastStep,
              }
            : { trailRangeMode: event.target.value as 'all' | 'previous' })}
          disabled={!settings.showTrajectories}
          aria-label="Trail range mode"
        >
          <option value="all">All previous</option>
          <option value="previous">Previous N frames</option>
          <option value="custom">{dataset?.temporalMode === 'time' ? 'Time range' : 'Frame range'}</option>
        </select>
        {settings.showTrajectories && settings.trailRangeMode === 'previous' && (
          <label className="trail-previous-input">
            <input
              type="number"
              min="1"
              step="1"
              value={settings.trailPreviousFrames}
              aria-label="Previous frame count"
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value)) setSettings({ trailPreviousFrames: Math.max(1, Math.floor(value)) })
              }}
            />
            <span>frames</span>
          </label>
        )}
        {settings.showTrajectories && settings.trailRangeMode === 'custom' && (
          <div className="trail-range-inputs">
            <input
              type="number"
              min={firstStep}
              max={lastStep}
              step="any"
              value={settings.trailRangeStart ?? firstStep}
              aria-label={`Trail start ${stepName}`}
              title={`Trail start ${stepName}`}
              onChange={(event) => {
                if (event.target.value !== '') setSettings({ trailRangeStart: Number(event.target.value) })
              }}
            />
            <span>–</span>
            <input
              type="number"
              min={firstStep}
              max={lastStep}
              step="any"
              value={settings.trailRangeEnd ?? lastStep}
              aria-label={`Trail end ${stepName}`}
              title={`Trail end ${stepName}`}
              onChange={(event) => {
                if (event.target.value !== '') setSettings({ trailRangeEnd: Number(event.target.value) })
              }}
            />
          </div>
        )}
        {settings.showTrajectories && groups.length > 0 && (
          <details className="trail-group-picker">
            <summary>
              {`${visibleTrailGroupCount} visible${extraTrailGroupCount ? ` + ${extraTrailGroupCount} extra` : ''}`}
            </summary>
            <div className="trail-group-menu">
              <div>
                <span>Visible + extras</span>
                <button type="button" onClick={() => setSettings({ trailGroupIds: 'all' })}>All extras</button>
                <button type="button" onClick={() => setSettings({ trailGroupIds: [] })}>Clear extras</button>
              </div>
              {groups.map((group) => (
                <label key={group.id} title={group.visible ? 'Included because this group is visible' : 'Add this hidden group to Trails'}>
                  <input
                    type="checkbox"
                    checked={group.visible || settings.trailGroupIds === 'all' || settings.trailGroupIds.includes(group.id)}
                    disabled={group.visible}
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
