import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export function ImportWarnings({ warnings, resetKey }: { warnings: string[]; resetKey: unknown }) {
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => setDismissed(false), [resetKey])
  if (!warnings.length || dismissed) return null
  return (
    <details className="warning-strip">
      <summary>
        <AlertTriangle size={14} /> Imported with {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        <button
          type="button"
          className="warning-dismiss"
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); setDismissed(true) }}
          aria-label="Dismiss import warnings"
          title="Dismiss warnings"
        ><X size={12} /></button>
      </summary>
      <div className="warning-list">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>
    </details>
  )
}
