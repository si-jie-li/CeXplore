export interface CameraAngle {
  azimuthDegrees: number
  elevationDegrees: number
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
