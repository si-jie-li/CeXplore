import { computeMeanPositions, type MeanPositionRequest } from './meanPositionComputation'
import type { MeanPositionWorkerRequest, MeanPositionWorkerResponse } from './meanPositionService'

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MeanPositionWorkerRequest>) => void) | null
  postMessage: (message: MeanPositionWorkerResponse) => void
}

workerScope.onmessage = (event) => {
  const { id, request } = event.data
  try {
    workerScope.postMessage({ id, type: 'result', result: computeMeanPositions(request as MeanPositionRequest) })
  } catch (error) {
    workerScope.postMessage({
      id,
      type: 'error',
      message: error instanceof Error ? error.message : 'Mean-position precomputation failed.',
    })
  }
}

export {}
