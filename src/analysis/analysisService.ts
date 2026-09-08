import { runGroupAnalysis } from './runAnalysis'
import type { AnalysisProgress, AnalysisWorkerResponse, GroupAnalysisRequest, GroupAnalysisResult } from './types'

export interface AnalysisJob {
  promise: Promise<GroupAnalysisResult>
  cancel: () => void
}

let requestId = 0

export function startGroupAnalysis(
  request: GroupAnalysisRequest,
  onProgress?: (progress: AnalysisProgress) => void,
): AnalysisJob {
  const id = requestId += 1
  if (typeof Worker === 'undefined') {
    let cancelled = false
    return {
      promise: new Promise((resolve, reject) => {
        setTimeout(() => {
          if (cancelled) {
            reject(new Error('Analysis cancelled.'))
            return
          }
          try {
            resolve(runGroupAnalysis(request, onProgress))
          } catch (error) {
            reject(error)
          }
        }, 0)
      }),
      cancel: () => { cancelled = true },
    }
  }

  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  let settled = false
  const promise = new Promise<GroupAnalysisResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      if (event.data.id !== id) return
      if (event.data.type === 'progress') onProgress?.(event.data.progress)
      if (event.data.type === 'result') {
        settled = true
        worker.terminate()
        resolve(event.data.result)
      }
      if (event.data.type === 'error') {
        settled = true
        worker.terminate()
        reject(new Error(event.data.message))
      }
    }
    worker.onerror = (event) => {
      settled = true
      worker.terminate()
      reject(new Error(event.message || 'Analysis worker failed.'))
    }
    worker.postMessage({ id, request })
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
