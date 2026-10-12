export interface KIndexChartMeasurement {
  time: string
  kp: number
}

export function prepareKIndexChart(measurements: KIndexChartMeasurement[]) {
  const visible = measurements.slice(-48)
  if (visible.length === 0) return []
  const left = 42
  const right = 590
  const top = 24
  const bottom = 150
  return visible.map((measurement, index) => ({
    ...measurement,
    x: visible.length === 1 ? (left + right) / 2 : left + (index / (visible.length - 1)) * (right - left),
    y: bottom - (Math.max(0, Math.min(9, measurement.kp)) / 9) * (bottom - top),
  }))
}
