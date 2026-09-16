import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js'
import { MeshBasicMaterial, Vector3 } from 'three'
import type { SurfaceGeometryData } from './types'

export function estimateSurfaceSigma(frames: Float32Array[]): number {
  const distances: number[] = []
  for (const points of frames) {
    for (let i = 0; i < points.length; i += 3) {
      let nearest = Infinity
      for (let j = 0; j < points.length; j += 3) {
        const d = (points[i] - points[j]) ** 2 + (points[i + 1] - points[j + 1]) ** 2 + (points[i + 2] - points[j + 2]) ** 2
        if (d > 1e-12 && d < nearest) nearest = d
      }
      if (Number.isFinite(nearest)) distances.push(Math.sqrt(nearest))
    }
  }
  distances.sort((a, b) => a - b)
  return distances.length ? Math.max(.005, .6 * distances[Math.floor(distances.length / 2)]) : .3
}

function uniquePoints(values: Float32Array) {
  const points: Vector3[] = []
  for (let i = 0; i < values.length; i += 3) {
    const point = new Vector3(values[i], values[i + 1], values[i + 2])
    if (!points.some((other) => other.distanceToSquared(point) <= 1e-12)) points.push(point)
  }
  return points
}

function convexDegenerate(points: Vector3[]): SurfaceGeometryData | undefined {
  if (points.length === 1) return { positions: new Float32Array(points[0].toArray()), normals: new Float32Array(), kind: 'point', lowerDimensional: true }
  let first = points[0], second = points[1], farthest = first.distanceToSquared(second)
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const distance = points[i].distanceToSquared(points[j])
    if (distance > farthest) { first = points[i]; second = points[j]; farthest = distance }
  }
  const tolerance = Math.max(1e-7, Math.sqrt(farthest) * 1e-6)
  const direction = second.clone().sub(first).normalize()
  const planePoint = points.find((point) => direction.clone().cross(point.clone().sub(first)).length() > tolerance)
  if (!planePoint) return { positions: new Float32Array([...first.toArray(), ...second.toArray()]), normals: new Float32Array(), kind: 'line', lowerDimensional: true }

  const normal = direction.clone().cross(planePoint.clone().sub(first)).normalize()
  if (points.some((point) => Math.abs(normal.dot(point.clone().sub(first))) > tolerance)) return undefined
  const across = normal.clone().cross(direction).normalize()
  const projected = points.map((point) => ({ point, x: direction.dot(point.clone().sub(first)), y: across.dot(point.clone().sub(first)) }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a: typeof projected[number], b: typeof projected[number], c: typeof projected[number]) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const lower: typeof projected = [], upper: typeof projected = []
  for (const point of projected) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop(); lower.push(point) }
  for (const point of [...projected].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop(); upper.push(point) }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  if (hull.length < 3) return { positions: new Float32Array([...first.toArray(), ...second.toArray()]), normals: new Float32Array(), kind: 'line', lowerDimensional: true }
  const triangles: number[] = [], normals: number[] = []
  for (let i = 1; i < hull.length - 1; i++) {
    triangles.push(...hull[0].point.toArray(), ...hull[i].point.toArray(), ...hull[i + 1].point.toArray())
    for (let vertex = 0; vertex < 3; vertex++) normals.push(...normal.toArray())
  }
  return { positions: new Float32Array(triangles), normals: new Float32Array(normals), kind: 'mesh', lowerDimensional: true }
}

