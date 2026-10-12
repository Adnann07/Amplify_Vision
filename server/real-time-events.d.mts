import type { IncomingMessage, ServerResponse } from 'node:http'

export class RealTimeEventsError extends Error {
  statusCode: number
}

export function normalizeEonetEvents(body: unknown, retrievedAt?: Date): unknown[]
export function normalizeJplCad(body: unknown, retrievedAt?: Date): unknown[]

export function createRealTimeEventsService(options?: {
  fetchImpl?: typeof fetch
  now?: () => Date
  timeoutMs?: number
  cacheStore?: Map<string, unknown>
  pendingRequests?: Map<string, Promise<unknown>>
  spaceWeatherService?: {
    getFeed: (name: string, options?: { force?: boolean }) => Promise<unknown>
  }
}): {
  getAll: (options?: { force?: boolean }) => Promise<unknown>
  getEvent: (provider: string, providerEventId: string) => Promise<unknown>
  refresh: (options?: { force?: boolean }) => Promise<unknown>
  getStatus: () => Record<string, unknown>
}

export function createRealTimeEventsHandler(options?: {
  service?: ReturnType<typeof createRealTimeEventsService>
}): (request: IncomingMessage, response: ServerResponse) => Promise<void>
