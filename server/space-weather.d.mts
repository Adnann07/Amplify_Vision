export function createSpaceWeatherHandler(options?: unknown): (request: unknown, response: unknown) => Promise<void>
export function createSpaceWeatherService(options?: unknown): {
  getFeed: (name: string, options?: { force?: boolean }) => Promise<unknown>
  getSummary: (options?: { force?: boolean }) => Promise<Record<string, unknown>>
  getStatus: () => Record<string, unknown>
}
