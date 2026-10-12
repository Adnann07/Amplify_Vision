import type { CampaignMission } from './campaign'
import type { LaunchRecord } from './launchVehicles'

export type CampaignMissionStatus = 'Failed' | 'Partially successful' | 'Successful'

export interface CampaignScoreCategory {
  id: string
  label: string
  points: number
  maximum: number
  explanation: string
}

export interface CampaignEvaluation {
  missionId: string
  missionTitle: string
  score: number
  tier: string
  status: CampaignMissionStatus
  objectiveAchieved: boolean
  objectiveIssue: string | null
  scoreCategories: CampaignScoreCategory[]
  recommendations: string[]
}

export function evaluateCampaignAttempt(
  mission: CampaignMission,
  record: LaunchRecord,
): CampaignEvaluation {
  const weights = mission.scoring
  const configuredMaximum = Object.values(weights).reduce((total, points) => total + points, 0)
  if (configuredMaximum !== 100) {
    throw new Error(`Campaign mission "${mission.id}" scoring weights must total 100, got ${configuredMaximum}.`)
  }

  const requirementsPassed = record.missionRequirementResults.filter((result) => result.passed).length
  const allRequirementsPassed =
    record.missionRequirementResults.length > 0 &&
    requirementsPassed === record.missionRequirementResults.length
  const requiredInstrumentType = mission.requiredInstrumentType
  const instrumentMatchesObjective =
    !requiredInstrumentType || record.missionTelemetry.instrumentType === requiredInstrumentType
  const objectiveIssue =
    requiredInstrumentType && !instrumentMatchesObjective
      ? `Required instrument: ${formatInstrument(requiredInstrumentType)} · actual: ${formatInstrument(record.missionTelemetry.instrumentType)}`
      : null
  const objectiveAchieved =
    record.outcome === 'success' && allRequirementsPassed && instrumentMatchesObjective
  const status: CampaignMissionStatus =
    record.outcome === 'failure'
      ? 'Failed'
      : objectiveAchieved
        ? 'Successful'
        : 'Partially successful'
  const budgetRatio =
    record.missionBudgetMillions > 0
      ? record.totalMissionCostMillions / record.missionBudgetMillions
      : Number.POSITIVE_INFINITY
  const scienceProgress = Math.min(1, record.missionTelemetry.science / mission.scienceTarget)
  const resourceEfficiency = Math.min(100, Math.max(0, record.missionTelemetry.resourceEfficiency))
  const optionalAchieved =
    record.missionTelemetry.resourceEfficiency >= mission.optionalObjective.resourceEfficiencyTarget

  const scoreCategories: CampaignScoreCategory[] = [
    {
      id: 'primary-objective',
      label: 'Primary mission objective',
      points: objectiveAchieved ? weights.primaryObjective : 0,
      maximum: weights.primaryObjective,
      explanation: objectiveAchieved
        ? 'Successful launch and all mission-specific objective conditions passed.'
        : objectiveIssue ?? 'The mission objective requires a successful launch and every required mission constraint.',
    },
    {
      id: 'engineering-compliance',
      label: 'Engineering constraint compliance',
      points: record.missionRequirementResults.length
        ? (weights.engineeringCompliance * requirementsPassed) / record.missionRequirementResults.length
        : 0,
      maximum: weights.engineeringCompliance,
      explanation: `${requirementsPassed} of ${record.missionRequirementResults.length} recorded constraints passed.`,
    },
    {
      id: 'budget-efficiency',
      label: 'Budget efficiency',
      points:
        budgetRatio <= 1
          ? weights.budgetEfficiency * (1 - 0.6 * budgetRatio)
          : 0,
      maximum: weights.budgetEfficiency,
      explanation:
        budgetRatio <= 1
          ? `Spent ${record.totalMissionCostMillions.toLocaleString()}M of ${record.missionBudgetMillions.toLocaleString()}M.`
          : `Exceeded the mission budget by ${(record.totalMissionCostMillions - record.missionBudgetMillions).toLocaleString()}M.`,
    },
    {
      id: 'resource-efficiency',
      label: 'Resource efficiency',
      points: (weights.resourceEfficiency * resourceEfficiency) / 100,
      maximum: weights.resourceEfficiency,
      explanation: `Recorded resource efficiency: ${record.missionTelemetry.resourceEfficiency}%.`,
    },
    {
      id: 'science-performance',
      label: 'Science capability',
      points: weights.sciencePerformance * scienceProgress,
      maximum: weights.sciencePerformance,
      explanation: `Recorded science capability: ${record.missionTelemetry.science} points; mission target: ${mission.scienceTarget}.`,
    },
    {
      id: 'optional-objective',
      label: 'Optional objective',
      points: optionalAchieved ? weights.optionalObjectives : 0,
      maximum: weights.optionalObjectives,
      explanation: `${mission.optionalObjective.label}; actual ${record.missionTelemetry.resourceEfficiency}%.`,
    },
  ]
  const score = Math.round(scoreCategories.reduce((total, category) => total + category.points, 0))
  const recommendations = getRecommendations(mission, record, objectiveAchieved, optionalAchieved)

  return {
    missionId: mission.id,
    missionTitle: mission.title,
    score,
    tier: score >= 90 ? 'Outstanding' : score >= 75 ? 'Strong' : score >= 60 ? 'Partial success' : 'Needs improvement',
    status,
    objectiveAchieved,
    objectiveIssue,
    scoreCategories,
    recommendations,
  }
}

function getRecommendations(
  mission: CampaignMission,
  record: LaunchRecord,
  objectiveAchieved: boolean,
  optionalAchieved: boolean,
) {
  const recommendations = new Set<string>()

  if (record.outcome === 'failure' && record.suggestedChange) {
    recommendations.add(record.suggestedChange)
  }
  if (mission.requiredInstrumentType && record.missionTelemetry.instrumentType !== mission.requiredInstrumentType) {
    recommendations.add(
      `Select the ${formatInstrument(mission.requiredInstrumentType)} for this mission’s primary objective.`,
    )
  }

  for (const requirement of record.missionRequirementResults) {
    if (requirement.passed) continue
    switch (requirement.id) {
      case 'power':
        recommendations.add('Increase solar-panel output or reduce the spacecraft’s power demand.')
        break
      case 'deltaV':
        recommendations.add('Increase propellant or select a higher-performance propulsion system.')
        break
      case 'communication':
        recommendations.add('Install a stronger antenna to meet the mission communication requirement.')
        break
      case 'instruments':
        recommendations.add(`Install at least ${requirement.displayTarget} science instruments.`)
        break
      case 'maxBudget':
        recommendations.add('Reduce component, payload, propellant, or launch-vehicle costs to meet the mission budget.')
        break
      case 'maxMass':
        recommendations.add('Reduce spacecraft mass while retaining the systems required by the mission.')
        break
    }
  }

  if (!optionalAchieved) {
    recommendations.add(
      `Improve resource efficiency to at least ${mission.optionalObjective.resourceEfficiencyTarget}%.`,
    )
  }
  if (objectiveAchieved && recommendations.size === 0) {
    recommendations.add('Review the score breakdown and tune the design to improve budget and resource efficiency.')
  }
  if (recommendations.size === 0) {
    recommendations.add('Review the mission requirements and adjust the spacecraft before your next attempt.')
  }

  return [...recommendations]
}

function formatInstrument(instrument: string) {
  return instrument === 'camera'
    ? 'Survey camera'
    : instrument === 'spectrometer'
      ? 'Spectrometer'
      : 'Mapping radar'
}
