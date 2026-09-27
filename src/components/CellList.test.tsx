import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { CellList } from './CellList'

const dataset = buildDatasetFromRows(
  ['MS', 'MSa', 'MSapaaap', 'EMS', 'AB'].map((cellId, index) => ({ cellId, temporal: 1, x: index, y: 0, z: 0 })),
  { name: 'cell-search.csv', mapping: { cellId: 'cell', x: 'AP', y: 'LR', z: 'DV', frame: 'frame', playback: 'frame' } },
)

beforeEach(() => useExplorerStore.getState().setDataset(dataset, resolveLineage(dataset.cells)))
afterEach(cleanup)

describe('cell-list exact multi-search', () => {
  it('matches one cell exactly without showing descendants or containing names', () => {
    render(<CellList />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cells' }), { target: { value: 'ms' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('MS')
    expect(screen.queryByText('MSa')).not.toBeInTheDocument()
    expect(screen.queryByText('EMS')).not.toBeInTheDocument()
  })

  it('accepts a case-insensitive comma list, selects all matches, and warns without hiding them', () => {
    render(<CellList />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cells' }), {
      target: { value: 'msapaaap, eMs, not-a-cell, MSAPAAAP' },
    })
    const options = screen.getAllByRole('option')
    expect(options.map((option) => within(option).getByRole('checkbox').parentElement?.textContent)).toEqual(['MSapaaap', 'EMS'])
    expect(screen.getByRole('alert')).toHaveTextContent('Not found: not-a-cell')

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect([...useExplorerStore.getState().selection]).toEqual(['MSapaaap', 'EMS'])
    expect(options.every((option) => within(option).getByRole('checkbox').getAttribute('checked') !== null || (within(option).getByRole('checkbox') as HTMLInputElement).checked)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss missing-cell warning' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('supports the Chinese comma and reports an all-missing query', () => {
    render(<CellList />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cells' }), { target: { value: 'MS，AB' } })
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(expect.arrayContaining(['MS', 'AB']))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cells' }), { target: { value: 'missing' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No exact cell matches.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled()
  })
})
