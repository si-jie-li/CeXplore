export interface CameraAngle {
  azimuthDegrees: number
  elevationDegrees: number
  rollDegrees: number
}

export const clampElevation = (degrees: number) => Math.max(-89.9, Math.min(89.9, degrees))

/**
 * OrbitControls uses LR/Y as the up axis. Azimuth 0° looks from +VD/Z;
 * positive azimuth rotates toward +AP/X. Elevation is measured above the
 * AP–VD plane. The returned vector is an offset from the current orbit target.
 */
export function cameraOffsetFromAngles(
  azimuthDegrees: number,
  elevationDegrees: number,
  distance: number,
): [number, number, number] {
  const azimuth = azimuthDegrees * Math.PI / 180
  const elevation = clampElevation(elevationDegrees) * Math.PI / 180
  const horizontal = Math.max(distance, 0.001) * Math.cos(elevation)
  return [
    horizontal * Math.sin(azimuth),
    Math.max(distance, 0.001) * Math.sin(elevation),
    horizontal * Math.cos(azimuth),
  ]
}

/** Returns a normalized camera up-vector after roll around the viewing axis. */
export function cameraUpFromAngles(
  azimuthDegrees: number,
  elevationDegrees: number,
  rollDegrees: number,
): [number, number, number] {
  const offset = cameraOffsetFromAngles(azimuthDegrees, elevationDegrees, 1)
  const view = [-offset[0], -offset[1], -offset[2]]
  const reference = Math.abs(view[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0]
  const dot = reference[0] * view[0] + reference[1] * view[1] + reference[2] * view[2]
  const projected = [
    reference[0] - dot * view[0],
    reference[1] - dot * view[1],
    reference[2] - dot * view[2],
  ]
  const length = Math.hypot(...projected) || 1
  const up = projected.map((value) => value / length)
  const radians = rollDegrees * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const cross = [
    view[1] * up[2] - view[2] * up[1],
    view[2] * up[0] - view[0] * up[2],
    view[0] * up[1] - view[1] * up[0],
  ]
  return [
    up[0] * cosine + cross[0] * sine,
    up[1] * cosine + cross[1] * sine,
    up[2] * cosine + cross[2] * sine,
  ]
}
