import Papa from 'papaparse'
import canonicalCsv from './data/complete_embryo_lineage_list.csv?raw'

export interface CanonicalCell {
  id: string
  parentId?: string
  treeOrder: number
  xPosition: number
  birthTime: number
  endTime: number
  depth: number
  founder: string
}

interface CanonicalCsvRow {
  tree_order: string
  cell_name: string
  parent: string
  founder_lineage: string
  depth_from_P0: string
  x_position: string
  birth_time_min: string
  end_time_min: string
}

const parsed = Papa.parse<CanonicalCsvRow>(canonicalCsv, {
  header: true,
  skipEmptyLines: true,
})

export const canonicalCells = new Map<string, CanonicalCell>()

for (const row of parsed.data) {
  const id = row.cell_name?.trim()
  if (!id) continue
  canonicalCells.set(id, {
    id,
    parentId: row.parent?.trim() || undefined,
    treeOrder: Number(row.tree_order) || Number.MAX_SAFE_INTEGER,
    xPosition: Number(row.x_position) || 0,
    birthTime: Number(row.birth_time_min) || 0,
    endTime: Number(row.end_time_min) || 0,
    depth: Number(row.depth_from_P0) || 0,
    founder: row.founder_lineage || 'Unresolved',
  })
}

// Explicitly retained as a readable guardrail for the asymmetric early embryo.
// The full canonical CSV is authoritative for all other names.
const earlyParents: Record<string, string> = {
  AB: 'P0',
  P1: 'P0',
  ABa: 'AB',
  ABp: 'AB',
  EMS: 'P1',
  P2: 'P1',
  MS: 'EMS',
  E: 'EMS',
  C: 'P2',
  P3: 'P2',
  D: 'P3',
  P4: 'P3',
  Z2: 'P4',
  Z3: 'P4',
}

for (const [id, parentId] of Object.entries(earlyParents)) {
  const existing = canonicalCells.get(id)
  if (existing) existing.parentId = parentId
  else {
    canonicalCells.set(id, {
      id,
      parentId,
      treeOrder: Number.MAX_SAFE_INTEGER,
      xPosition: Number.MAX_SAFE_INTEGER,
      birthTime: 0,
      endTime: 0,
      depth: 0,
      founder: id,
    })
  }
}

export function getCanonicalParent(cellId: string) {
  return canonicalCells.get(cellId)?.parentId
}
