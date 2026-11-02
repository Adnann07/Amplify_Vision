import type { IncomingMessage, ServerResponse } from 'node:http'

export function createTeamMissionHandler(): (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>
