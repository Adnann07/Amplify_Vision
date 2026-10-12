import type { IncomingMessage, ServerResponse } from 'node:http'

export class ObservationImageryError extends Error {
  statusCode: number
}

export function normalizeLandsatItems(body: unknown, targetId: string): unknown[]
export function normalizeEpicImages(body: unknown): unknown[]
export function normalizeNasaArchive(body: unknown, targetBody: string): unknown[]

export function createObservationImageryService(options?: {
  fetchImpl?: typeof fetch
  now?: () => Date
  timeoutMs?: number
  cache?: Map<string, { value: unknown; expiresAt: number }>
}): {
  getLandsat: (targetId: string | null, date: string | null) => Promise<unknown>
  getEpic: (date: string | null) => Promise<unknown>
  getPlanetaryArchive: (targetBody: string | null) => Promise<unknown>
}

export function createObservationImageryHandler(options?: {
  service?: ReturnType<typeof createObservationImageryService>
}): (request: IncomingMessage, response: ServerResponse) => Promise<void>
