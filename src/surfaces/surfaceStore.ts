import { create } from 'zustand'
import { defaultSurfaceSettings, normalizeSurfaceSettings, type GroupSurfaceSettings } from './types'

interface SurfaceState {
  settings: GroupSurfaceSettings
  busy: boolean
  error: string
  note: string
  displayedFrames: number[]
  sigma?: number
  retryRevision: number
  retry: () => void
  prepareFrame?: (index: number) => Promise<boolean>
  setSettings: (patch: Partial<GroupSurfaceSettings>) => void
  reset: (settings?: Partial<GroupSurfaceSettings>) => void
}

export const useSurfaceStore = create<SurfaceState>((set) => ({
  settings: { ...defaultSurfaceSettings }, busy: false, error: '', note: '', displayedFrames: [], retryRevision: 0,
  retry: () => set((state) => ({ retryRevision: state.retryRevision + 1, error: '' })),
  setSettings: (patch) => set((state) => ({ settings: normalizeSurfaceSettings({ ...state.settings, ...patch }), error: '' })),
  reset: (settings) => set({ settings: normalizeSurfaceSettings(settings), busy: false, error: '', note: '', displayedFrames: [], sigma: undefined, prepareFrame: undefined }),
}))
