import { useEffect } from 'react'
import { useSurfaceStore } from '../surfaces/surfaceStore'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useExplorerStore } from '../state/explorerStore'
import { formatNumber } from '../utils/format'

const SPEEDS = [0.25, 0.5, 1, 2, 4]

export function PlaybackControls() {
  const dataset = useExplorerStore((state) => state.dataset)!
  const index = useExplorerStore((state) => state.currentFrameIndex)
  const playing = useExplorerStore((state) => state.playing)
  const speed = useExplorerStore((state) => state.playbackSpeed)
  const setPlaying = useExplorerStore((state) => state.setPlaying)
  const setSpeed = useExplorerStore((state) => state.setPlaybackSpeed)
  const setIndex = useExplorerStore((state) => state.setCurrentFrameIndex)
  const stepFrame = useExplorerStore((state) => state.stepFrame)
  const singleFrameDataset = dataset.frameValues.length <= 1
  const current = dataset.frameValues[index] ?? 0
  const surfacesEnabled = useSurfaceStore((s) => s.settings.enabled)
  const prepareSurface = useSurfaceStore((s) => s.prepareFrame)

  useEffect(() => {
    if (!playing || singleFrameDataset) return
    let cancelled = false
    if (surfacesEnabled && !prepareSurface) return
    const timer = window.setTimeout(async () => {
      const ready = !surfacesEnabled || await prepareSurface!((index + 1) % dataset.frameValues.length)
      if (cancelled) return
      if (ready) stepFrame(1)
      else setPlaying(false)
    }, 360 / speed)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [index, playing, speed, singleFrameDataset, stepFrame, surfacesEnabled, prepareSurface, dataset, setPlaying])

  useEffect(() => {
    if (singleFrameDataset && playing) setPlaying(false)
  }, [playing, setPlaying, singleFrameDataset])

  return (
    <div className="playback">
      <div className="playback-main">
        <button className="round-button" onClick={() => stepFrame(-1)} disabled={singleFrameDataset} aria-label="Previous frame"><SkipBack size={17} /></button>
        <button className="round-button primary-round" onClick={() => setPlaying(!playing)} disabled={singleFrameDataset} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="round-button" onClick={() => stepFrame(1)} disabled={singleFrameDataset} aria-label="Next frame"><SkipForward size={17} /></button>
        <div className="timeline-wrap">
          <input
            aria-label="Timeline"
            type="range"
            min={0}
            max={Math.max(dataset.frameValues.length - 1, 0)}
            value={index}
            onChange={(event) => setIndex(Number(event.target.value))}
            disabled={singleFrameDataset}
          />
          <div className="timeline-meta">
            <span>{`${dataset.temporalMode === 'time' ? 'Time' : 'Frame'} ${formatNumber(current)}`}</span>
            <span>{dataset.temporalMode === 'time' ? 'Frame ' : ''}{index + 1} / {Math.max(dataset.frameValues.length, 1)}</span>
          </div>
        </div>
      </div>
      <div className="speed-control" aria-label="Playback speed">
        {SPEEDS.map((value) => (
          <button key={value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)} disabled={singleFrameDataset}>{value}×</button>
        ))}
      </div>
    </div>
  )
}
