import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import type { ColumnMapping } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { GroupPanel } from './GroupPanel'

const mapping: ColumnMapping = {
  cellId: 'cell', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame',
}
const dataset = buildDatasetFromRows([
  { cellId: 'ABp', temporal: 1, x: 0, y: 0, z: 0 },
  { cellId: 'ABpl', temporal: 1, x: 1, y: 0, z: 0 },
  { cellId: 'ABpr', temporal: 1, x: -1, y: 0, z: 0 },
], { name: 'groups.csv', mapping })

afterEach(cleanup)

beforeEach(() => {
  const store = useExplorerStore.getState()
  store.setDataset(dataset, resolveLineage(dataset.cells))
  const entries = [
    ['ABp', '#3978c5', 'AB family'],
    ['ABpl', '#df7844', 'left neuron'],
    ['ABpr', '#3f966c', 'right neuron'],
  ] as const
  for (const [cellId, color, name] of entries) {
    useExplorerStore.getState().setSelection([cellId])
    useExplorerStore.getState().applyColor(color, true)
    const group = useExplorerStore.getState().groups.at(-1)!
    useExplorerStore.getState().updateGroup(group.id, { name })
  }
})

describe('cell-group visibility controls', () => {
  it('filters names and changes visibility for all currently displayed groups', () => {
    render(<GroupPanel />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter groups by name' }), {
      target: { value: 'neuron' },
    })

    expect(screen.getByText('2/3 shown')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('AB family')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('left neuron')).toBeInTheDocument()
    expect(screen.getByDisplayValue('right neuron')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Make all displayed groups invisible'))
    expect(useExplorerStore.getState().groups.map((group) => group.visible)).toEqual([true, false, false])

    fireEvent.click(screen.getByTitle('Make all displayed groups visible'))
    expect(useExplorerStore.getState().groups.every((group) => group.visible)).toBe(true)
  })

  it('can reapply a group command to override a newer cell-level command', () => {
    render(<GroupPanel />)
    useExplorerStore.getState().setCellVisible('ABpl', false)
    useExplorerStore.getState().setCellTrailVisible('ABpl', false)

    fireEvent.click(screen.getByTitle('Make all displayed groups visible'))
    expect(useExplorerStore.getState().cellVisibility.ABpl).toBe(true)
    expect(useExplorerStore.getState().cellTrailVisibility.ABpl).toBe(true)
  })
})
