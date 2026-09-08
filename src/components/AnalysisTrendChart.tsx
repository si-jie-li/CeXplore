import { useMemo } from 'react'
import type { AnalysisMetric, GroupAnalysisResult } from '../analysis/types'
import { metricInfo, metricValue, quantile } from '../analysis/resultUtils'

const WIDTH = 360
const HEIGHT = 112
const MARGIN = { left: 30, right: 8, top: 12, bottom: 20 }

function svgPath(points: Array<[number, number]>) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

export function AnalysisTrendChart({
  result,
  metric,
  currentStep,
  onStepChange,
}: {
  result: GroupAnalysisResult
  metric: AnalysisMetric
  currentStep: number
  onStepChange: (step: number) => void
}) {
  const series = useMemo(() => {
    const byStep = new Map<number, number[]>()
    for (const point of result.points) {
      const value = metricValue(point, metric)?.value
      if (value === null || value === undefined) continue
      const values = byStep.get(point.step) ?? []
      values.push(value)
      byStep.set(point.step, values)
    }
    return [...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([step, values]) => ({
      step,
      median: quantile(values, 0.5)!,
      q1: quantile(values, 0.25)!,
      q3: quantile(values, 0.75)!,
      count: values.length,
    }))
  }, [metric, result])

  if (!series.length) {
    return <div className="analysis-chart-empty">No observations for this metric.</div>
  }

  const xMin = series[0].step
  const xMax = series[series.length - 1].step
  const observedMax = Math.max(...series.map((entry) => entry.q3), 0)
  const yMin = 0
  const yMax = metric === 'compactness' ? Math.max(observedMax * 1.12, 0.05) : 1
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (step: number) => MARGIN.left + ((step - xMin) / Math.max(xMax - xMin, 1)) * plotWidth
  const y = (value: number) => MARGIN.top + (1 - (value - yMin) / Math.max(yMax - yMin, Number.EPSILON)) * plotHeight
  const line = svgPath(series.map((entry) => [x(entry.step), y(entry.median)]))
  const band = `${svgPath(series.map((entry) => [x(entry.step), y(entry.q3)]))} ${svgPath([...series].reverse().map((entry) => [x(entry.step), y(entry.q1)])).replace(/^M/, 'L')} Z`
  const markerX = x(Math.max(xMin, Math.min(currentStep, xMax)))

  return (
    <article className="analysis-chart-card">
      <div className="analysis-chart-heading">
        <strong>{metricInfo[metric].shortLabel}</strong>
        <span>{metricInfo[metric].direction === 'low' ? 'lower = compact' : 'higher = stronger'}</span>
      </div>
      <svg
        className="analysis-trend-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${metricInfo[metric].label} over ${result.temporalMode}`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const relative = (event.clientX - rect.left) / Math.max(rect.width, 1)
          const svgX = relative * WIDTH
          const clickedStep = xMin + ((svgX - MARGIN.left) / plotWidth) * (xMax - xMin)
          const nearest = series.reduce((best, entry) =>
            Math.abs(entry.step - clickedStep) < Math.abs(best.step - clickedStep) ? entry : best,
          )
          onStepChange(nearest.step)
        }}
      >
        <line className="analysis-axis" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={HEIGHT - MARGIN.bottom} y2={HEIGHT - MARGIN.bottom} />
        <line className="analysis-gridline" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={MARGIN.top} y2={MARGIN.top} />
        <line className="analysis-gridline" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={MARGIN.top + plotHeight / 2} y2={MARGIN.top + plotHeight / 2} />
        <path className="analysis-iqr" d={band} />
        <path className="analysis-median-line" d={line} style={{ stroke: result.group.color }} />
        <line className="analysis-current-line" x1={markerX} x2={markerX} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
        <text className="analysis-axis-label" x={MARGIN.left - 4} y={MARGIN.top + 3} textAnchor="end">{yMax.toFixed(metric === 'compactness' ? 2 : 1)}</text>
        <text className="analysis-axis-label" x={MARGIN.left - 4} y={HEIGHT - MARGIN.bottom + 3} textAnchor="end">0</text>
        <text className="analysis-axis-label" x={MARGIN.left} y={HEIGHT - 5}>{xMin}</text>
        <text className="analysis-axis-label" x={WIDTH - MARGIN.right} y={HEIGHT - 5} textAnchor="end">{xMax}</text>
      </svg>
      <span className="analysis-chart-caption">Median and interquartile range · click to move playback</span>
    </article>
  )
}
