import { describe, expect, it } from 'vitest'
import { cameraOffsetFromAngles, clampElevation } from './camera'

describe('numeric camera angles', () => {
  it('maps cardinal azimuths onto the AP/VD axes while preserving distance', () => {
    expect(cameraOffsetFromAngles(0, 0, 10)).toEqual([0, 0, 10])
    const positiveAp = cameraOffsetFromAngles(90, 0, 10)
    expect(positiveAp[0]).toBeCloseTo(10)
    expect(positiveAp[1]).toBeCloseTo(0)
    expect(positiveAp[2]).toBeCloseTo(0)
  })

  it('clamps elevation short of the OrbitControls poles', () => {
    expect(clampElevation(120)).toBe(89.9)
    expect(clampElevation(-120)).toBe(-89.9)
    const upperLr = cameraOffsetFromAngles(0, 90, 8)
    expect(upperLr[1]).toBeCloseTo(8, 4)
  })
})
