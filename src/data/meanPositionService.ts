import { computeMeanPositions, type MeanPositionRequest } from './meanPositionComputation'
import type { MeanPositionSerializedCache } from './embryoView'

export interface MeanPositionWorkerRequest {
  id: number
  request: MeanPositionRequest
}

export type MeanPositionWorkerResponse =
  | { id: number; type: 'result'; result: MeanPositionSerializedCache }
  | { id: number; type: 'error'; message: string }

export interface MeanPositionJob {
  promise: Promise<MeanPositionSerializedCache>
  cancel: () => void
}

let requestId = 0

export function startMeanPositionPrecomputation(request: MeanPositionRequest): MeanPositionJob {
  const id = requestId += 1
  if (typeof Worker === 'undefined') {
    let cancelled = false
    return {
      promise: new Promise((resolve, reject) => {
        setTimeout(() => {
          if (cancelled) {
            reject(new Error('Mean-position precomputation cancelled.'))
            return
          }
          try {
            resolve(computeMeanPositions(request))
          } catch (error) {
            reject(error)
          }
        }, 0)
      }),
      cancel: () => { cancelled = true },
    }
  }

  const worker = new Worker(new URL('./meanPosition.worker.ts', import.meta.url), { type: 'module' })
  let settled = false
  const promise = new Promise<MeanPositionSerializedCache>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<MeanPositionWorkerResponse>) => {
      if (event.data.id !== id) return
      settled = true
      worker.terminate()
      if (event.data.type === 'result') resolve(event.data.result)
      else reject(new Error(event.data.message))
    }
    worker.onerror = (event) => {
      settled = true
      worker.terminate()
      reject(new Error(event.message || 'Mean-position precomputation worker failed.'))
    }
    worker.postMessage({ id, request } satisfies MeanPositionWorkerRequest)
  })
  return {
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      worker.terminate()
    },
  }
}
