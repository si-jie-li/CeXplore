import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Focus, RotateCcw } from 'lucide-react'
import type { Observation } from '../data/types'
import { getCellAppearance } from '../state/cellAppearance'
import { useExplorerStore } from '../state/explorerStore'

interface RenderNucleus {
  observation: Observation
  color: string
  selected: boolean
}

function InstancedNuclei({
  items,
  capacity,
  size,
  opacity,
}: {
  items: RenderNucleus[]
  capacity: number
  size: number
  opacity: number
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const setSelection = useExplorerStore((state) => state.setSelection)
  const setHoveredObservation = useExplorerStore((state) => state.setHoveredObservation)
  const setInspectedCell = useExplorerStore((state) => state.setInspectedCell)

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    items.forEach((item, index) => {
      const observation = item.observation
      dummy.position.set(observation.renderX, observation.renderY, observation.renderZ)
      const selectedScale = item.selected ? 1.3 : 1
      dummy.scale.setScalar(size * selectedScale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, new THREE.Color(item.color))
    })
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [dummy, items, size])

  const itemForEvent = (event: { instanceId?: number }) =>
    event.instanceId === undefined ? undefined : items[event.instanceId]

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(capacity, 1)]}
      onClick={(event) => {
        event.stopPropagation()
        const item = itemForEvent(event)
        if (!item) return
        setSelection([item.observation.cellId], { kind: 'cell', rootCell: item.observation.cellId })
        setInspectedCell(item.observation.cellId)
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        setHoveredObservation(itemForEvent(event)?.observation)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHoveredObservation(undefined)
        document.body.style.cursor = ''
      }}
    >
      <sphereGeometry args={[1, 14, 10]} />
      <meshStandardMaterial
        roughness={0.7}
        metalness={0}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity > 0.4}
      />
    </instancedMesh>
  )
}

function Trajectories({ currentStep }: { currentStep: number }) {
  const dataset = useExplorerStore((state) => state.dataset)!
  const selection = useExplorerStore((state) => state.selection)
  const groups = useExplorerStore((state) => state.groups)
  const cellColors = useExplorerStore((state) => state.cellColors)
  const settings = useExplorerStore((state) => state.settings)
  const frameValues = dataset.frameValues
  const frameIndex = frameValues.indexOf(currentStep)
  if (!settings.showTrajectories || selection.size === 0) return null
  const earliest =
    settings.trailLength === 'all'
      ? -Infinity
      : frameValues[Math.max(0, frameIndex - settings.trailLength + 1)]
  return (
    <>
      {[...selection].map((cellId) => {
        const points = (dataset.trajectoryIndex.get(cellId) ?? [])
          .filter((point) => point.step <= currentStep && point.step >= earliest)
          .map((point) => [point.renderX, point.renderY, point.renderZ] as [number, number, number])
        if (points.length < 2) return null
        const groupColor = groups.filter((group) => group.visible && group.cellIds.includes(cellId)).at(-1)?.color
        return (
          <Line
            key={cellId}
            points={points}
            color={groupColor ?? cellColors[cellId] ?? '#d34f3f'}
            lineWidth={1.2}
            transparent
            opacity={0.72}
          />
        )
      })}
    </>
  )
}

function AxisGuide() {
  return (
    <group>
      <axesHelper args={[5]} />
      <Html position={[5.5, 0, 0]} center className="axis-label">X</Html>
      <Html position={[0, 5.5, 0]} center className="axis-label">Y</Html>
      <Html position={[0, 0, 5.5]} center className="axis-label">Z</Html>
    </group>
  )
}

function CellLabels({ observations }: { observations: Observation[] }) {
  const settings = useExplorerStore((state) => state.settings)
  const selection = useExplorerStore((state) => state.selection)
  if (!settings.showLabels) return null
  const labelRows = observations.length <= 160
    ? observations
    : observations.filter((observation) => selection.has(observation.cellId))
  return (
    <>
      {labelRows.map((observation) => (
        <Html
          key={observation.cellId}
          position={[observation.renderX, observation.renderY + settings.nucleusSize * 1.8, observation.renderZ]}
          center
          distanceFactor={18}
          className="nucleus-label"
        >
          {observation.cellId}
        </Html>
      ))}
    </>
  )
}

