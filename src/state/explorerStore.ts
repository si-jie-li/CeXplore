import { create } from 'zustand'
import type { EmbryoDataset, Observation } from '../data/types'
import { hydrateMeanPositionCache, type EmbryoViewMode, type MeanPositionCache } from '../data/embryoView'
import { startMeanPositionPrecomputation, type MeanPositionJob } from '../data/meanPositionService'
import { getDescendants, type LineageModel } from '../lineage/lineageResolver'
import type { CameraAngle } from './camera'
import type { TrailGroupSelection, TrailRangeMode } from './trails'
import type { GroupListEntry } from '../utils/groupList'

export type DisplayMode = 'color' | 'isolate' | 'highlight'
export type SelectionKind = 'manual' | 'cell' | 'lineage' | 'group'
export type MeanPositionCacheStatus = 'idle' | 'loading' | 'ready' | 'error'
export type CameraCommand =
  | { type: 'reset'; nonce: number }
  | { type: 'focus'; nonce: number }
  | ({ type: 'angle'; nonce: number } & CameraAngle)

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
  trailRangeMode: TrailRangeMode
  trailRangeStart?: number
  trailRangeEnd?: number
  trailPreviousFrames: number
  trailGroupIds: TrailGroupSelection
  trailWidth: number
  embryoViewMode: EmbryoViewMode
  colorByEmbryo: boolean
  interpolateMeanPositions: boolean
}

interface ExplorerState {
  dataset?: EmbryoDataset
  lineage?: LineageModel
  currentFrameIndex: number
  playing: boolean
  playbackSpeed: number
  activeEmbryoIds: Set<string>
  selection: Set<string>
  selectionMeta: SelectionMeta
  cellColors: Record<string, string>
  groups: CellGroup[]
  inspectedCellId?: string
  hoveredObservation?: Observation
  settings: ExplorerSettings
  meanPositionCache?: MeanPositionCache
  meanPositionCacheKey?: string
  meanPositionCacheStatus: MeanPositionCacheStatus
  meanPositionCacheError?: string
  cameraCommand: CameraCommand
  setDataset: (dataset: EmbryoDataset, lineage: LineageModel) => void
  clearDataset: () => void
  setCurrentFrameIndex: (index: number) => void
  stepFrame: (delta: number) => void
  setPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setSelection: (cellIds: Iterable<string>, meta?: SelectionMeta) => void
  toggleCells: (cellIds: Iterable<string>) => void
  toggleCell: (cellId: string) => void
  selectLineage: (cellId: string) => void
  clearSelection: () => void
  applyColor: (color: string, saveAsGroup?: boolean) => void
  setInspectedCell: (cellId?: string) => void
  setHoveredObservation: (observation?: Observation) => void
  updateGroup: (id: string, patch: Partial<Pick<CellGroup, 'name' | 'visible'>>) => void
  setGroupsVisible: (ids: Iterable<string>, visible: boolean) => void
  setGroupColor: (id: string, color: string) => void
  addCellsToGroup: (id: string, cellIds: Iterable<string>) => void
  removeCellsFromGroup: (id: string, cellIds: Iterable<string>) => void
  deleteGroup: (id: string) => void
  selectGroup: (id: string) => void
  focusGroup: (id: string) => void
  setSettings: (patch: Partial<ExplorerSettings>) => void
  prepareMeanPositions: () => void
  clearMeanPositionCache: () => void
  setActiveEmbryos: (embryoIds: Iterable<string>) => void
  toggleEmbryo: (embryoId: string) => void
  resetCamera: () => void
  focusSelection: () => void
  setCameraAngle: (angle: CameraAngle) => void
  importGroupList: (sourceDataset: string, groups: GroupListEntry[]) => string[]
  importConfiguration: (config: SessionConfiguration) => string[]
}

export interface SessionConfiguration {
  version: 1
  datasetName: string
  mapping: EmbryoDataset['mapping']
  cellColors: Record<string, string>
  groups: CellGroup[]
  settings: ExplorerSettings
  activeEmbryoIds?: string[]
}

const defaultSettings: ExplorerSettings = {
  displayMode: 'highlight',
  nucleusSize: 0.34,
  unselectedOpacity: 0.13,
  showLabels: false,
  showAxes: true,
  showTrajectories: false,
  trailRangeMode: 'all',
  trailRangeStart: undefined,
  trailRangeEnd: undefined,
  trailPreviousFrames: 10,
  trailGroupIds: [],
  trailWidth: 1.1,
  embryoViewMode: 'overlay',
  colorByEmbryo: false,
  interpolateMeanPositions: false,
}

