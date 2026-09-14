import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import type { ColumnMapping } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { CellInfo } from './CellInfo'

const mapping: ColumnMapping = {
  cellId: 'cell', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame',
}
const dataset = buildDatasetFromRows([
  { cellId: 'AB', temporal: 1, x: 0, y: 0, z: 0 },
  { cellId: 'ABa', temporal: 2, x: 1, y: 0, z: 0 },
], { name: 'cell-info.csv', mapping })

afterEach(cleanup)

beforeEach(() => {
  const store = useExplorerStore.getState()
  store.setDataset(dataset, resolveLineage(dataset.cells))
  store.setSettings({ showTrajectories: false })
  store.setInspectedCell('ABa')
})

describe('cell visibility actions', () => {
  it('keeps the inspected cell available while hiding and restoring its nucleus or trail', () => {
    render(<CellInfo />)

    fireEvent.click(screen.getByRole('button', { name: 'Hide cell ABa' }))
    expect(useExplorerStore.getState().cellVisibility.ABa).toBe(false)
    expect(screen.getAllByText('ABa').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Show cell ABa' }))
    expect(useExplorerStore.getState().cellVisibility.ABa).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Hide trail for ABa' }))
    expect(useExplorerStore.getState().cellTrailVisibility.ABa).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Show trail for ABa' }))
    expect(useExplorerStore.getState().cellTrailVisibility.ABa).toBe(true)
    expect(useExplorerStore.getState().settings.showTrajectories).toBe(true)
  })

  it('provides independent show-all and hide-all commands for cells and trails', () => {
    render(<CellInfo />)

    fireEvent.click(screen.getByRole('button', { name: 'Hide all cells' }))
    expect(Object.values(useExplorerStore.getState().cellVisibility).every((visible) => !visible)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show all cells' }))
    expect(Object.values(useExplorerStore.getState().cellVisibility).every(Boolean)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Hide all cell trails' }))
    expect(Object.values(useExplorerStore.getState().cellTrailVisibility).every((visible) => !visible)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show all cell trails' }))
    expect(Object.values(useExplorerStore.getState().cellTrailVisibility).every(Boolean)).toBe(true)
  })
})
