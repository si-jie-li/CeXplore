import { useState } from 'react'
import { CellList } from './CellList'
import { GroupPanel } from './GroupPanel'
import { useExplorerStore } from '../state/explorerStore'

export function ListPanel() {
  const [tab, setTab] = useState<'cells' | 'groups'>('cells')
  const dataset = useExplorerStore((state) => state.dataset)!
  const groups = useExplorerStore((state) => state.groups)
  return (
    <section className="panel list-panel">
      <div className="tab-bar">
        <button className={tab === 'cells' ? 'active' : ''} onClick={() => setTab('cells')}>Cells <span>{dataset.cellIds.length}</span></button>
        <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Cell groups <span>{groups.length}</span></button>
      </div>
      <div className="tab-content">{tab === 'cells' ? <CellList /> : <GroupPanel />}</div>
    </section>
  )
}
