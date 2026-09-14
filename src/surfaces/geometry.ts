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

function hasVolume(points: Vector3[]) {
  if (points.length < 4) return false
  const origin = points[0]
  const edge = points.find((p) => p.distanceToSquared(origin) > 1e-12)?.clone().sub(origin)
  if (!edge) return false
  const normal = new Vector3()
  for (const p of points) {
    normal.crossVectors(edge, p.clone().sub(origin))
    if (normal.lengthSq() > 1e-12) break
  }
  if (normal.lengthSq() <= 1e-12) return false
  normal.normalize()
  return points.some((p) => Math.abs(normal.dot(p.clone().sub(origin))) > 1e-6)
}

/** Fixed, world-anchored voxels; independent tiles include a normal-sampling halo. */
export function buildSurfaceGeometry(points: Float32Array, sigma: number, method: 'smooth' | 'convex'): SurfaceGeometryData {
  const empty = { positions: new Float32Array(), normals: new Float32Array(), fallback: false }
  if (!points.length) return empty
  if (!(sigma > 0) || !Number.isFinite(sigma) || points.length % 3 || points.some((n) => !Number.isFinite(n))) throw new Error('Invalid surface coordinates or radius.')
  if (method === 'convex') {
    const vectors = Array.from({ length: points.length / 3 }, (_, i) => new Vector3(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]))
    if (hasVolume(vectors)) {
      const geometry = new ConvexGeometry(vectors)
      const result = { positions: new Float32Array(geometry.getAttribute('position').array), normals: new Float32Array(geometry.getAttribute('normal').array), fallback: false }
      geometry.dispose()
      return result
    }
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
  return { positions, normals, fallback: method === 'convex' }
}
