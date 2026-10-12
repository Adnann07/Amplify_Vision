export function formatTimestamp(value: string | null, timeScale: 'UTC' | 'TDB' = 'UTC') {
  if (!value) return 'Not reported'
  if (timeScale === 'TDB' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    return `${value.replace('T', ' ')} TDB`
  }
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime())
    ? timestamp.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      })
    : 'Not reported'
}
