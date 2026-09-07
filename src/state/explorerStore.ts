import { create } from 'zustand'
import type { EmbryoDataset, Observation } from '../data/types'
import { getDescendants, type LineageModel } from '../lineage/lineageResolver'

export type DisplayMode = 'color' | 'isolate' | 'highlight'
export type TrailLength = 5 | 10 | 25 | 'all'
export type SelectionKind = 'manual' | 'cell' | 'lineage' | 'group'

export interface SelectionMeta {
  kind: SelectionKind
  rootCell?: string
  groupId?: string
}

export interface CellGroup {
  id: string
  name: string
  color: string
  cellIds: string[]
  visible: boolean
  source: SelectionKind
  rootCell?: string
  createdAt: number
}

export interface ExplorerSettings {
  displayMode: DisplayMode
  nucleusSize: number
  unselectedOpacity: number
  showLabels: boolean
  showAxes: boolean
  showTrajectories: boolean
  trailLength: TrailLength
}

interface ExplorerState {
  dataset?: EmbryoDataset
  lineage?: LineageModel
  currentFrameIndex: number
  playing: boolean
  playbackSpeed: number
  selection: Set<string>
  selectionMeta: SelectionMeta
  cellColors: Record<string, string>
  groups: CellGroup[]
  inspectedCellId?: string
  hoveredObservation?: Observation
  settings: ExplorerSettings
  cameraCommand: { type: 'reset' | 'focus'; nonce: number }
  setDataset: (dataset: EmbryoDataset, lineage: LineageModel) => void
  clearDataset: () => void
  setCurrentFrameIndex: (index: number) => void
  stepFrame: (delta: number) => void
  setPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setSelection: (cellIds: Iterable<string>, meta?: SelectionMeta) => void
  toggleCell: (cellId: string) => void
  selectLineage: (cellId: string) => void
  clearSelection: () => void
  applyColor: (color: string, saveAsGroup?: boolean) => void
  setInspectedCell: (cellId?: string) => void
  setHoveredObservation: (observation?: Observation) => void
  updateGroup: (id: string, patch: Partial<Pick<CellGroup, 'name' | 'visible'>>) => void
  setGroupColor: (id: string, color: string) => void
  deleteGroup: (id: string) => void
  selectGroup: (id: string) => void
  focusGroup: (id: string) => void
  setSettings: (patch: Partial<ExplorerSettings>) => void
  resetCamera: () => void
  focusSelection: () => void
  importConfiguration: (config: SessionConfiguration) => string[]
}

export interface SessionConfiguration {
  version: 1
  datasetName: string
  mapping: EmbryoDataset['mapping']
  cellColors: Record<string, string>
  groups: CellGroup[]
  settings: ExplorerSettings
}

const defaultSettings: ExplorerSettings = {
  displayMode: 'highlight',
  nucleusSize: 0.34,
  unselectedOpacity: 0.13,
  showLabels: false,
  showAxes: true,
  showTrajectories: false,
  trailLength: 10,
}

const groupId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `group-${Date.now()}-${Math.random().toString(36).slice(2)}`

