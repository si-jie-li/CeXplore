import type { CellGroup } from '../state/explorerStore'

export const GROUP_LIST_FORMAT = 'cexplore-group-list'

export interface GroupListEntry {
  name: string
  color: string
  cells: string[]
  visible: boolean
  source: 'manual' | 'cell' | 'lineage' | 'group'
  rootCell?: string
}

export interface GroupListFile {
  format: typeof GROUP_LIST_FORMAT
  version: 1
  dataset: string
  exportedAt: string
  groups: GroupListEntry[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

const groupSources = new Set<GroupListEntry['source']>(['manual', 'cell', 'lineage', 'group'])

export function createGroupListFile(dataset: string, groups: CellGroup[]): GroupListFile {
  return {
    format: GROUP_LIST_FORMAT,
    version: 1,
    dataset,
    exportedAt: new Date().toISOString(),
    groups: groups.map((group) => ({
      name: group.name,
      color: group.color.toLowerCase(),
      cells: [...group.cellIds],
      visible: group.visible,
      source: group.source,
      ...(group.rootCell ? { rootCell: group.rootCell } : {}),
    })),
  }
}

export function parseGroupList(text: string): GroupListFile {
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed)
    || parsed.format !== GROUP_LIST_FORMAT
    || parsed.version !== 1
    || typeof parsed.dataset !== 'string'
    || !Array.isArray(parsed.groups)) {
    throw new Error('This is not a supported CeXplore group-list file.')
  }

  const groups = parsed.groups.map((value, index): GroupListEntry => {
    if (!isRecord(value) || !isColor(value.color) || !Array.isArray(value.cells)
      || !value.cells.every((cell) => typeof cell === 'string')) {
      throw new Error(`Group entry ${index + 1} is malformed.`)
    }
    const source = typeof value.source === 'string' && groupSources.has(value.source as GroupListEntry['source'])
      ? value.source as GroupListEntry['source']
      : 'manual'
    const name = typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : `Imported group ${index + 1}`
    return {
      name,
      color: value.color.toLowerCase(),
      cells: [...new Set(value.cells.map((cell) => cell.trim()).filter(Boolean))],
      visible: value.visible !== false,
      source,
      ...(typeof value.rootCell === 'string' && value.rootCell.trim()
        ? { rootCell: value.rootCell.trim() }
        : {}),
    }
  })

  return {
    format: GROUP_LIST_FORMAT,
    version: 1,
    dataset: parsed.dataset,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    groups,
  }
}

export async function readGroupListFile(file: File) {
  return parseGroupList(await file.text())
}
