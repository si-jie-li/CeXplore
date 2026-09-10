import { beforeEach, describe, expect, it } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import type { ColumnMapping } from '../data/types'
import { resolveLineage } from '../lineage/lineageResolver'
import { getCellAppearance } from './cellAppearance'
import { useExplorerStore } from './explorerStore'

const mapping: ColumnMapping = { cellId: 'cell', x: 'x', y: 'y', z: 'z', frame: 'frame', playback: 'frame' }
const dataset = buildDatasetFromRows([
  { cellId: 'ABp', temporal: 1, x: 0, y: 0, z: 0 },
  { cellId: 'ABpl', temporal: 2, x: 1, y: 0, z: 0 },
  { cellId: 'ABpr', temporal: 2, x: -1, y: 0, z: 0 },
], { name: 'state.csv', mapping })
const lineage = resolveLineage(dataset.cells)

beforeEach(() => useExplorerStore.getState().setDataset(dataset, lineage))

describe('shared explorer state', () => {
  it('synchronizes lineage selection and persistent color groups', () => {
    const state = useExplorerStore.getState()
    state.selectLineage('ABp')
    expect([...useExplorerStore.getState().selection]).toEqual(expect.arrayContaining(['ABp', 'ABpl', 'ABpr']))
    useExplorerStore.getState().applyColor('#3978c5', true)
    const next = useExplorerStore.getState()
    expect(next.groups).toHaveLength(1)
    expect(next.groups[0].cellIds).toHaveLength(3)
    expect(next.cellColors.ABpl).toBe('#3978c5')
  })

  it('hides, recolors, selects, and deletes saved groups', () => {
    const state = useExplorerStore.getState()
    state.setSelection(['ABpl', 'ABpr'])
    useExplorerStore.getState().applyColor('#df7844', true)
    const group = useExplorerStore.getState().groups[0]
    useExplorerStore.getState().setGroupColor(group.id, '#3f966c')
    useExplorerStore.getState().updateGroup(group.id, { visible: false, name: 'Pair' })
    const hidden = useExplorerStore.getState()
    expect(hidden.groups[0]).toMatchObject({ name: 'Pair', visible: false, color: '#3f966c' })
    expect(getCellAppearance({
      cellId: 'ABpl', selection: hidden.selection, cellColors: hidden.cellColors,
      groups: hidden.groups, displayMode: 'highlight', unselectedOpacity: .1,
    }).visible).toBe(false)
    hidden.deleteGroup(group.id)
    expect(useExplorerStore.getState().groups).toHaveLength(0)
  })

  it('only adds whole lineages without replacing or toggling the existing selection', () => {
    const state = useExplorerStore.getState()
    state.setSelection(['ABpl'])
    state.selectLineage('ABpr')
    expect([...useExplorerStore.getState().selection]).toEqual(expect.arrayContaining(['ABpl', 'ABpr']))
    useExplorerStore.getState().selectLineage('ABpr')
    expect([...useExplorerStore.getState().selection]).toEqual(['ABpl', 'ABpr'])
  })

  it('merges repeated color assignments and supports explicit group additions and removals', () => {
    const state = useExplorerStore.getState()
    state.setSelection(['ABpl'])
    useExplorerStore.getState().applyColor('#3978c5', true)
    useExplorerStore.getState().setSelection(['ABpr'])
    useExplorerStore.getState().applyColor('#3978c5', true)

    let group = useExplorerStore.getState().groups[0]
    expect(useExplorerStore.getState().groups).toHaveLength(1)
    expect(group.cellIds).toEqual(['ABpl', 'ABpr'])

    useExplorerStore.getState().addCellsToGroup(group.id, ['ABp'])
    group = useExplorerStore.getState().groups[0]
    expect(group.cellIds).toEqual(['ABpl', 'ABpr', 'ABp'])
    expect(useExplorerStore.getState().cellColors.ABp).toBe('#3978c5')

    useExplorerStore.getState().removeCellsFromGroup(group.id, ['ABpr'])
    group = useExplorerStore.getState().groups[0]
    expect(group).toMatchObject({ cellIds: ['ABpl', 'ABp'], source: 'manual', rootCell: undefined })
    expect(useExplorerStore.getState().cellColors.ABpr).toBeUndefined()

    useExplorerStore.getState().setSelection(['ABpr'])
    useExplorerStore.getState().applyColor('#df7844', true)
    const second = useExplorerStore.getState().groups[1]
    useExplorerStore.getState().setGroupColor(second.id, '#3978c5')
    expect(useExplorerStore.getState().groups).toHaveLength(1)
    expect(useExplorerStore.getState().groups[0].cellIds).toEqual(['ABpr', 'ABpl', 'ABp'])
  })

  it('imports readable group entries by cell name and merges matching colors', () => {
    const state = useExplorerStore.getState()
    state.setSelection(['ABpl'])
    useExplorerStore.getState().applyColor('#3978c5', true)
    const warnings = useExplorerStore.getState().importGroupList('another.tsv', [
      {
        name: 'Imported blue', color: '#3978c5', cells: ['ABpr', 'missing'],
        visible: true, source: 'manual',
      },
      {
        name: 'Green root', color: '#3f966c', cells: ['ABp'],
        visible: false, source: 'lineage', rootCell: 'ABp',
      },
    ])

    expect(warnings.join(' ')).toMatch(/another\.tsv.*unknown cell/)
    expect(useExplorerStore.getState().groups).toHaveLength(2)
    expect(useExplorerStore.getState().groups[0].cellIds).toEqual(['ABpl', 'ABpr'])
    expect(useExplorerStore.getState().groups[1]).toMatchObject({
      name: 'Green root', color: '#3f966c', cellIds: ['ABp'], visible: false,
      source: 'lineage', rootCell: 'ABp',
    })
  })

  it('does not issue a camera reset when playback moves to another frame', () => {
    const before = useExplorerStore.getState().cameraCommand
    useExplorerStore.getState().stepFrame(1)
    useExplorerStore.getState().setCurrentFrameIndex(0)
    expect(useExplorerStore.getState().cameraCommand).toEqual(before)

    useExplorerStore.getState().resetCamera()
    expect(useExplorerStore.getState().cameraCommand.nonce).toBe(before.nonce + 1)

    useExplorerStore.getState().setCameraAngle({ azimuthDegrees: 90, elevationDegrees: 20, rollDegrees: 35 })
    expect(useExplorerStore.getState().cameraCommand).toMatchObject({
      type: 'angle',
      azimuthDegrees: 90,
      elevationDegrees: 20,
      rollDegrees: 35,
      nonce: before.nonce + 2,
    })
  })
})
