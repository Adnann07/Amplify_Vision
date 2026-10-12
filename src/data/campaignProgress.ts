import { campaignMissions, type CampaignMission } from './campaign'
import { isStoredEventCampaignMission } from './realTimeEvents'

export interface CampaignAttemptSummary {
  id: string
  missionId: string
  attemptNumber: number
  score: number
  status: 'Failed' | 'Partially successful' | 'Successful'
  objectiveAchieved: boolean
}

export interface CampaignProgress {
  version: 1
  completedMissionIds: string[]
  bestScores: Record<string, number>
  attempts: CampaignAttemptSummary[]
  allMissionsUnlocked: boolean
  eventMissions: CampaignMission[]
}

export const CAMPAIGN_PROGRESS_STORAGE_KEY = 'amplify-vision-campaign-progress-v1'
const CAMPAIGN_UNLOCK_CODE = '6767'

export function createEmptyCampaignProgress(): CampaignProgress {
  return {
    version: 1,
    completedMissionIds: [],
    bestScores: {},
    attempts: [],
    allMissionsUnlocked: false,
    eventMissions: [],
  }
}

export function isCampaignUnlockCode(code: string) {
  return code === CAMPAIGN_UNLOCK_CODE
}

export function unlockAllCampaignMissions(progress: CampaignProgress): CampaignProgress {
  return { ...progress, allMissionsUnlocked: true }
}

export function loadCampaignProgress(): { progress: CampaignProgress; warning: string | null } {
  try {
    const stored = window.localStorage.getItem(CAMPAIGN_PROGRESS_STORAGE_KEY)
    if (!stored) return { progress: createEmptyCampaignProgress(), warning: null }

    const parsed: unknown = JSON.parse(stored)
    const normalized = normalizeCampaignProgress(parsed)
    if (!normalized) {
      const warning = 'Saved campaign progress was invalid and has been reset.'
      console.warn(warning)
      return { progress: createEmptyCampaignProgress(), warning }
    }

    return {
      progress: normalized.progress,
      warning: normalized.discardedEventMissions
        ? 'Some invalid saved live-event mission snapshots were removed; other campaign progress was preserved.'
        : null,
    }
  } catch (error) {
    const warning = 'Campaign progress could not be loaded from this browser.'
    console.warn(warning, error)
    return { progress: createEmptyCampaignProgress(), warning }
  }
}

export function saveCampaignProgress(progress: CampaignProgress): string | null {
  try {
    window.localStorage.setItem(CAMPAIGN_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
    return null
  } catch (error) {
    console.error('Campaign progress could not be saved to this browser.', error)
    return 'Campaign progress could not be saved. Check this browser’s storage settings.'
  }
}

function normalizeCampaignProgress(value: unknown): {
  progress: CampaignProgress
  discardedEventMissions: boolean
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const progress = value as Partial<CampaignProgress>
  const staticMissionIds = new Set(campaignMissions.map((mission) => mission.id))
  const rawEventMissions = Array.isArray(progress.eventMissions) ? progress.eventMissions : []
  const eventMissions = rawEventMissions.filter(isStoredEventCampaignMission)
  const validMissionIds = new Set([...staticMissionIds, ...eventMissions.map((mission) => mission.id)])
  const discardedEventMissions =
    progress.eventMissions !== undefined &&
    (!Array.isArray(progress.eventMissions) || rawEventMissions.length !== eventMissions.length)
  const normalized = {
    ...progress,
    eventMissions,
    completedMissionIds: Array.isArray(progress.completedMissionIds)
      ? progress.completedMissionIds.filter((id) => typeof id === 'string' && validMissionIds.has(id))
      : progress.completedMissionIds,
    bestScores: progress.bestScores && typeof progress.bestScores === 'object' && !Array.isArray(progress.bestScores)
      ? Object.fromEntries(Object.entries(progress.bestScores).filter(([id]) => validMissionIds.has(id)))
      : progress.bestScores,
    attempts: Array.isArray(progress.attempts)
      ? progress.attempts.filter((attempt) =>
          !!attempt && typeof attempt.missionId === 'string' && validMissionIds.has(attempt.missionId),
        )
      : progress.attempts,
  }

  if (!(
    normalized.version === 1 &&
    (normalized.allMissionsUnlocked === undefined || typeof normalized.allMissionsUnlocked === 'boolean') &&
    Array.isArray(normalized.completedMissionIds) &&
    normalized.completedMissionIds.every((id) => typeof id === 'string' && validMissionIds.has(id)) &&
    normalized.bestScores !== null &&
    typeof normalized.bestScores === 'object' &&
    !Array.isArray(normalized.bestScores) &&
    Object.entries(normalized.bestScores).every(
      ([id, score]) =>
        validMissionIds.has(id) && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100,
    ) &&
    Array.isArray(normalized.attempts) &&
    normalized.attempts.every(
      (attempt) =>
        !!attempt &&
        typeof attempt.id === 'string' &&
        typeof attempt.missionId === 'string' &&
        validMissionIds.has(attempt.missionId) &&
        typeof attempt.attemptNumber === 'number' &&
        Number.isInteger(attempt.attemptNumber) &&
        attempt.attemptNumber > 0 &&
        typeof attempt.score === 'number' &&
        Number.isFinite(attempt.score) &&
        attempt.score >= 0 &&
        attempt.score <= 100 &&
        (attempt.status === 'Failed' ||
          attempt.status === 'Partially successful' ||
          attempt.status === 'Successful') &&
        typeof attempt.objectiveAchieved === 'boolean',
    )
  )) return null
  return {
    progress: {
      ...normalized,
      allMissionsUnlocked: normalized.allMissionsUnlocked === true,
    } as CampaignProgress,
    discardedEventMissions,
  }
}
