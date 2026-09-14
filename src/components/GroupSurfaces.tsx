import { useEffect, useMemo, useRef, useState } from 'react'
import { Line } from '@react-three/drei'
import { BufferAttribute, BufferGeometry, Color, DoubleSide } from 'three'
import { useExplorerStore } from '../state/explorerStore'
import { useSurfaceStore } from '../surfaces/surfaceStore'
import { SurfaceRuntime, type SurfaceBundle, type SurfacePiece } from '../surfaces/runtime'

const noRaycast = () => undefined
function SurfaceMesh({ piece, color, opacity }: { piece: SurfacePiece; color: string; opacity: number }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry()
    result.setAttribute('position', new BufferAttribute(piece.geometry.positions, 3))
    result.setAttribute('normal', new BufferAttribute(piece.geometry.normals, 3))
    return result
  }, [piece.geometry])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} raycast={noRaycast}>
    <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} roughness={0.8} forceSinglePass />
  </mesh>
}

export function GroupSurfaces() {
  const dataset = useExplorerStore((s) => s.dataset)
  const groups = useExplorerStore((s) => s.groups)
  const hidden = useExplorerStore((s) => s.cellVisibility)
  const embryos = useExplorerStore((s) => s.activeEmbryoIds)
  const mode = useExplorerStore((s) => s.settings.embryoViewMode)
  const meanCache = useExplorerStore((s) => s.meanPositionCache)
  const index = useExplorerStore((s) => s.currentFrameIndex)
  const settings = useSurfaceStore((s) => s.settings)
  const retryRevision = useSurfaceStore((s) => s.retryRevision)
  const [bundle, setBundle] = useState<SurfaceBundle>()
  const runtimeRef = useRef<SurfaceRuntime | undefined>(undefined)
  const sequence = useRef(0)
  const selected = groups.filter((g) => (settings.groupIds ?? groups.filter((v) => v.visible).map((v) => v.id)).includes(g.id))
  const geometryKey = JSON.stringify([selected.map((g) => [g.id, g.cellIds]), Object.entries(hidden).filter(([, v]) => v === false), [...embryos], mode, settings.method, settings.radiusScale])
  const temporalKey = JSON.stringify([settings.mode, settings.rangeMode, settings.previousFrames, settings.startFrame, settings.endFrame, settings.specifiedFrames, settings.historyCount, settings.showCentroidTrail])

  useEffect(() => {
    if (!settings.enabled || !dataset || (mode === 'mean' && !meanCache)) return
    const runtime = new SurfaceRuntime({ dataset, groups: selected, activeEmbryoIds: embryos, mode, meanCache, hidden, settings })
    runtimeRef.current = runtime
    return () => { sequence.current++; runtime.dispose(); runtimeRef.current = undefined }
    // Geometry keys deliberately exclude group labels/colors and material-only settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, geometryKey, meanCache, settings.enabled, retryRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    let alive = true
    setBundle(undefined)
    sequence.current++
    if (!settings.enabled || !runtime) {
      useSurfaceStore.setState({ prepareFrame: undefined, busy: settings.enabled, displayedFrames: [] })
      return
    }
    runtime.configure(settings)
    const prepare = async (frame: number) => {
      const request = ++sequence.current
      useSurfaceStore.setState({ busy: true, error: '' })
      try {
        const result = await runtime.prepare(frame)
        if (!alive || request !== sequence.current) return false
        runtime.activate(result)
        setBundle(result)
        useSurfaceStore.setState({ busy: false, note: result.note, sigma: result.sigma, displayedFrames: result.frames.map((f) => f + 1) })
        for (const next of [frame + 1, frame + 2]) if (next < dataset!.frameValues.length) void runtime.prepare(next, true).catch(() => {})
        return true
      } catch (error) {
        if (alive && request === sequence.current) useSurfaceStore.setState({ busy: false, error: error instanceof Error ? error.message : 'Surface calculation failed.' })
        return false
      }
    }
    useSurfaceStore.setState({ prepareFrame: prepare })
    void prepare(useExplorerStore.getState().currentFrameIndex)
    return () => { alive = false; sequence.current++; if (useSurfaceStore.getState().prepareFrame === prepare) useSurfaceStore.setState({ prepareFrame: undefined }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, geometryKey, meanCache, settings.enabled, temporalKey, retryRevision])

  useEffect(() => {
    if (settings.enabled && bundle?.index !== index) void useSurfaceStore.getState().prepareFrame?.(index)
    // The prepared next bundle must survive until PlaybackControls commits its frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  if (!settings.enabled || bundle?.index !== index) return null
  const first = Math.min(...bundle.frames), last = Math.max(...bundle.frames)
  const colors = new Map(groups.map((g) => [g.id, g.color]))
  return <group>
    {bundle.pieces.map((piece) => {
      const age = first === last ? 1 : (piece.frame - first) / (last - first)
      const color = new Color(colors.get(piece.groupId) ?? '#999999').lerp(new Color('white'), (1 - age) * 0.55).getStyle()
      return <SurfaceMesh key={piece.key} piece={piece} color={color} opacity={settings.opacity * (0.18 + 0.82 * age)} />
    })}
    {bundle.paths.filter((p) => p.points.length > 1).map((path, i) => <Line key={`${path.groupId}:${path.embryoId}:${i}`} points={path.points.map((p) => p.position)} vertexColors={path.points.map((_, j) => new Color(colors.get(path.groupId)).lerp(new Color('white'), 0.75 * (1 - j / (path.points.length - 1))))} lineWidth={2} raycast={noRaycast} />)}
  </group>
}