function CameraController({ observations }: { observations: Observation[] }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  const selection = useExplorerStore((state) => state.selection)
  const command = useExplorerStore((state) => state.cameraCommand)

  useEffect(() => {
    if (!controls.current) return
    if (command.type === 'reset') {
      camera.position.set(17, 13, 19)
      controls.current.target.set(0, 0, 0)
    } else {
      const targets = observations.filter((observation) => selection.has(observation.cellId))
      if (targets.length) {
        const center = targets.reduce(
          (sum, item) => sum.add(new THREE.Vector3(item.renderX, item.renderY, item.renderZ)),
          new THREE.Vector3(),
        ).divideScalar(targets.length)
        const direction = camera.position.clone().sub(controls.current.target).normalize()
        const distance = Math.max(5, Math.min(18, 4 + Math.sqrt(targets.length)))
        controls.current.target.copy(center)
        camera.position.copy(center.clone().add(direction.multiplyScalar(distance)))
      }
    }
    camera.updateProjectionMatrix()
    controls.current.update()
  }, [camera, command, observations, selection])

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} />
}

function Scene({ observations }: { observations: Observation[] }) {
  const dataset = useExplorerStore((state) => state.dataset)!
  const selection = useExplorerStore((state) => state.selection)
  const cellColors = useExplorerStore((state) => state.cellColors)
  const groups = useExplorerStore((state) => state.groups)
  const settings = useExplorerStore((state) => state.settings)
  const setSelection = useExplorerStore((state) => state.setSelection)

  const classified = useMemo(() => {
    const opaque: RenderNucleus[] = []
    const subdued: RenderNucleus[] = []
    for (const observation of observations) {
      const appearance = getCellAppearance({
        cellId: observation.cellId,
        selection,
        cellColors,
        groups,
        displayMode: settings.displayMode,
        unselectedOpacity: settings.unselectedOpacity,
      })
      if (!appearance.visible) continue
      const item = { observation, color: appearance.color, selected: appearance.selected }
      if (appearance.opacity >= 0.9) opaque.push(item)
      else subdued.push(item)
    }
    return { opaque, subdued }
  }, [cellColors, groups, observations, selection, settings.displayMode, settings.unselectedOpacity])

  return (
    <>
      <color attach="background" args={['#f7f9f8']} />
      <ambientLight intensity={1.45} />
      <directionalLight position={[8, 12, 10]} intensity={1.8} />
      <directionalLight position={[-8, -5, -8]} intensity={0.55} />
      <InstancedNuclei items={classified.subdued} capacity={dataset.cellIds.length} size={settings.nucleusSize} opacity={settings.displayMode === 'color' ? 0.62 : settings.unselectedOpacity} />
      <InstancedNuclei items={classified.opaque} capacity={dataset.cellIds.length} size={settings.nucleusSize} opacity={1} />
      <Trajectories currentStep={dataset.frameValues[useExplorerStore.getState().currentFrameIndex] ?? 0} />
      <CellLabels observations={[...classified.opaque, ...classified.subdued].map((item) => item.observation)} />
      {settings.showAxes && <AxisGuide />}
      <CameraController observations={observations} />
      <mesh visible={false} onClick={() => setSelection([])}><sphereGeometry args={[30]} /><meshBasicMaterial side={THREE.BackSide} /></mesh>
    </>
  )
}

export function Embryo3D() {
  const dataset = useExplorerStore((state) => state.dataset)!
  const currentFrameIndex = useExplorerStore((state) => state.currentFrameIndex)
  const resetCamera = useExplorerStore((state) => state.resetCamera)
  const focusSelection = useExplorerStore((state) => state.focusSelection)
  const selectionSize = useExplorerStore((state) => state.selection.size)
  const step = dataset.frameValues[currentFrameIndex] ?? dataset.frameValues[0] ?? 0
  const observations = dataset.frameIndex.get(step) ?? []

  return (
    <section className="panel embryo-panel" aria-label="3D embryo viewer">
      <div className="panel-heading overlay-heading">
        <div>
          <span className="panel-kicker">Spatial view</span>
          <h2>3D embryo</h2>
        </div>
        <div className="canvas-actions">
          <button className="tool-button" onClick={focusSelection} disabled={!selectionSize} title="Center camera on selected cells"><Focus size={15} /> Focus</button>
          <button className="tool-button" onClick={resetCamera} title="Reset camera"><RotateCcw size={15} /> Reset</button>
        </div>
      </div>
      <div className="canvas-wrap">
        <Canvas
          camera={{ position: [17, 13, 19], fov: 42, near: 0.1, far: 200 }}
          dpr={[1, 1.7]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onPointerMissed={() => useExplorerStore.getState().clearSelection()}
        >
          <Scene observations={observations} />
        </Canvas>
        <div className="canvas-hint">Drag to rotate · Right-drag to pan · Scroll to zoom</div>
        <div className="frame-count">{observations.length} nuclei</div>
      </div>
    </section>
  )
}
