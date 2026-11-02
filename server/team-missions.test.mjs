import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createTeamMissionHandler } from './team-missions.mjs'

const missionSession = (elapsedSeconds = 0) => ({
  version: 1,
  missionId: 'mars-survey',
  missionTitle: 'Mars Survey',
  record: { mode: 'mission', attemptId: 1 },
  state: { elapsedSeconds },
})

async function withApi(callback) {
  const server = createServer(createTeamMissionHandler())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server failed to start.')
  try {
    await callback(`http://127.0.0.1:${address.port}/api/team-missions`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

async function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('team mission rooms', () => {
  it('creates a code, limits the team to four, and shares the current mission state', async () => {
    await withApi(async (baseUrl) => {
      const createdResponse = await postJson(baseUrl, {
        session: missionSession(),
        participant: { name: 'Commander', role: 'Mission lead' },
      })
      expect(createdResponse.status).toBe(201)
      const created = await createdResponse.json()
      expect(created.room.code).toMatch(/^[A-F0-9]{8}$/)
      expect(created.room.participants).toHaveLength(1)

      const deniedResponse = await fetch(
        `${baseUrl}/${created.room.code}?participantId=not-a-member`,
      )
      expect(deniedResponse.status).toBe(403)

      const roles = ['Engineer', 'Scientist', 'Communications']
      const members = []
      for (const [index, role] of roles.entries()) {
        const joinedResponse = await postJson(`${baseUrl}/${created.room.code}/join`, {
          participant: { name: `Member ${index + 1}`, role },
        })
        expect(joinedResponse.status).toBe(200)
        members.push(await joinedResponse.json())
      }

      const fullResponse = await postJson(`${baseUrl}/${created.room.code}/join`, {
        participant: { name: 'Extra', role: 'Scientist' },
      })
      expect(fullResponse.status).toBe(409)

      const updateResponse = await fetch(
        `${baseUrl}/${created.room.code}/session?participantId=${created.participantId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: missionSession(90) }),
        },
      )
      expect(updateResponse.status).toBe(200)

      const latestResponse = await fetch(
        `${baseUrl}/${created.room.code}?participantId=${members[0].participantId}`,
      )
      const latest = await latestResponse.json()
      expect(latest.room.session.state.elapsedSeconds).toBe(90)
      expect(latest.room.participants).toHaveLength(4)
    })
  })

  it('rejects invalid roles and attempts to replace the shared mission', async () => {
    await withApi(async (baseUrl) => {
      const createdResponse = await postJson(baseUrl, {
        session: missionSession(),
        participant: { name: 'Host', role: 'Mission lead' },
      })
      const created = await createdResponse.json()

      const invalidJoin = await postJson(`${baseUrl}/${created.room.code}/join`, {
        participant: { name: 'Guest', role: 'Admin' },
      })
      expect(invalidJoin.status).toBe(400)

      const changedMission = missionSession()
      changedMission.missionId = 'different-mission'
      const update = await fetch(
        `${baseUrl}/${created.room.code}/session?participantId=${created.participantId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: changedMission }),
        },
      )
      expect(update.status).toBe(409)
    })
  })
})
