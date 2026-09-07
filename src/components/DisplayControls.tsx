import { Axis3D, Eye, Route, Tags } from 'lucide-react'
import { useExplorerStore, type DisplayMode, type TrailLength } from '../state/explorerStore'

export function DisplayControls() {
  const settings = useExplorerStore((state) => state.settings)
  const setSettings = useExplorerStore((state) => state.setSettings)
  const selectionSize = useExplorerStore((state) => state.selection.size)
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
      </div>
      <div className="toggle-row">
        <button className={settings.showTrajectories ? 'active' : ''} onClick={() => setSettings({ showTrajectories: !settings.showTrajectories })} disabled={!selectionSize}><Route size={15} /> Trails</button>
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
        <button className={settings.showLabels ? 'active' : ''} onClick={() => setSettings({ showLabels: !settings.showLabels })}><Tags size={15} /> Labels</button>
        <button className={settings.showAxes ? 'active' : ''} onClick={() => setSettings({ showAxes: !settings.showAxes })}><Axis3D size={15} /> Axes</button>
        <span className="display-note"><Eye size={14} /> several groups can remain visible</span>
      </div>
    </div>
  )
}
