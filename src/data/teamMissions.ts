import type { MissionControlSession } from './missionControlSimulation'

export const teamMissionRoles = [
  'Mission lead',
  'Engineer',
  'Scientist',
  'Communications',
] as const

export type TeamMissionRole = (typeof teamMissionRoles)[number]

export interface TeamMissionParticipant {
  id: string
  name: string
  role: TeamMissionRole
}

export interface TeamMissionRoom {
  code: string
  missionTitle: string
  hostParticipantId: string
  participants: TeamMissionParticipant[]
  revision: number
  session: MissionControlSession
}

export interface TeamMissionMembership {
  room: TeamMissionRoom
  participantId: string
}

async function requestTeamApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const result: unknown = await response.json()
  if (!response.ok) {
    const message = result &&
      typeof result === 'object' &&
      'error' in result &&
      typeof result.error === 'string'
      ? result.error
      : 'The team mission request failed.'
    throw new Error(message)
  }
  return result as T
}

export function createTeamMission(
  session: MissionControlSession,
  name: string,
  role: TeamMissionRole,
) {
  return requestTeamApi<TeamMissionMembership>('/api/team-missions', {
    method: 'POST',
    body: JSON.stringify({ session, participant: { name, role } }),
  })
}

export function joinTeamMission(code: string, name: string, role: TeamMissionRole) {
  return requestTeamApi<TeamMissionMembership>(
    `/api/team-missions/${encodeURIComponent(code.trim().toUpperCase())}/join`,
    {
      method: 'POST',
      body: JSON.stringify({ participant: { name, role } }),
    },
  )
}

export async function getTeamMission(code: string, participantId: string) {
  const result = await requestTeamApi<{ room: TeamMissionRoom }>(
    `/api/team-missions/${encodeURIComponent(code)}?participantId=${encodeURIComponent(participantId)}`,
  )
  return result.room
}

export async function updateTeamMission(
  code: string,
  participantId: string,
  session: MissionControlSession,
) {
  const result = await requestTeamApi<{ room: TeamMissionRoom }>(
    `/api/team-missions/${encodeURIComponent(code)}/session?participantId=${encodeURIComponent(participantId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ session }),
    },
  )
  return result.room
}
