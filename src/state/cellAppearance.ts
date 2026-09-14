import type { CellGroup, DisplayMode } from './explorerStore'

export const DEFAULT_CELL_COLOR = '#aeb8b5'
export const SELECTION_COLOR = '#d34f3f'

export interface CellAppearanceInput {
  cellId: string
  selection: Set<string>
  cellColors: Record<string, string>
  cellVisibility?: Record<string, boolean>
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
  const explicitVisibility = input.cellVisibility?.[input.cellId]
  const highlighted = inVisibleGroup || selected || hasAssignedColor

  if (explicitVisibility === false) return { color, opacity: 0, visible: false, selected, inVisibleGroup }
  if (explicitVisibility !== true && hiddenByGroup) return { color, opacity: 0, visible: false, selected, inVisibleGroup }
  if (input.displayMode === 'isolate') {
    const visible = explicitVisibility === true || inVisibleGroup || (input.groups.length === 0 && selected)
    return {
      color,
      opacity: visible ? (highlighted ? 1 : input.unselectedOpacity) : 0,
      visible,
      selected,
      inVisibleGroup,
    }
  }
  if (input.displayMode === 'highlight') {
    return {
      color,
      opacity: highlighted ? 1 : input.unselectedOpacity,
      visible: true,
      selected,
      inVisibleGroup,
    }
  }
  return {
    color,
    opacity: highlighted ? 1 : input.unselectedOpacity,
    visible: true,
    selected,
    inVisibleGroup,
  }
}
