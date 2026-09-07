import type { CellGroup, DisplayMode } from './explorerStore'

export const DEFAULT_CELL_COLOR = '#aeb8b5'
export const SELECTION_COLOR = '#d34f3f'

export interface CellAppearanceInput {
  cellId: string
  selection: Set<string>
  cellColors: Record<string, string>
  groups: CellGroup[]
  displayMode: DisplayMode
  unselectedOpacity: number
}

export interface CellAppearance {
  color: string
  opacity: number
  visible: boolean
  selected: boolean
  inVisibleGroup: boolean
}

export function getCellAppearance(input: CellAppearanceInput): CellAppearance {
  const memberships = input.groups.filter((group) => group.cellIds.includes(input.cellId))
  const visibleMemberships = memberships.filter((group) => group.visible)
  const selected = input.selection.has(input.cellId)
  const inVisibleGroup = visibleMemberships.length > 0
  const hiddenByGroup = memberships.length > 0 && visibleMemberships.length === 0
  const latestGroup = visibleMemberships.at(-1)
  const hasAssignedColor = Boolean(input.cellColors[input.cellId])
  const color = latestGroup?.color ?? input.cellColors[input.cellId] ?? (selected ? SELECTION_COLOR : DEFAULT_CELL_COLOR)

  if (hiddenByGroup) return { color, opacity: 0, visible: false, selected, inVisibleGroup }
  if (input.displayMode === 'isolate') {
    const visible = inVisibleGroup || (input.groups.length === 0 && selected)
    return { color, opacity: visible ? 1 : 0, visible, selected, inVisibleGroup }
  }
  if (input.displayMode === 'highlight') {
    const highlighted = inVisibleGroup || selected || hasAssignedColor
    return {
      color,
      opacity: highlighted ? 1 : input.unselectedOpacity,
      visible: true,
      selected,
      inVisibleGroup,
    }
  }
  return { color, opacity: selected || inVisibleGroup || Boolean(input.cellColors[input.cellId]) ? 1 : 0.62, visible: true, selected, inVisibleGroup }
}