const colorsFromGroups = (groups: CellGroup[]) => {
  const colors: Record<string, string> = {}
  for (const group of groups) for (const id of group.cellIds) colors[id] = group.color
  return colors
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  currentFrameIndex: 0,
  playing: false,
  playbackSpeed: 1,
  selection: new Set(),
  selectionMeta: { kind: 'manual' },
  cellColors: {},
  groups: [],
  settings: defaultSettings,
  cameraCommand: { type: 'reset', nonce: 0 },

  setDataset: (dataset, lineage) =>
    set({
      dataset,
      lineage,
      currentFrameIndex: 0,
      playing: false,
      selection: new Set(),
      selectionMeta: { kind: 'manual' },
      cellColors: {},
      groups: [],
      inspectedCellId: undefined,
      hoveredObservation: undefined,
      cameraCommand: { type: 'reset', nonce: get().cameraCommand.nonce + 1 },
    }),
  clearDataset: () =>
    set({
      dataset: undefined,
      lineage: undefined,
      currentFrameIndex: 0,
      playing: false,
      selection: new Set(),
      cellColors: {},
      groups: [],
      inspectedCellId: undefined,
    }),
  setCurrentFrameIndex: (index) => {
    const last = Math.max((get().dataset?.frameValues.length ?? 1) - 1, 0)
    set({ currentFrameIndex: Math.max(0, Math.min(Math.round(index), last)) })
  },
  stepFrame: (delta) => {
    const state = get()
    const last = Math.max((state.dataset?.frameValues.length ?? 1) - 1, 0)
    const next = state.currentFrameIndex + delta
    set({ currentFrameIndex: next > last ? 0 : next < 0 ? last : next })
  },
  setPlaying: (playing) => set({ playing }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setSelection: (cellIds, meta = { kind: 'manual' }) => {
    const valid = get().dataset?.cells
    const selection = new Set([...cellIds].filter((id) => valid?.has(id)))
    set({ selection, selectionMeta: meta, inspectedCellId: selection.size === 1 ? [...selection][0] : undefined })
  },
  toggleCell: (cellId) => {
    const selection = new Set(get().selection)
    if (selection.has(cellId)) selection.delete(cellId)
    else selection.add(cellId)
    set({ selection, selectionMeta: { kind: 'manual' }, inspectedCellId: cellId })
  },
  selectLineage: (cellId) => {
    const lineage = get().lineage
    if (!lineage) return
    const descendants = getDescendants(lineage, cellId, true)
    set({
      selection: new Set(descendants),
      selectionMeta: { kind: 'lineage', rootCell: cellId },
      inspectedCellId: cellId,
    })
  },
  clearSelection: () => set({ selection: new Set(), selectionMeta: { kind: 'manual' } }),
  applyColor: (color, saveAsGroup = true) => {
    const state = get()
    if (!state.selection.size) return
    const ids = [...state.selection]
    const cellColors = { ...state.cellColors }
    for (const id of ids) cellColors[id] = color
    if (!saveAsGroup) {
      set({ cellColors })
      return
    }
    const root = state.selectionMeta.rootCell
    const baseName =
      state.selectionMeta.kind === 'lineage' && root
        ? `${root} descendants`
        : ids.length === 1
          ? ids[0]
          : `Cell group ${state.groups.length + 1}`
    const group: CellGroup = {
      id: groupId(),
      name: baseName,
      color,
      cellIds: ids,
      visible: true,
      source: state.selectionMeta.kind,
      rootCell: root,
      createdAt: Date.now(),
    }
    set({ cellColors, groups: [...state.groups, group] })
  },
  setInspectedCell: (inspectedCellId) => set({ inspectedCellId }),
  setHoveredObservation: (hoveredObservation) => set({ hoveredObservation }),
  updateGroup: (id, patch) =>
    set((state) => ({ groups: state.groups.map((group) => (group.id === id ? { ...group, ...patch } : group)) })),
  setGroupColor: (id, color) =>
    set((state) => {
      const groups = state.groups.map((group) => (group.id === id ? { ...group, color } : group))
      return { groups, cellColors: colorsFromGroups(groups) }
    }),
  deleteGroup: (id) =>
    set((state) => {
      const groups = state.groups.filter((group) => group.id !== id)
      return { groups, cellColors: colorsFromGroups(groups) }
    }),
  selectGroup: (id) => {
    const group = get().groups.find((item) => item.id === id)
    if (group) set({ selection: new Set(group.cellIds), selectionMeta: { kind: 'group', groupId: id } })
  },
  focusGroup: (id) => {
    get().selectGroup(id)
    set((state) => ({ cameraCommand: { type: 'focus', nonce: state.cameraCommand.nonce + 1 } }))
  },
  setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  resetCamera: () =>
    set((state) => ({ cameraCommand: { type: 'reset', nonce: state.cameraCommand.nonce + 1 } })),
  focusSelection: () =>
    set((state) => ({ cameraCommand: { type: 'focus', nonce: state.cameraCommand.nonce + 1 } })),
  importConfiguration: (config) => {
    const dataset = get().dataset
    if (!dataset) return ['Load the source dataset before importing its configuration.']
    const warnings: string[] = []
    if (config.datasetName !== dataset.name) warnings.push('The configuration was created for a different filename.')
    const validIds = new Set(dataset.cellIds)
    const groups = (config.groups ?? []).map((group) => ({
      ...group,
      cellIds: group.cellIds.filter((id) => validIds.has(id)),
    })).filter((group) => group.cellIds.length)
    const cellColors = Object.fromEntries(
      Object.entries(config.cellColors ?? {}).filter(([id]) => validIds.has(id)),
    )
    set({ groups, cellColors, settings: { ...defaultSettings, ...config.settings } })
    return warnings
  },
}))

export function createSessionConfiguration(state: ExplorerState): SessionConfiguration | undefined {
  if (!state.dataset) return undefined
  return {
    version: 1,
    datasetName: state.dataset.name,
    mapping: state.dataset.mapping,
    cellColors: state.cellColors,
    groups: state.groups,
    settings: state.settings,
  }
}
