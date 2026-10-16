import type { IncomingMessage, ServerResponse } from 'node:http'

export function createJunoTrajectoryHandler(options?: {
  fetchImpl?: typeof fetch
}): (request: IncomingMessage, response: ServerResponse) => Promise<void>
