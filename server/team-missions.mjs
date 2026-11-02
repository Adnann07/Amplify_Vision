import { randomBytes, randomUUID } from 'node:crypto'

const MAX_BODY_BYTES = 1_000_000
const MAX_ROOMS = 1_000
const ROOM_TTL_MS = 4 * 60 * 60 * 1000
const TEAM_ROLES = new Set(['Mission lead', 'Engineer', 'Scientist', 'Communications'])
const rooms = new Map()

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

async function readJson(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) throw new RangeError('The team request is too large.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new TypeError('Send a valid JSON request.')
  }
}

function cleanExpiredRooms() {
  const cutoff = Date.now() - ROOM_TTL_MS
  for (const [code, room] of rooms) {
    if (room.updatedAt < cutoff) rooms.delete(code)
  }
}

function serializeRoom(room) {
  const { updatedAt: _updatedAt, ...publicRoom } = room
  return publicRoom
}

function validateParticipant(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Include a participant name and role.')
  }
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 24) : ''
  const role = value.role
  if (!name || typeof role !== 'string' || !TEAM_ROLES.has(role)) {
    throw new TypeError('Choose a name and a valid team role.')
  }
  return { name, role }
}

function validateSession(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    value.record?.mode !== 'mission' ||
    typeof value.missionId !== 'string' ||
    typeof value.record?.attemptId !== 'number' ||
    !value.state ||
    typeof value.state !== 'object' ||
    Array.isArray(value.state)
  ) {
    throw new TypeError('A valid Mission Mode session is required.')
  }
  return value
}

function makeRoomCode() {
  return randomBytes(4).toString('hex').toUpperCase()
}

function getRoom(code) {
  cleanExpiredRooms()
  return rooms.get(code)
}

function markActive(room) {
  room.updatedAt = Date.now()
}

export function createTeamMissionHandler() {
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const match = url.pathname.match(/^\/api\/team-missions(?:\/([A-Z0-9]{8})(?:\/(join|session))?)?$/)
    if (!match) {
      sendJson(response, 404, { error: 'Team mission endpoint not found.' })
      return
    }

    try {
      const [, code, action] = match
      if (!code && request.method === 'POST') {
        cleanExpiredRooms()
        if (rooms.size >= MAX_ROOMS) {
          sendJson(response, 503, { error: 'Team rooms are full. Try again later.' })
          return
        }
        const body = await readJson(request)
        const participant = validateParticipant(body.participant)
        const session = validateSession(body.session)
        let roomCode = makeRoomCode()
        while (rooms.has(roomCode)) roomCode = makeRoomCode()
        const participantId = randomUUID()
        const room = {
          code: roomCode,
          missionTitle: session.missionTitle,
          hostParticipantId: participantId,
          participants: [{ id: participantId, ...participant }],
          revision: 1,
          session,
          updatedAt: Date.now(),
        }
        rooms.set(roomCode, room)
        sendJson(response, 201, { room: serializeRoom(room), participantId })
        return
      }

      const room = getRoom(code)
      if (!room) {
        sendJson(response, 404, { error: 'That team code is invalid or has expired.' })
        return
      }

      if (action === 'join' && request.method === 'POST') {
        const body = await readJson(request)
        const participant = validateParticipant(body.participant)
        if (room.participants.length >= 4) {
          sendJson(response, 409, { error: 'This team already has four participants.' })
          return
        }
        const participantId = randomUUID()
        room.participants.push({ id: participantId, ...participant })
        room.revision += 1
        markActive(room)
        sendJson(response, 200, { room: serializeRoom(room), participantId })
        return
      }

      const participantId = url.searchParams.get('participantId')
      if (!participantId || !room.participants.some((participant) => participant.id === participantId)) {
        sendJson(response, 403, { error: 'Join this team with its code before accessing the mission.' })
        return
      }

      if (!action && request.method === 'GET') {
        markActive(room)
        sendJson(response, 200, { room: serializeRoom(room) })
        return
      }

      if (action === 'session' && request.method === 'PUT') {
        const body = await readJson(request)
        const session = validateSession(body.session)
        if (
          session.missionId !== room.session.missionId ||
          session.record.attemptId !== room.session.record.attemptId
        ) {
          sendJson(response, 409, { error: 'The shared mission cannot be changed while a team is active.' })
          return
        }
        room.session = session
        room.revision += 1
        markActive(room)
        sendJson(response, 200, { room: serializeRoom(room) })
        return
      }

      sendJson(response, 405, { error: 'This team mission method is not supported.' })
    } catch (error) {
      const status = error instanceof RangeError ? 413 : 400
      sendJson(response, status, {
        error: error instanceof Error ? error.message : 'The team request could not be processed.',
      })
    }
  }
}
