import { runGroupAnalysis } from './runAnalysis'
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from './types'

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<AnalysisWorkerRequest>) => void) | null
  postMessage: (message: AnalysisWorkerResponse) => void
}

workerScope.onmessage = (event) => {
  const { id, request } = event.data
  try {
    const result = runGroupAnalysis(request, (progress) => {
      workerScope.postMessage({ id, type: 'progress', progress })
    })
    workerScope.postMessage({ id, type: 'result', result })
  } catch (error) {
    workerScope.postMessage({
      id,
      type: 'error',
      message: error instanceof Error ? error.message : 'Analysis failed.',
    })
  }
}

export {}
