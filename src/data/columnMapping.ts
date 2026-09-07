import type { ColumnMapping, SourceInspection } from './types'

const exact = (headers: string[], names: string[]) => {
  const normalized = new Map(headers.map((header) => [header.toLowerCase().trim(), header]))
  for (const name of names) {
    const result = normalized.get(name.toLowerCase())
    if (result) return result
  }
  return ''
}

export function suggestMapping(inspection: SourceInspection): ColumnMapping {
  const headers = inspection.headers
  const hasAligned = Boolean(
    exact(headers, ['A_pos']) && exact(headers, ['L_pos']) && exact(headers, ['D_pos']),
  )
  const time = exact(headers, ['time', 'timestamp', 'minutes', 'minute'])
  const frame = exact(headers, ['frame', 'frame_number', 'frame_id', 't'])

  return {
    cellId: exact(headers, ['cell_name', 'cell', 'cell_id', 'cellid', 'name']),
    x: hasAligned ? exact(headers, ['A_pos']) : exact(headers, ['x', 'x_pos', 'x_position']),
    y: hasAligned ? exact(headers, ['L_pos']) : exact(headers, ['y', 'y_pos', 'y_position']),
    z: hasAligned ? exact(headers, ['D_pos']) : exact(headers, ['z', 'z_pos', 'z_position']),
    time,
    frame,
    playback: time ? 'time' : frame ? 'frame' : 'none',
    parent: exact(headers, ['parent', 'parent_cell', 'parent_name']),
    embryo: exact(headers, ['embryo_id', 'embryo', 'dataset_id', 'sample_id']),
    embryoValue: exact(headers, ['embryo_id', 'embryo', 'dataset_id', 'sample_id'])
      ? String(
          inspection.samples[0]?.[
            exact(headers, ['embryo_id', 'embryo', 'dataset_id', 'sample_id'])
          ] ?? '',
        )
      : '',
    sheet: inspection.sheetNames?.[0],
  }
}

export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = []
  if (!mapping.cellId) errors.push('Choose a cell ID column.')
  if (!mapping.x || !mapping.y || !mapping.z) errors.push('Choose X, Y, and Z coordinate columns.')
  if (new Set([mapping.x, mapping.y, mapping.z]).size < 3) {
    errors.push('X, Y, and Z must use different columns.')
  }
  if (mapping.playback === 'time' && !mapping.time) errors.push('Choose a time column.')
  if (mapping.playback === 'frame' && !mapping.frame) errors.push('Choose a frame column.')
  if (mapping.embryo && !mapping.embryoValue?.trim()) {
    errors.push('Enter the embryo ID to load, or clear the embryo column.')
  }
  return errors
}
