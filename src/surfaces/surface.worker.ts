import { buildSurfaceGeometry, estimateSurfaceSigma } from './geometry'
import type { SurfaceWorkerRequest, SurfaceWorkerResponse } from './types'

const scope = self as unknown as { onmessage: (event: MessageEvent<SurfaceWorkerRequest>) => void; postMessage: (message: SurfaceWorkerResponse, transfer?: Transferable[]) => void }
scope.onmessage = ({ data }) => {
  try {
    if (data.type === 'scale') scope.postMessage({ id: data.id, type: 'scale', sigma: estimateSurfaceSigma(data.frames) })
    else {
      const geometry = buildSurfaceGeometry(data.points, data.sigma, data.method)
      scope.postMessage({ id: data.id, type: 'mesh', geometry }, [geometry.positions.buffer as ArrayBuffer, geometry.normals.buffer as ArrayBuffer])
    }
  } catch (error) {
    scope.postMessage({ id: data.id, type: 'error', message: error instanceof Error ? error.message : 'Surface calculation failed.' })
  }
}