/** Fixed, world-anchored voxels; independent tiles include a normal-sampling halo. */
export function buildSurfaceGeometry(points: Float32Array, sigma: number, method: 'smooth' | 'convex'): SurfaceGeometryData {
  const empty: SurfaceGeometryData = { positions: new Float32Array(), normals: new Float32Array(), kind: 'mesh', lowerDimensional: false }
  if (!points.length) return empty
  if (!(sigma > 0) || !Number.isFinite(sigma) || points.length % 3 || points.some((n) => !Number.isFinite(n))) throw new Error('Invalid surface coordinates or radius.')
  if (method === 'convex') {
    const vectors = uniquePoints(points)
    const degenerate = convexDegenerate(vectors)
    if (degenerate) return degenerate
    const geometry = new ConvexGeometry(vectors)
    const result: SurfaceGeometryData = { positions: new Float32Array(geometry.getAttribute('position').array), normals: new Float32Array(geometry.getAttribute('normal').array), kind: 'mesh', lowerDimensional: false }
    geometry.dispose()
    return result
  }
  const resolution = 24
  const cells = resolution - 3
  const spacing = sigma / 2
  const tileWidth = cells * spacing
  const radius = sigma * 3
  const tiles = new Map<string, { tile: number[]; offsets: number[] }>()
  for (let i = 0; i < points.length; i += 3) {
    for (let z = Math.floor((points[i + 2] - radius - spacing) / tileWidth); z <= Math.floor((points[i + 2] + radius + spacing) / tileWidth); z++)
      for (let y = Math.floor((points[i + 1] - radius - spacing) / tileWidth); y <= Math.floor((points[i + 1] + radius + spacing) / tileWidth); y++)
        for (let x = Math.floor((points[i] - radius - spacing) / tileWidth); x <= Math.floor((points[i] + radius + spacing) / tileWidth); x++) {
          const key = `${x},${y},${z}`
          const entry = tiles.get(key) ?? { tile: [x, y, z], offsets: [] }
          entry.offsets.push(i)
          tiles.set(key, entry)
        }
  }
  if (tiles.size > 4096) throw new Error('This surface is too large at this detail. Increase smoothing or show fewer group members.')
  const material = new MeshBasicMaterial()
  const marching = new MarchingCubes(resolution, material, false, false, 50000)
  marching.isolation = .5
  const chunks: Float32Array[] = []
  const normalChunks: Float32Array[] = []
  let floats = 0
  try {
    for (const { tile, offsets } of tiles.values()) {
      marching.reset()
      const origin = tile.map((n) => n * tileWidth - spacing)
      for (const i of offsets) {
        const local = [0, 1, 2].map((axis) => (points[i + axis] - origin[axis]) / spacing)
        for (let z = Math.max(0, Math.floor(local[2] - 6)); z <= Math.min(resolution - 1, Math.ceil(local[2] + 6)); z++)
          for (let y = Math.max(0, Math.floor(local[1] - 6)); y <= Math.min(resolution - 1, Math.ceil(local[1] + 6)); y++)
            for (let x = Math.max(0, Math.floor(local[0] - 6)); x <= Math.min(resolution - 1, Math.ceil(local[0] + 6)); x++) {
              const d = (x - local[0]) ** 2 + (y - local[1]) ** 2 + (z - local[2]) ** 2
              if (d <= 36) marching.field[z * resolution ** 2 + y * resolution + x] += Math.exp(-d / 8)
            }
      }
      marching.update()
      floats += marching.count * 3
      if (floats > 150000 * 9) throw new Error('Surface exceeds the detail budget. Increase smoothing or show fewer members.')
      const positions = marching.positionArray.slice(0, marching.count * 3)
      for (let i = 0; i < positions.length; i++) positions[i] = origin[i % 3] + (positions[i] + 1) * resolution * spacing / 2
      chunks.push(positions)
      normalChunks.push(marching.normalArray.slice(0, marching.count * 3))
    }
  } finally {
    marching.geometry.dispose()
    material.dispose()
  }
  const positions = new Float32Array(floats)
  const normals = new Float32Array(floats)
  let offset = 0
  chunks.forEach((chunk, i) => { positions.set(chunk, offset); normals.set(normalChunks[i], offset); offset += chunk.length })
  return { positions, normals, kind: 'mesh', lowerDimensional: false }
}
