import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import type { ColumnMapping } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import type { GroupAnalysisRequest } from '../analysis/types'
import { AnalysisPanel } from './AnalysisPanel'

const startGroupAnalysis = vi.hoisted(() => vi.fn((_request: GroupAnalysisRequest) => ({ promise: new Promise(() => undefined), cancel: vi.fn() })))
vi.mock('../analysis/analysisService', () => ({ startGroupAnalysis }))

const mapping: ColumnMapping = { cellId: 'cell', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame' }
const dataset = buildDatasetFromRows([
  { cellId: 'AB', temporal: 1, x: 0, y: 0, z: 0 },
  { cellId: 'EMS', temporal: 1, x: 1, y: 0, z: 0 },
  { cellId: 'P2', temporal: 1, x: 0, y: 1, z: 0 },
  { cellId: 'ABa', temporal: 2, x: 0, y: 0, z: 1 },
], { name: 'tiny', mapping })

beforeEach(() => {
  startGroupAnalysis.mockClear()
  useExplorerStore.getState().setDataset(dataset, resolveLineage(dataset.cells))
  useExplorerStore.getState().setSelection(['AB'], { kind: 'cell', rootCell: 'AB' })
})

describe('on-demand analysis panel', () => {
  it('does not calculate until the user presses Run analysis', () => {
    render(<AnalysisPanel />)
    expect(startGroupAnalysis).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /group analysis/i }))
    expect(startGroupAnalysis).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }))
    expect(startGroupAnalysis).toHaveBeenCalledTimes(1)
    expect(startGroupAnalysis.mock.calls[0][0].embryoIds).toEqual(['embryo-1'])
  })
})
