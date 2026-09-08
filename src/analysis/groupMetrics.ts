import type { AnalysisMetric, MetricValue, ShapeValue } from './types'

export interface SpatialPoint {
  x: number
  y: number
  z: number
}

export interface KnnGraph {
  edges: Array<[number, number]>
  adjacency: number[][]
}

export interface RawMetricValues {
  purity?: number | null
  connectedness?: number | null
  compactness?: number | null
  shape?: number | null
  shapeEigenvalues?: [number, number, number] | null
}

const EPSILON = 1e-12

const squaredDistance = (a: SpatialPoint, b: SpatialPoint) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}

export function buildSymmetricKnnGraph(points: SpatialPoint[], requestedK: number): KnnGraph {
  const adjacencySets = points.map(() => new Set<number>())
  const k = Math.max(0, Math.min(Math.round(requestedK), points.length - 1))
  if (!k) return { edges: [], adjacency: points.map(() => []) }

  points.forEach((point, index) => {
    const nearest: Array<{ candidateIndex: number; distance: number }> = []
    points.forEach((candidate, candidateIndex) => {
      if (candidateIndex === index) return
      const item = { candidateIndex, distance: squaredDistance(point, candidate) }
      let insertion = nearest.findIndex((current) =>
        item.distance < current.distance
        || (item.distance === current.distance && item.candidateIndex < current.candidateIndex),
      )
      if (insertion < 0) insertion = nearest.length
      if (insertion < k) nearest.splice(insertion, 0, item)
      if (nearest.length > k) nearest.pop()
    })
    for (const { candidateIndex } of nearest) {
      adjacencySets[index].add(candidateIndex)
      adjacencySets[candidateIndex].add(index)
    }
  })

  const edges: Array<[number, number]> = []
  adjacencySets.forEach((neighbors, index) => {
    for (const neighbor of neighbors) if (index < neighbor) edges.push([index, neighbor])
  })
  return { edges, adjacency: adjacencySets.map((neighbors) => [...neighbors]) }
}

export function calculatePurity(graph: KnnGraph, groupIndices: number[]) {
  const group = new Set(groupIndices)
  let internalEdges = 0
  let boundaryEdges = 0
  for (const [a, b] of graph.edges) {
    const aInside = group.has(a)
    const bInside = group.has(b)
    if (aInside && bInside) internalEdges += 1
    else if (aInside || bInside) boundaryEdges += 1
  }
  const denominator = internalEdges * 2 + boundaryEdges
  return denominator ? (internalEdges * 2) / denominator : groupIndices.length === 1 ? 0 : null
}

export function calculateLargestConnectedFraction(graph: KnnGraph, groupIndices: number[]) {
  if (!groupIndices.length) return null
  if (groupIndices.length === 1) return 1
  const group = new Set(groupIndices)
  const visited = new Set<number>()
  let largest = 0
  for (const start of groupIndices) {
    if (visited.has(start)) continue
    let size = 0
    const stack = [start]
    visited.add(start)
    while (stack.length) {
      const current = stack.pop()!
      size += 1
      for (const neighbor of graph.adjacency[current]) {
        if (group.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor)
          stack.push(neighbor)
        }
      }
    }
    largest = Math.max(largest, size)
  }
  return largest / groupIndices.length
}

export function calculateRadiusOfGyration(points: SpatialPoint[], groupIndices: number[]) {
  if (!groupIndices.length) return null
  const centroid = groupIndices.reduce(
    (sum, index) => ({ x: sum.x + points[index].x, y: sum.y + points[index].y, z: sum.z + points[index].z }),
    { x: 0, y: 0, z: 0 },
  )
  centroid.x /= groupIndices.length
  centroid.y /= groupIndices.length
  centroid.z /= groupIndices.length
  const meanSquaredDistance = groupIndices.reduce(
    (sum, index) => sum + squaredDistance(points[index], centroid),
    0,
  ) / groupIndices.length
  return Math.sqrt(meanSquaredDistance)
}

