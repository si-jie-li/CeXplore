import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildDatasetFromRows } from '../data/frameIndex'
import { resolveLineage } from '../lineage/lineageResolver'
import { useExplorerStore } from '../state/explorerStore'
import { useSurfaceStore } from '../surfaces/surfaceStore'
import { GroupSurfaceControls } from './GroupSurfaceControls'
import { PlaybackControls } from './PlaybackControls'

beforeEach(() => {
  const data = buildDatasetFromRows([1, 2, 3].map((temporal) => ({ cellId: 'AB', temporal, x: temporal, y: 0, z: 0 })), { name: 'controls.csv', mapping: { cellId: 'cell', x: 'x', y: 'y', z: 'z', frame: 'frame', playback: 'frame' } })
  useExplorerStore.getState().setDataset(data, resolveLineage(data.cells))
  useSurfaceStore.getState().reset()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('validates explicit frames and keeps surface choices in the group panel', () => {
  render(<GroupSurfaceControls />)
  fireEvent.click(screen.getByRole('button', { name: /Group surfaces/ }))
  fireEvent.click(screen.getByLabelText('Show group surfaces'))
  fireEvent.change(screen.getByLabelText('Display'), { target: { value: 'specified' } })
  fireEvent.change(screen.getByLabelText('Surface specified frames'), { target: { value: '1, 4' } })
  fireEvent.click(screen.getByText('Apply frames'))
  expect(screen.getByRole('alert')).toHaveTextContent('between 1 and 3')
  expect(useSurfaceStore.getState().settings.specifiedFrames).toEqual([1])
  fireEvent.change(screen.getByLabelText('Surface specified frames'), { target: { value: '1, 3' } })
  fireEvent.click(screen.getByText('Apply frames'))
  expect(useSurfaceStore.getState().settings.specifiedFrames).toEqual([1, 3])
  fireEvent.click(screen.getByLabelText('Dismiss surface suggestion'))
  expect(screen.queryByText('Pause and calculate')).not.toBeInTheDocument()
})

it('does not advance playback until next surface is ready', async () => {
  vi.useFakeTimers()
  let resolve!: (ready: boolean) => void
  const prepare = vi.fn(() => new Promise<boolean>((r) => { resolve = r }))
  useSurfaceStore.getState().setSettings({ enabled: true })
  useSurfaceStore.setState({ prepareFrame: prepare })
  useExplorerStore.getState().setPlaying(true)
  render(<PlaybackControls />)
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  expect(prepare).toHaveBeenCalledWith(1)
  expect(useExplorerStore.getState().currentFrameIndex).toBe(0)
  await act(async () => resolve(true))
  expect(useExplorerStore.getState().currentFrameIndex).toBe(1)
})

it('ignores a stale surface response after a manual scrub', async () => {
  vi.useFakeTimers()
  let resolve!: (ready: boolean) => void
  useSurfaceStore.getState().setSettings({ enabled: true })
  useSurfaceStore.setState({ prepareFrame: () => new Promise<boolean>((r) => { resolve = r }) })
  useExplorerStore.getState().setPlaying(true)
  render(<PlaybackControls />)
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  act(() => useExplorerStore.getState().setCurrentFrameIndex(2))
  await act(async () => resolve(true))
  expect(useExplorerStore.getState().currentFrameIndex).toBe(2)
})

it('waits for the worker controller and pauses on a computation failure', async () => {
  vi.useFakeTimers()
  useSurfaceStore.getState().setSettings({ enabled: true })
  useExplorerStore.getState().setPlaying(true)
  render(<PlaybackControls />)
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(useExplorerStore.getState().currentFrameIndex).toBe(0)
  act(() => useSurfaceStore.setState({ prepareFrame: async () => false }))
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  expect(useExplorerStore.getState().playing).toBe(false)
  expect(useExplorerStore.getState().currentFrameIndex).toBe(0)
})
