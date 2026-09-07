import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import type { ColumnMapping } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { getCellAppearance } from '../state/cellAppearance'
import { useExplorerStore } from '../state/explorerStore'
import { LineageTree } from './LineageTree'
import { ListPanel } from './ListPanel'
import { PlaybackControls } from './PlaybackControls'

const mapping: ColumnMapping = { cellId: 'cell', x: 'x', y: 'y', z: 'z', frame: 'frame', playback: 'frame' }
const dataset = buildDatasetFromRows([
  { cellId: 'ABp', temporal: 1, x: 0, y: 0, z: 0 },
  { cellId: 'ABpl', temporal: 2, x: 1, y: 0, z: 0 },
  { cellId: 'ABpr', temporal: 2, x: -1, y: 0, z: 0 },
], { name: 'sync.csv', mapping })

beforeEach(() => useExplorerStore.getState().setDataset(dataset, resolveLineage(dataset.cells)))

describe('linked interactions', () => {
  it('propagates a tree lineage selection into the list, colors, and saved groups', () => {
    render(<><LineageTree /><ListPanel /></>)
    fireEvent.click(screen.getByRole('button', { name: /Lineage/ }))
    fireEvent.click(screen.getAllByText('ABp')[0])

    expect(useExplorerStore.getState().selection.size).toBe(3)
    expect(screen.getByRole('checkbox', { name: /ABpl/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Assign #3978c5' }))
    expect(useExplorerStore.getState().groups[0].cellIds).toEqual(expect.arrayContaining(['ABp', 'ABpl', 'ABpr']))

    const state = useExplorerStore.getState()
    expect(getCellAppearance({
      cellId: 'ABpl', selection: state.selection, cellColors: state.cellColors,
      groups: state.groups, displayMode: 'highlight', unselectedOpacity: .1,
    }).color).toBe('#3978c5')

    fireEvent.click(screen.getByRole('button', { name: /Cell groups/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Group name' }), { target: { value: 'ABp family' } })
    fireEvent.click(screen.getByTitle('Hide group'))
    expect(useExplorerStore.getState().groups[0]).toMatchObject({ name: 'ABp family', visible: false })
  })

  it('steps and scrubs authoritative frame values', () => {
    render(<PlaybackControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }))
    expect(useExplorerStore.getState().currentFrameIndex).toBe(1)
    fireEvent.change(screen.getByRole('slider', { name: 'Timeline' }), { target: { value: '0' } })
    expect(useExplorerStore.getState().currentFrameIndex).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Previous frame' }))
    expect(useExplorerStore.getState().currentFrameIndex).toBe(1)
  })
})
