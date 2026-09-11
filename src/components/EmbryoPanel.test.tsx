import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import type { ColumnMapping, EmbryoDescriptor } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { EmbryoPanel } from './EmbryoPanel'

const mapping: ColumnMapping = {
  cellId: 'cell', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame',
}
const embryos: EmbryoDescriptor[] = [
  { id: 'e1', label: 'embryo 1', sourceName: 'a.csv', sourceEmbryoId: '1', color: '#3978c5' },
  { id: 'e2', label: 'embryo 2', sourceName: 'b.csv', sourceEmbryoId: '2', color: '#df7844' },
]
const dataset = buildDatasetFromRows([
  { embryoId: 'e1', cellId: 'AB', temporal: 1, x: 0, y: 0, z: 0 },
  { embryoId: 'e2', cellId: 'AB', temporal: 1, x: 1, y: 0, z: 0 },
], { name: 'pair', mapping, embryos })

beforeEach(() => {
  useExplorerStore.getState().setSettings({ interpolateMeanPositions: false, embryoViewMode: 'overlay' })
  useExplorerStore.getState().setDataset(dataset, resolveLineage(dataset.cells))
})

describe('embryo display selector', () => {
  it('precomputes and refreshes the mean cache when displayed embryos change', async () => {
    const view = render(<EmbryoPanel onClose={vi.fn()} />)
    expect(useExplorerStore.getState().activeEmbryoIds.size).toBe(2)
    fireEvent.click(screen.getByRole('checkbox', { name: /embryo 2/ }))
    expect([...useExplorerStore.getState().activeEmbryoIds]).toEqual(['e1'])

    fireEvent.click(screen.getByRole('checkbox', { name: /Color by embryo/ }))
    expect(useExplorerStore.getState().settings.colorByEmbryo).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Mean position' }))
    expect(useExplorerStore.getState().settings).toMatchObject({ embryoViewMode: 'mean', colorByEmbryo: false })
    expect(useExplorerStore.getState().meanPositionCacheStatus).toBe('loading')
    await waitFor(() => expect(useExplorerStore.getState().meanPositionCacheStatus).toBe('ready'))
    expect(useExplorerStore.getState().meanPositionCache?.frameIndex.get(1)?.[0].x).toBe(0)

    const interpolation = screen.getByRole('checkbox', { name: /Hold each embryo's last frame/ })
    fireEvent.click(interpolation)
    expect(useExplorerStore.getState().settings.interpolateMeanPositions).toBe(true)
    await waitFor(() => expect(useExplorerStore.getState().meanPositionCacheStatus).toBe('ready'))

    fireEvent.click(screen.getByRole('checkbox', { name: /embryo 2/ }))
    expect(useExplorerStore.getState().meanPositionCache).toBeUndefined()
    expect(useExplorerStore.getState().meanPositionCacheStatus).toBe('loading')
    await waitFor(() => expect(useExplorerStore.getState().meanPositionCacheStatus).toBe('ready'))
    expect(useExplorerStore.getState().meanPositionCache?.frameIndex.get(1)?.[0].x).toBe(0.5)

    view.unmount()
    useExplorerStore.getState().clearDataset()
    expect(useExplorerStore.getState().meanPositionCache).toBeUndefined()
    expect(useExplorerStore.getState().meanPositionCacheStatus).toBe('idle')
  })
})
