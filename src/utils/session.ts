import type { SessionConfiguration } from '../state/explorerStore'

export function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}

export async function readSessionFile(file: File): Promise<SessionConfiguration> {
  const parsed = JSON.parse(await file.text()) as SessionConfiguration
  if (parsed.version !== 1 || !Array.isArray(parsed.groups) || !parsed.settings) {
    throw new Error('This is not a supported Lineage Explorer session file.')
  }
  return parsed
}
