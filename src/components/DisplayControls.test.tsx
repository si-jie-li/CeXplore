import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import type { ColumnMapping } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { DisplayControls } from './DisplayControls'

const mapping: ColumnMapping = {
  cellId: 'cell', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame',
}
const dataset = buildDatasetFromRows([
  { cellId: 'AB', temporal: 1, x: 0, y: 0, z: 0 },
  { cellId: 'ABa', temporal: 2, x: 1, y: 0, z: 0 },
], { name: 'trails.csv', mapping })

beforeEach(() => {
  const store = useExplorerStore.getState()
  store.setDataset(dataset, resolveLineage(dataset.cells))
  store.setSettings({
    showTrajectories: false,
    trailRangeMode: 'all',
    trailRangeStart: undefined,
    trailRangeEnd: undefined,
    trailGroupIds: 'all',
    trailWidth: 1.1,
  })
  store.setSelection(['AB'])
  useExplorerStore.getState().applyColor('#3978c5', true)
  useExplorerStore.getState().clearSelection()
})

describe('trail display controls', () => {
  it('defaults to all previous frames and all groups without requiring a live selection', () => {
    render(<DisplayControls />)
    const trails = screen.getByRole('button', { name: /Trails/ })
    expect(trails).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Trail range mode' })).toHaveValue('all')

    fireEvent.click(trails)
    expect(useExplorerStore.getState().settings.showTrajectories).toBe(true)
    expect(screen.getByText('All 1 groups')).toBeInTheDocument()

    const width = screen.getByRole('slider', { name: 'Trail width' })
    expect(width).toBeEnabled()
    fireEvent.change(width, { target: { value: '2.4' } })
    expect(useExplorerStore.getState().settings.trailWidth).toBe(2.4)

    fireEvent.change(screen.getByRole('combobox', { name: 'Trail range mode' }), {
      target: { value: 'custom' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Trail start frame' }), {
      target: { value: '2' },
    })
    expect(useExplorerStore.getState().settings).toMatchObject({
      trailRangeMode: 'custom',
      trailRangeStart: 2,
      trailRangeEnd: 2,
    })

    fireEvent.click(screen.getByRole('checkbox', { name: 'AB' }))
    expect(useExplorerStore.getState().settings.trailGroupIds).toEqual([])
  })
})