const groupId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `group-${Date.now()}-${Math.random().toString(36).slice(2)}`

const meanPositionKey = (embryoIds: Iterable<string>, interpolate = false) =>
  `${interpolate ? 'hold' : 'exact'}\u0000${[...embryoIds].sort().join('\u0000')}`
let activeMeanPositionJob: MeanPositionJob | undefined

const colorsFromGroups = (groups: CellGroup[]) => {
  const colors: Record<string, string> = {}
  for (const group of groups) for (const id of group.cellIds) colors[id] = group.color
  return colors
}

const reconcileAffectedCellColors = (
  previous: Record<string, string>,
  groups: CellGroup[],
  affectedCellIds: Iterable<string>,
) => {
  const affected = new Set(affectedCellIds)
  const colors = { ...previous }
  affected.forEach((cellId) => { delete colors[cellId] })
  for (const group of groups) {
    for (const cellId of group.cellIds) {
      if (affected.has(cellId)) colors[cellId] = group.color
    }
  }
  return colors
}

const normalizedColor = (color: string) => color.toLowerCase()

const visibleGroupKey = (groups: CellGroup[]) => groups
  .filter((group) => group.visible)
  .map((group) => group.id)
  .sort()
  .join('\u0000')

const resetTrailExtrasWhenVisibleGroupsChange = (
  settings: ExplorerSettings,
  previousGroups: CellGroup[],
  groups: CellGroup[],
) => visibleGroupKey(previousGroups) === visibleGroupKey(groups)
  ? settings
  : { ...settings, trailGroupIds: [] as string[] }

