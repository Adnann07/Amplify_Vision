import { campaignMissions } from './campaign'

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
}

export const CAMPAIGN_PROGRESS_STORAGE_KEY = 'amplify-vision-campaign-progress-v1'

export function createEmptyCampaignProgress(): CampaignProgress {
  return {
    version: 1,
    completedMissionIds: [],
    bestScores: {},
    attempts: [],
  }
}

export function loadCampaignProgress(): { progress: CampaignProgress; warning: string | null } {
  try {
    const stored = window.localStorage.getItem(CAMPAIGN_PROGRESS_STORAGE_KEY)
    if (!stored) return { progress: createEmptyCampaignProgress(), warning: null }

    const parsed: unknown = JSON.parse(stored)
    if (!isCampaignProgress(parsed)) {
      const warning = 'Saved campaign progress was invalid and has been reset.'
      console.warn(warning)
      return { progress: createEmptyCampaignProgress(), warning }
    }

    return { progress: parsed, warning: null }
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

function isCampaignProgress(value: unknown): value is CampaignProgress {
  if (!value || typeof value !== 'object') return false
  const progress = value as Partial<CampaignProgress>
  const missionIds = new Set(campaignMissions.map((mission) => mission.id))

  return (
    progress.version === 1 &&
    Array.isArray(progress.completedMissionIds) &&
    progress.completedMissionIds.every((id) => typeof id === 'string' && missionIds.has(id)) &&
    progress.bestScores !== null &&
    typeof progress.bestScores === 'object' &&
    !Array.isArray(progress.bestScores) &&
    Object.entries(progress.bestScores).every(
      ([id, score]) =>
        missionIds.has(id) && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100,
    ) &&
    Array.isArray(progress.attempts) &&
    progress.attempts.every(
      (attempt) =>
        !!attempt &&
        typeof attempt.id === 'string' &&
        typeof attempt.missionId === 'string' &&
        missionIds.has(attempt.missionId) &&
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
  )
}
