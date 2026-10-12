import type { IncomingMessage, ServerResponse } from 'node:http'

export function createMissionControlHandler(dependencies?: Record<string, unknown>): (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>
