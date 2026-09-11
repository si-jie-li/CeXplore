import { useRef, useState } from 'react'
import { AlertTriangle, Download, Dna, FileJson, X } from 'lucide-react'
import { Embryo3D } from './components/Embryo3D'
import { FileLoader } from './components/FileLoader'
import { LineageTree } from './components/LineageTree'
import { ListPanel } from './components/ListPanel'
import { ControlDeck } from './components/ControlDeck'
import { AnalysisPanel } from './components/AnalysisPanel'
import { TrailProjectionPanel } from './components/TrailProjectionPanel'
import { ImportWarnings } from './components/ImportWarnings'
import { createSessionConfiguration, useExplorerStore } from './state/explorerStore'
import { formatBytes } from './utils/format'
import { downloadJson, readSessionFile } from './utils/session'

function EmptyWorkspace() {
  return (
    <main className="welcome">
      <div className="welcome-art" aria-hidden="true">
        <span className="orbit orbit-one" />
        <span className="orbit orbit-two" />
        <i className="nucleus n1" /><i className="nucleus n2" /><i className="nucleus n3" /><i className="nucleus n4" /><i className="nucleus n5" />
      </div>
      <div className="eyebrow">Lineage-linked 4D exploration</div>
      <h1>Follow cells through<br />embryonic development.</h1>
      <p>Load tracked nuclear positions, navigate the canonical lineage, and color populations to see how they move, separate, and converge.</p>
      <FileLoader />
      <div className="format-note"><span>CSV</span><span>TSV</span><span>XLSX</span> processed locally in your browser</div>
    </main>
  )
}

function AppHeader() {
  const sessionInput = useRef<HTMLInputElement>(null)
  const [sessionMessage, setSessionMessage] = useState('')
  const dataset = useExplorerStore((state) => state.dataset)!
  const lineage = useExplorerStore((state) => state.lineage)!
  const groups = useExplorerStore((state) => state.groups)
  const activeEmbryoIds = useExplorerStore((state) => state.activeEmbryoIds)
  const clearDataset = useExplorerStore((state) => state.clearDataset)
  const importConfiguration = useExplorerStore((state) => state.importConfiguration)

  const exportSession = () => {
    const configuration = createSessionConfiguration(useExplorerStore.getState())
    if (configuration) downloadJson(configuration, `${dataset.name.replace(/\.[^.]+$/, '')}.lineage-session.json`)
  }

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark"><Dna size={18} /></div>
        <div><strong>C. elegans</strong><span>Lineage Explorer Lite</span></div>
      </div>
      <div className="dataset-summary">
        <strong title={dataset.name}>{dataset.name}</strong>
        <span>{dataset.sources.length} file{dataset.sources.length === 1 ? '' : 's'} · {activeEmbryoIds.size}/{dataset.embryos.length} embryos shown · {dataset.cellIds.length} cells · {dataset.frameValues.length} {dataset.temporalMode === 'time' ? 'time frames' : 'frames'} · {formatBytes(dataset.sourceSize)}</span>
      </div>
      <div className="header-actions">
        <FileLoader compact />
        <button className="button secondary compact" onClick={exportSession} title="Export colors, groups, and display settings"><Download size={15} /> Session</button>
        <button className="button secondary compact" onClick={() => sessionInput.current?.click()} title="Import session configuration"><FileJson size={15} /> Import</button>
        <input
          ref={sessionInput}
          className="sr-only"
          type="file"
          accept=".json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void readSessionFile(file)
              .then((config) => setSessionMessage(importConfiguration(config).join(' ') || 'Session imported.'))
              .catch((error: unknown) => setSessionMessage(error instanceof Error ? error.message : 'Could not import session.'))
            event.target.value = ''
          }}
        />
        <button className="icon-button" onClick={clearDataset} title="Close dataset" aria-label="Close dataset"><X size={17} /></button>
      </div>
      {sessionMessage && <button className="session-message" onClick={() => setSessionMessage('')}>{sessionMessage} <X size={12} /></button>}
      <div className="status-pill"><i /> {groups.length ? `${groups.length} groups` : 'Ready'}</div>
      {lineage.unresolvedCellIds.length > 0 && <div className="header-unresolved"><AlertTriangle size={13} /> {lineage.unresolvedCellIds.length} unresolved</div>}
    </header>
  )
}

function LoadedWorkspace() {
  const dataset = useExplorerStore((state) => state.dataset)!
  return (
    <div className="app-shell">
      <AppHeader />
      <ImportWarnings warnings={dataset.warnings} resetKey={dataset} />
      <main className="workspace">
        <LineageTree />
        <Embryo3D />
        <ListPanel />
        <ControlDeck />
        <AnalysisPanel />
        <TrailProjectionPanel />
      </main>
    </div>
  )
}

export function App() {
  const dataset = useExplorerStore((state) => state.dataset)
  return dataset ? <LoadedWorkspace /> : (
    <div className="empty-shell">
      <header className="empty-header">
        <div className="brand">
          <div className="brand-mark"><Dna size={18} /></div>
          <div><strong>C. elegans</strong><span>Lineage Explorer Lite</span></div>
        </div>
        <span>Local scientific viewer · v0.1</span>
      </header>
      <EmptyWorkspace />
    </div>
  )
}
