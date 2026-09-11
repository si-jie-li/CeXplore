import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import type { ColumnMapping } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { TrailProjectionPanel } from './TrailProjectionPanel'

const mapping: ColumnMapping = {
  cellId: 'cell', x: 'AP', y: 'LR', z: 'VD', frame: 'frame', playback: 'frame',
}
const dataset = buildDatasetFromRows([
  { cellId: 'AB', temporal: 1, x: 0, y: 0, z: 0 },
  { cellId: 'AB', temporal: 2, x: 2, y: 1, z: 3 },
  { cellId: 'P1', temporal: 1, x: 4, y: 4, z: 4 },
  { cellId: 'P1', temporal: 2, x: 5, y: 6, z: 8 },
  { cellId: 'ABa', temporal: 3, x: 3, y: 2, z: 4 },
  { cellId: 'ABp', temporal: 3, x: 3, y: 0, z: 2 },
], { name: 'projection.csv', mapping })

beforeEach(() => {
  const state = useExplorerStore.getState()
  state.setDataset(dataset, resolveLineage(dataset.cells))
  state.setCurrentFrameIndex(2)
  state.setSelection(['AB'])
  useExplorerStore.getState().applyColor('#3978c5', true)
  useExplorerStore.getState().setSelection(['P1'])
  useExplorerStore.getState().applyColor('#df7844', true)
})

describe('projected group motion drawer', () => {
  it('uses group colors, axis line styles, and independent group/axis filters', () => {
    const { container } = render(<TrailProjectionPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Projected motion/ }))

    expect(screen.getByRole('img', { name: 'Projected group motion chart' })).toBeInTheDocument()
    const curves = () => [...container.querySelectorAll('.projection-series-line')]
    expect(curves()).toHaveLength(6)
    expect(curves().filter((path) => path.getAttribute('stroke') === '#3978c5')).toHaveLength(3)
    expect(curves().map((path) => path.getAttribute('stroke-dasharray'))).toEqual([
      null, '1 6', '14 7', null, '1 6', '14 7',
    ])

    fireEvent.click(screen.getByRole('checkbox', { name: 'P1' }))
    expect(curves()).toHaveLength(3)
    fireEvent.click(screen.getByRole('checkbox', { name: /LR · dotted/ }))
    expect(curves()).toHaveLength(2)
  })

  it('uses solid lines in single-axis mode and supports interactive zoom', () => {
    const { container } = render(<TrailProjectionPanel />)
    const view = within(container)
    fireEvent.click(view.getByRole('button', { name: /Projected motion/ }))
    fireEvent.click(view.getByRole('button', { name: 'Single axis' }))
    const curves = [...container.querySelectorAll('.projection-series-line')]
    expect(curves).toHaveLength(2)
    expect(curves.every((path) => !path.getAttribute('stroke-dasharray'))).toBe(true)
    fireEvent.click(view.getByRole('radio', { name: /LR · solid/ }))
    const chart = view.getByRole('img', { name: 'Projected group motion chart' })
    fireEvent.wheel(chart, { clientX: 400, clientY: 140, deltaY: -100 })
    expect(view.getByRole('button', { name: /Reset zoom/ })).toBeEnabled()
  })

  it('draws mother-to-daughter forks for individual cell projections', () => {
    const blueGroup = useExplorerStore.getState().groups[0]
    useExplorerStore.getState().addCellsToGroup(blueGroup.id, ['ABa', 'ABp'])
    const { container } = render(<TrailProjectionPanel />)
    fireEvent.click(within(container).getByRole('button', { name: /Projected motion/ }))
    fireEvent.click(within(container).getByRole('checkbox', { name: 'Show individual cell projections' }))
    expect(container.querySelectorAll('.projection-division-connector')).toHaveLength(6)
    fireEvent.mouseMove(container.querySelector('.projection-hit-line')!, { clientX: 300, clientY: 120 })
    expect(container.querySelector('.projection-tooltip')).toHaveTextContent(/AB/)
  })
})