function covarianceEigenvalues(points: SpatialPoint[], groupIndices: number[]): [number, number, number] | null {
  if (groupIndices.length < 2) return null
  const centroid = groupIndices.reduce(
    (sum, index) => ({ x: sum.x + points[index].x, y: sum.y + points[index].y, z: sum.z + points[index].z }),
    { x: 0, y: 0, z: 0 },
  )
  centroid.x /= groupIndices.length
  centroid.y /= groupIndices.length
  centroid.z /= groupIndices.length

  const matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const index of groupIndices) {
    const vector = [points[index].x - centroid.x, points[index].y - centroid.y, points[index].z - centroid.z]
    for (let row = 0; row < 3; row += 1) {
      for (let column = row; column < 3; column += 1) {
        matrix[row][column] += vector[row] * vector[column]
      }
    }
  }
  for (let row = 0; row < 3; row += 1) {
    for (let column = row; column < 3; column += 1) {
      matrix[row][column] /= groupIndices.length
      matrix[column][row] = matrix[row][column]
    }
  }

  for (let iteration = 0; iteration < 24; iteration += 1) {
    let p = 0
    let q = 1
    let largest = Math.abs(matrix[0][1])
    for (const [row, column] of [[0, 2], [1, 2]] as const) {
      if (Math.abs(matrix[row][column]) > largest) {
        largest = Math.abs(matrix[row][column])
        p = row
        q = column
      }
    }
    if (largest < EPSILON) break
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p])
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const app = cosine * cosine * matrix[p][p] - 2 * sine * cosine * matrix[p][q] + sine * sine * matrix[q][q]
    const aqq = sine * sine * matrix[p][p] + 2 * sine * cosine * matrix[p][q] + cosine * cosine * matrix[q][q]
    for (let index = 0; index < 3; index += 1) {
      if (index === p || index === q) continue
      const aip = cosine * matrix[index][p] - sine * matrix[index][q]
      const aiq = sine * matrix[index][p] + cosine * matrix[index][q]
      matrix[index][p] = aip
      matrix[p][index] = aip
      matrix[index][q] = aiq
      matrix[q][index] = aiq
    }
    matrix[p][p] = app
    matrix[q][q] = aqq
    matrix[p][q] = 0
    matrix[q][p] = 0
  }
  return [matrix[0][0], matrix[1][1], matrix[2][2]]
    .map((value) => Math.max(0, value))
    .sort((a, b) => b - a) as [number, number, number]
}

export function calculateShape(points: SpatialPoint[], groupIndices: number[]) {
  const eigenvalues = covarianceEigenvalues(points, groupIndices)
  if (!eigenvalues || eigenvalues[0] < EPSILON) return { anisotropy: null, eigenvalues }
  return { anisotropy: (eigenvalues[0] - eigenvalues[2]) / eigenvalues[0], eigenvalues }
}

export function calculateRawMetrics(
  points: SpatialPoint[],
  graph: KnnGraph,
  groupIndices: number[],
  metrics: Set<AnalysisMetric>,
  apSpan: number,
): RawMetricValues {
  const result: RawMetricValues = {}
  if (metrics.has('purity')) result.purity = calculatePurity(graph, groupIndices)
  if (metrics.has('connectedness')) result.connectedness = calculateLargestConnectedFraction(graph, groupIndices)
  if (metrics.has('compactness')) {
    const radius = calculateRadiusOfGyration(points, groupIndices)
    result.compactness = radius === null || apSpan <= EPSILON ? null : radius / apSpan
  }
  if (metrics.has('shape')) {
    const shape = calculateShape(points, groupIndices)
    result.shape = shape.anisotropy
    result.shapeEigenvalues = shape.eigenvalues
  }
  return result
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

export function addNullComparison(value: number | null | undefined, nullValues: Array<number | null | undefined>): MetricValue {
  const validNull = nullValues.filter((item): item is number => item !== null && item !== undefined && Number.isFinite(item))
  if (value === null || value === undefined || !Number.isFinite(value) || !validNull.length) {
    return { value: value ?? null, nullMean: null, nullSd: null, zScore: null, percentile: null }
  }
  const nullMean = mean(validNull)
  const variance = mean(validNull.map((item) => (item - nullMean) ** 2))
  const nullSd = Math.sqrt(variance)
  const belowOrEqual = validNull.filter((item) => item <= value).length
  return {
    value,
    nullMean,
    nullSd,
    zScore: nullSd > EPSILON ? (value - nullMean) / nullSd : null,
    percentile: (belowOrEqual + 1) / (validNull.length + 1),
  }
}

export function addShapeNullComparison(
  value: number | null | undefined,
  eigenvalues: [number, number, number] | null | undefined,
  nullValues: Array<number | null | undefined>,
): ShapeValue {
  return { ...addNullComparison(value, nullValues), eigenvalues: eigenvalues ?? null }
}
