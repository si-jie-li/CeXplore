import { X } from 'lucide-react'
import { useExplorerStore } from '../state/explorerStore'

export function EmbryoPanel({ onClose }: { onClose: () => void }) {
  const dataset = useExplorerStore((state) => state.dataset)!
  const active = useExplorerStore((state) => state.activeEmbryoIds)
  const settings = useExplorerStore((state) => state.settings)
  const meanPositionCacheStatus = useExplorerStore((state) => state.meanPositionCacheStatus)
  const meanPositionCacheError = useExplorerStore((state) => state.meanPositionCacheError)
  const setSettings = useExplorerStore((state) => state.setSettings)
  const prepareMeanPositions = useExplorerStore((state) => state.prepareMeanPositions)
  const setActiveEmbryos = useExplorerStore((state) => state.setActiveEmbryos)
  const toggleEmbryo = useExplorerStore((state) => state.toggleEmbryo)

  return (
    <aside className="embryo-selector" aria-label="Displayed embryos">
      <div className="embryo-selector-heading">
        <div><strong>Embryos</strong><span>{active.size} / {dataset.embryos.length} displayed</span></div>
        <button onClick={onClose} aria-label="Close embryo selector"><X size={13} /></button>
      </div>
      <div className="embryo-view-mode segmented" aria-label="Embryo position mode">
        <button
          className={settings.embryoViewMode === 'overlay' ? 'active' : ''}
          onClick={() => setSettings({ embryoViewMode: 'overlay' })}
        >Overlay</button>
        <button
          className={settings.embryoViewMode === 'mean' ? 'active' : ''}
          onClick={() => setSettings({ embryoViewMode: 'mean', colorByEmbryo: false })}
        >Mean position</button>
      </div>
      <label className="embryo-color-toggle">
        <input
          type="checkbox"
          checked={settings.colorByEmbryo}
          disabled={settings.embryoViewMode === 'mean'}
          onChange={(event) => setSettings({ colorByEmbryo: event.target.checked })}
        />
        Color by embryo
      </label>
      <div className="embryo-selector-actions">
        <span>Select embryos</span>
        <button onClick={() => setActiveEmbryos(dataset.embryos.map((embryo) => embryo.id))}>All</button>
      </div>
      <div className="embryo-display-list">
        {dataset.embryos.map((embryo) => {
          const checked = active.has(embryo.id)
          return (
            <label key={embryo.id} title={`${embryo.label} · ${embryo.sourceName}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={checked && active.size === 1}
                onChange={() => toggleEmbryo(embryo.id)}
              />
              <i style={{ background: embryo.color }} />
              <span><b>{embryo.label}</b><small>{embryo.sourceName}</small></span>
            </label>
          )
        })}
      </div>
      {settings.embryoViewMode === 'mean' && (
        <p>
          {meanPositionCacheStatus === 'loading'
            ? 'Calculating and caching all frames in the background…'
            : meanPositionCacheStatus === 'error'
              ? <>{meanPositionCacheError} <button type="button" onClick={prepareMeanPositions}>Retry</button></>
              : 'All frames are cached. Each cell is averaged across selected embryos available at that time.'}
        </p>
      )}
    </aside>
  )
}