const withoutTrailGroupIds = (
  settings: ExplorerSettings,
  removedIds: Set<string>,
  replacementId?: string,
): ExplorerSettings => {
  if (settings.trailGroupIds === 'all' || !removedIds.size) return settings
  const ids = settings.trailGroupIds.flatMap((id) => (
    removedIds.has(id) ? (replacementId ? [replacementId] : []) : [id]
  ))
  return { ...settings, trailGroupIds: [...new Set(ids)] }
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  currentFrameIndex: 0,
  playing: false,
  playbackSpeed: 1,
  activeEmbryoIds: new Set(),
  selection: new Set(),
  selectionMeta: { kind: 'manual' },
  cellColors: {},
  groups: [],
  settings: defaultSettings,
  meanPositionCacheStatus: 'idle',
  cameraCommand: { type: 'reset', nonce: 0 },

  setDataset: (dataset, lineage) => {
    get().clearMeanPositionCache()
    set({
      dataset,
      lineage,
      currentFrameIndex: 0,
      playing: false,
      activeEmbryoIds: new Set(dataset.embryos.map((embryo) => embryo.id)),
      selection: new Set(),
      selectionMeta: { kind: 'manual' },
      cellColors: {},
      groups: [],
      settings: { ...get().settings, trailGroupIds: [] },
      inspectedCellId: undefined,
      hoveredObservation: undefined,
      cameraCommand: { type: 'reset', nonce: get().cameraCommand.nonce + 1 },
    })
    if (get().settings.embryoViewMode === 'mean') get().prepareMeanPositions()
  },
  clearDataset: () => {
    get().clearMeanPositionCache()
    set({
      dataset: undefined,
      lineage: undefined,
      currentFrameIndex: 0,
      playing: false,
      activeEmbryoIds: new Set(),
      selection: new Set(),
      cellColors: {},
      groups: [],
      settings: { ...get().settings, trailGroupIds: [] },
      inspectedCellId: undefined,
    })
  },
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
  toggleCells: (cellIds) => {
    const valid = get().dataset?.cells
    const ids = [...cellIds].filter((id) => valid?.has(id))
    const selection = new Set(get().selection)
    const remove = ids.length > 0 && ids.every((id) => selection.has(id))
    for (const id of ids) {
      if (remove) selection.delete(id)
      else selection.add(id)
    }
    set({
      selection,
      selectionMeta: { kind: 'manual' },
      inspectedCellId: ids.length === 1 ? ids[0] : undefined,
    })
  },
  toggleCell: (cellId) => get().toggleCells([cellId]),
  selectLineage: (cellId) => {
    const lineage = get().lineage
    if (!lineage) return
    const descendants = getDescendants(lineage, cellId, true)
    const previous = get().selection
    const selection = new Set(previous)
    descendants.forEach((id) => selection.add(id))
    set({
      selection,
      selectionMeta: previous.size
        ? { kind: 'manual' }
        : { kind: 'lineage', rootCell: cellId },
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
    const matchingGroups = state.groups.filter((group) => normalizedColor(group.color) === normalizedColor(color))
    if (matchingGroups.length) {
      const target = matchingGroups[0]
      const removedIds = new Set(matchingGroups.slice(1).map((group) => group.id))
      const mergedCellIds = [...new Set([...matchingGroups.flatMap((group) => group.cellIds), ...ids])]
      const groups = state.groups
        .filter((group) => !removedIds.has(group.id))
        .map((group) => group.id === target.id ? { ...group, color, cellIds: mergedCellIds } : group)
      set({
        groups,
        cellColors,
        settings: resetTrailExtrasWhenVisibleGroupsChange(
          withoutTrailGroupIds(state.settings, removedIds, target.id),
          state.groups,
          groups,
        ),
      })
      return
    }
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
    const groups = [...state.groups, group]
    set({
      cellColors,
      groups,
      settings: resetTrailExtrasWhenVisibleGroupsChange(state.settings, state.groups, groups),
    })
  },
  setInspectedCell: (inspectedCellId) => set({ inspectedCellId }),
  setHoveredObservation: (hoveredObservation) => set({ hoveredObservation }),
  updateGroup: (id, patch) =>
    set((state) => {
      const groups = state.groups.map((group) => (group.id === id ? { ...group, ...patch } : group))
      return {
        groups,
        settings: resetTrailExtrasWhenVisibleGroupsChange(state.settings, state.groups, groups),
      }
    }),
  setGroupsVisible: (ids, visible) =>
    set((state) => {
      const targets = new Set(ids)
      if (!targets.size) return state
      const groups = state.groups.map((group) => targets.has(group.id) ? { ...group, visible } : group)
      return {
        groups,
        settings: resetTrailExtrasWhenVisibleGroupsChange(state.settings, state.groups, groups),
      }
    }),
  setGroupColor: (id, color) =>
    set((state) => {
      const target = state.groups.find((group) => group.id === id)
      if (!target) return state
      const matching = state.groups.filter((group) =>
        group.id !== id && normalizedColor(group.color) === normalizedColor(color))
      const removedIds = new Set(matching.map((group) => group.id))
      const mergedCellIds = [...new Set([...target.cellIds, ...matching.flatMap((group) => group.cellIds)])]
      const groups = state.groups
        .filter((group) => !removedIds.has(group.id))
        .map((group) => group.id === id ? { ...group, color, cellIds: mergedCellIds } : group)
      const settings = withoutTrailGroupIds(state.settings, removedIds, id)
      return {
        groups,
        cellColors: reconcileAffectedCellColors(state.cellColors, groups, mergedCellIds),
        settings: resetTrailExtrasWhenVisibleGroupsChange(settings, state.groups, groups),
      }
    }),
  addCellsToGroup: (id, cellIds) =>
    set((state) => {
      const valid = state.dataset?.cells
      const additions = [...cellIds].filter((cellId) => valid?.has(cellId))
      const target = state.groups.find((group) => group.id === id)
      if (!target || !additions.length) return state
      const merged = [...new Set([...target.cellIds, ...additions])]
      const groups = state.groups.map((group) => group.id === id ? { ...group, cellIds: merged } : group)
      const cellColors = { ...state.cellColors }
      additions.forEach((cellId) => { cellColors[cellId] = target.color })
      return { groups, cellColors }
    }),
  removeCellsFromGroup: (id, cellIds) =>
    set((state) => {
      const removals = new Set(cellIds)
      if (!removals.size) return state
      const target = state.groups.find((group) => group.id === id)
      if (!target) return state
      const remaining = target.cellIds.filter((cellId) => !removals.has(cellId))
      const removeGroup = remaining.length === 0
      const groups = removeGroup
        ? state.groups.filter((group) => group.id !== id)
        : state.groups.map((group) => group.id === id
          ? { ...group, cellIds: remaining, source: 'manual' as const, rootCell: undefined }
          : group)
      const settings = removeGroup
        ? withoutTrailGroupIds(state.settings, new Set([id]))
        : state.settings
      return {
        groups,
        cellColors: reconcileAffectedCellColors(state.cellColors, groups, target.cellIds),
        settings: resetTrailExtrasWhenVisibleGroupsChange(settings, state.groups, groups),
      }
    }),
  deleteGroup: (id) =>
    set((state) => {
      const target = state.groups.find((group) => group.id === id)
      const groups = state.groups.filter((group) => group.id !== id)
      const settings = withoutTrailGroupIds(state.settings, new Set([id]))
      return {
        groups,
        cellColors: reconcileAffectedCellColors(state.cellColors, groups, target?.cellIds ?? []),
        settings: resetTrailExtrasWhenVisibleGroupsChange(settings, state.groups, groups),
      }
    }),
  selectGroup: (id) => {
    const group = get().groups.find((item) => item.id === id)
    if (group) set({ selection: new Set(group.cellIds), selectionMeta: { kind: 'group', groupId: id } })
  },
  focusGroup: (id) => {
    get().selectGroup(id)
    set((state) => ({ cameraCommand: { type: 'focus', nonce: state.cameraCommand.nonce + 1 } }))
  },
  setSettings: (patch) => {
    const interpolationChanged = patch.interpolateMeanPositions !== undefined
      && patch.interpolateMeanPositions !== get().settings.interpolateMeanPositions
    set((state) => ({
      settings: { ...state.settings, ...patch },
      hoveredObservation: patch.embryoViewMode ? undefined : state.hoveredObservation,
    }))
    if (interpolationChanged) get().clearMeanPositionCache()
    if (patch.embryoViewMode === 'mean') get().prepareMeanPositions()
    else if (interpolationChanged && get().settings.embryoViewMode === 'mean') get().prepareMeanPositions()
  },
  prepareMeanPositions: () => {
    const state = get()
    const dataset = state.dataset
    if (!dataset) return
    const interpolate = dataset.mapping.frameSampleCount === undefined
      && state.settings.interpolateMeanPositions
    const key = meanPositionKey(state.activeEmbryoIds, interpolate)
    if (state.meanPositionCache?.key === key) return
    if (state.meanPositionCacheStatus === 'loading' && state.meanPositionCacheKey === key) return

    activeMeanPositionJob?.cancel()
    const datasetAtStart = dataset
    const job = startMeanPositionPrecomputation({
      observations: dataset.observations,
      activeEmbryoIds: [...state.activeEmbryoIds],
      frameValues: dataset.frameValues,
      holdLastFrame: interpolate,
    })
    activeMeanPositionJob = job
    set({
      meanPositionCache: undefined,
      meanPositionCacheKey: key,
      meanPositionCacheStatus: 'loading',
      meanPositionCacheError: undefined,
    })
    void job.promise.then((serialized) => {
      if (activeMeanPositionJob !== job) return
      const current = get()
      const currentInterpolation = current.dataset?.mapping.frameSampleCount === undefined
        && current.settings.interpolateMeanPositions
      if (!current.dataset || current.dataset !== datasetAtStart || meanPositionKey(current.activeEmbryoIds, currentInterpolation) !== key) return
      activeMeanPositionJob = undefined
      set({
        meanPositionCache: hydrateMeanPositionCache(key, serialized),
        meanPositionCacheKey: key,
        meanPositionCacheStatus: 'ready',
        meanPositionCacheError: undefined,
      })
    }).catch((error: unknown) => {
      if (activeMeanPositionJob !== job) return
      activeMeanPositionJob = undefined
      set({
        meanPositionCache: undefined,
        meanPositionCacheStatus: 'error',
        meanPositionCacheError: error instanceof Error ? error.message : 'Mean-position precomputation failed.',
      })
    })
  },
  clearMeanPositionCache: () => {
    activeMeanPositionJob?.cancel()
    activeMeanPositionJob = undefined
    set({
      meanPositionCache: undefined,
      meanPositionCacheKey: undefined,
      meanPositionCacheStatus: 'idle',
      meanPositionCacheError: undefined,
    })
  },
  setActiveEmbryos: (embryoIds) => {
    const shouldRecomputeMean = get().settings.embryoViewMode === 'mean'
      || get().meanPositionCacheStatus !== 'idle'
    const valid = new Set(get().dataset?.embryos.map((embryo) => embryo.id) ?? [])
    const activeEmbryoIds = new Set([...embryoIds].filter((id) => valid.has(id)))
    if (!activeEmbryoIds.size && valid.size) return
    if (meanPositionKey(activeEmbryoIds) === meanPositionKey(get().activeEmbryoIds)) return
    set({ activeEmbryoIds, hoveredObservation: undefined })
    get().clearMeanPositionCache()
    if (shouldRecomputeMean) get().prepareMeanPositions()
  },
  toggleEmbryo: (embryoId) => {
    const shouldRecomputeMean = get().settings.embryoViewMode === 'mean'
      || get().meanPositionCacheStatus !== 'idle'
    const active = new Set(get().activeEmbryoIds)
    if (active.has(embryoId)) {
      if (active.size === 1) return
      active.delete(embryoId)
    } else active.add(embryoId)
    set({ activeEmbryoIds: active, hoveredObservation: undefined })
    get().clearMeanPositionCache()
    if (shouldRecomputeMean) get().prepareMeanPositions()
  },
  resetCamera: () =>
    set((state) => ({ cameraCommand: { type: 'reset', nonce: state.cameraCommand.nonce + 1 } })),
  focusSelection: () =>
    set((state) => ({ cameraCommand: { type: 'focus', nonce: state.cameraCommand.nonce + 1 } })),
  setCameraAngle: ({ azimuthDegrees, elevationDegrees, rollDegrees }) =>
    set((state) => ({
      cameraCommand: {
        type: 'angle',
        nonce: state.cameraCommand.nonce + 1,
        azimuthDegrees,
        elevationDegrees,
        rollDegrees,
      },
    })),
  importGroupList: (sourceDataset, importedGroups) => {
    const dataset = get().dataset
    if (!dataset) return ['Load the source dataset before importing groups.']
    const warnings: string[] = []
    if (sourceDataset && sourceDataset !== dataset.name) {
      warnings.push(`Group list was exported for “${sourceDataset}”; imported matching cell names only.`)
    }
    const validIds = new Set(dataset.cellIds)
    set((state) => {
      let groups = [...state.groups]
      let settings = state.settings
      for (const imported of importedGroups) {
        const cellIds = [...new Set(imported.cells.filter((cellId) => validIds.has(cellId)))]
        const ignored = imported.cells.length - cellIds.length
        if (ignored) warnings.push(`${imported.name}: ignored ${ignored} unknown cell${ignored === 1 ? '' : 's'}.`)
        if (!cellIds.length) {
          warnings.push(`${imported.name}: skipped because no cells exist in this dataset.`)
          continue
        }
        const sameColor = groups.filter((group) => normalizedColor(group.color) === normalizedColor(imported.color))
        if (sameColor.length) {
          const target = sameColor[0]
          const duplicateIds = new Set(sameColor.slice(1).map((group) => group.id))
          const merged = [...new Set([...sameColor.flatMap((group) => group.cellIds), ...cellIds])]
          groups = groups
            .filter((group) => !duplicateIds.has(group.id))
            .map((group) => group.id === target.id ? { ...group, cellIds: merged } : group)
          settings = withoutTrailGroupIds(settings, duplicateIds, target.id)
        } else {
          const rootCell = imported.rootCell && validIds.has(imported.rootCell)
            ? imported.rootCell
            : undefined
          groups.push({
            id: groupId(),
            name: imported.name,
            color: imported.color,
            cellIds,
            visible: imported.visible,
            source: imported.source === 'lineage' && rootCell ? 'lineage' : 'manual',
            rootCell,
            createdAt: Date.now() + groups.length,
          })
        }
      }
      return {
        groups,
        cellColors: { ...state.cellColors, ...colorsFromGroups(groups) },
        settings: resetTrailExtrasWhenVisibleGroupsChange(settings, state.groups, groups),
      }
    })
    return warnings
  },
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
    const activeEmbryoIds = new Set(
      (config.activeEmbryoIds ?? dataset.embryos.map((embryo) => embryo.id))
        .filter((id) => dataset.embryos.some((embryo) => embryo.id === id)),
    )
    get().clearMeanPositionCache()
    set({
      groups,
      cellColors,
      settings: { ...defaultSettings, ...config.settings },
      activeEmbryoIds: activeEmbryoIds.size ? activeEmbryoIds : new Set(dataset.embryos.map((embryo) => embryo.id)),
    })
    if (get().settings.embryoViewMode === 'mean') get().prepareMeanPositions()
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
    activeEmbryoIds: [...state.activeEmbryoIds],
  }
}
