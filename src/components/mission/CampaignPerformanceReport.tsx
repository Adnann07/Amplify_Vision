import { useEffect, useRef, useState } from 'react'
import type { CampaignMission } from '../../data/campaign'
import type { CampaignAttemptSummary } from '../../data/campaignProgress'
import type { CampaignEvaluation } from '../../data/campaignScoring'
import type { LaunchRecord } from '../../data/launchVehicles'

interface CampaignMissionSimulationProps {
  mission: CampaignMission
  record: LaunchRecord
  onComplete: () => void
}

const simulationChecks = [
  'Recording the completed launch outcome',
  'Evaluating power, propulsion, communications, and instruments',
  'Comparing actual expenditure and spacecraft mass with mission limits',
  'Calculating mission completion and performance score',
]

export function CampaignMissionSimulation({
  mission,
  record,
  onComplete,
}: CampaignMissionSimulationProps) {
  const [running, setRunning] = useState(false)
  const [checkIndex, setCheckIndex] = useState(0)
  const completeRef = useRef(onComplete)
  useEffect(() => {
    completeRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!running) return
    const intervalId = window.setInterval(() => {
      setCheckIndex((current) => {
        const next = current + 1
        if (next >= simulationChecks.length) {
          window.clearInterval(intervalId)
          window.setTimeout(() => completeRef.current(), 350)
          return simulationChecks.length - 1
        }
        return next
      })
    }, 700)

    return () => window.clearInterval(intervalId)
  }, [running])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#020912] px-4 py-10 text-slate-100">
      <section className="w-full max-w-3xl rounded-[30px] border border-sky-300/20 bg-slate-900/80 p-6 shadow-2xl sm:p-9">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-300">
          Mission {String(mission.level).padStart(2, '0')} · Post-launch assessment
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Mission systems simulation</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {mission.title} · {record.destination}. Mission completion is determined from the launch result and the engineering telemetry already recorded for this spacecraft.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Launch planning snapshot: {record.planningSnapshot.launchDate} UTC · {record.planningSnapshot.ephemerides.length} matching-date planetary vectors. This information does not alter the mission assessment.
        </p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Recorded design telemetry · no live orbital physics
          </p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Launch result</dt><dd className="mt-1 text-slate-100">Successful</dd></div>
            <div><dt className="text-xs text-slate-500">Science capability</dt><dd className="mt-1 text-slate-100">{record.missionTelemetry.science} points</dd></div>
            <div><dt className="text-xs text-slate-500">Power</dt><dd className="mt-1 text-slate-100">{record.missionTelemetry.power.toLocaleString()} W</dd></div>
            <div><dt className="text-xs text-slate-500">Spacecraft mass</dt><dd className="mt-1 text-slate-100">{record.spacecraftMassKg.toLocaleString()} kg</dd></div>
          </dl>
        </div>

        {running ? (
          <div className="mt-6 rounded-2xl border border-sky-300/20 bg-sky-300/5 p-5" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
              <p className="text-sm font-medium text-sky-100">{simulationChecks[checkIndex]}</p>
            </div>
            <ol className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
              {simulationChecks.map((check, index) => (
                <li key={check} className={index <= checkIndex ? 'text-emerald-200' : ''}>
                  {index < checkIndex ? '✓' : index === checkIndex ? '›' : '·'} {check}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRunning(true)}
            className="mt-6 w-full rounded-xl bg-sky-300 px-5 py-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-sky-200"
          >
            Run mission systems simulation
          </button>
        )}
      </section>
    </main>
  )
}

interface CampaignPerformanceReportProps {
  mission: CampaignMission
  record: LaunchRecord
  evaluation: CampaignEvaluation
  previousBestScore: number | null
  attemptHistory: CampaignAttemptSummary[]
  nextMission: CampaignMission | null
  onContinue: (missionId: string) => void
  onReplay: () => void
  onRetry: () => void
  onReviewDesign: () => void
  onMissionSelection: () => void
}

export function CampaignPerformanceReport({
  mission,
  record,
  evaluation,
  previousBestScore,
  attemptHistory,
  nextMission,
  onContinue,
  onReplay,
  onRetry,
  onReviewDesign,
  onMissionSelection,
}: CampaignPerformanceReportProps) {
  const successful = evaluation.objectiveAchieved
  const passedRequirements = record.missionRequirementResults.filter((result) => result.passed)
  const missedRequirements = record.missionRequirementResults.filter((result) => !result.passed)

  return (
    <main className="min-h-screen bg-[#020912] px-4 py-8 text-slate-100 sm:px-6">
      <article className="mx-auto max-w-5xl rounded-[30px] border border-white/10 bg-slate-900/85 p-5 shadow-2xl sm:p-8">
        <header className="border-b border-white/10 pb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-300">
            Mission {String(mission.level).padStart(2, '0')} · Performance report
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold text-white">{evaluation.status}</h1>
              <p className="mt-2 text-sm text-slate-300">{mission.title} · {record.destination}</p>
            </div>
            <div className="rounded-2xl border border-sky-300/20 bg-sky-300/5 px-5 py-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.16em] text-sky-200">Final score</p>
              <p className="mt-1 text-3xl font-bold text-white">{evaluation.score}<span className="text-base text-slate-400"> / 100</span></p>
              <p className="mt-1 text-xs font-semibold text-sky-100">{evaluation.tier}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
            <p className="rounded-xl border border-white/8 bg-slate-950/40 p-3">Current attempt: <strong className="text-white">{evaluation.score}/100</strong></p>
            <p className="rounded-xl border border-white/8 bg-slate-950/40 p-3">Previous best: <strong className="text-white">{previousBestScore === null ? 'No previous score' : `${previousBestScore}/100`}</strong></p>
            <p className="rounded-xl border border-white/8 bg-slate-950/40 p-3">Best score now: <strong className="text-white">{Math.max(previousBestScore ?? 0, evaluation.score)}/100</strong></p>
          </div>
          <p className="mt-3 rounded-xl border border-white/8 bg-slate-950/35 p-3 text-xs text-slate-400">
            Launch plan snapshot: {record.planningSnapshot.launchDate} UTC · {record.planningSnapshot.ephemerides.length} matching-date Horizons vectors
            {record.planningSnapshot.transferEstimate &&
              ` · preliminary ${record.planningSnapshot.transferEstimate.destinationBody} transfer estimate ~${Math.round(record.planningSnapshot.transferEstimate.transferDays)} days`}
            . Ephemerides and estimates are informational and do not affect this score or mission outcome.
          </p>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <h2 className="text-sm font-semibold text-white">Objective and outcome</h2>
            <p className="mt-2 text-sm text-slate-300">{mission.objective}</p>
            <p className={`mt-3 rounded-xl border px-3 py-2 text-xs ${successful ? 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100' : 'border-amber-300/20 bg-amber-300/5 text-amber-100'}`}>
              {successful
                ? 'Primary objective achieved: the launch succeeded and all required mission constraints passed.'
                : record.outcome === 'failure'
                  ? `Launch failure — ${record.failureTitle ?? 'Launch constraints not met'}. The next mission remains locked until the primary objective is completed.`
                  : evaluation.objectiveIssue
                    ? `Launch successful, but the mission-specific objective condition was not met. ${evaluation.objectiveIssue}.`
                    : 'Launch successful, but the primary mission objective was not achieved. This is a partial success; the next mission remains locked.'}
            </p>
            {evaluation.objectiveIssue && (
              <p className="mt-2 text-xs text-amber-100">
                Primary objective check: {evaluation.objectiveIssue}
              </p>
            )}
            {record.outcome === 'failure' && (
              <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-xs">
                <p className="font-bold text-rose-100">{record.failureTitle}</p>
                <p className="mt-2 text-slate-200">{record.failureCause}</p>
                <p className="mt-2 text-slate-300">{record.failureParameter}: {record.failureActual} · expected {record.failureExpected}</p>
              </div>
            )}
            <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-white/5 p-3">
                <dt className="text-slate-500">Spacecraft mass / rocket capacity</dt>
                <dd className="mt-1 text-white">{record.spacecraftMassKg.toLocaleString()} kg / {record.launchVehicle.payloadCapacityKg.toLocaleString()} kg</dd>
                {record.spacecraftMassKg > record.launchVehicle.payloadCapacityKg && (
                  <dd className="mt-1 text-rose-200">Exceeded by {(record.spacecraftMassKg - record.launchVehicle.payloadCapacityKg).toLocaleString()} kg</dd>
                )}
              </div>
              <div className="rounded-lg border border-white/5 p-3">
                <dt className="text-slate-500">Expenditure / mission budget</dt>
                <dd className="mt-1 text-white">${record.totalMissionCostMillions.toLocaleString()}M / ${record.missionBudgetMillions.toLocaleString()}M</dd>
                {record.totalMissionCostMillions > record.missionBudgetMillions && (
                  <dd className="mt-1 text-rose-200">Exceeded by ${(record.totalMissionCostMillions - record.missionBudgetMillions).toLocaleString()}M</dd>
                )}
              </div>
              <div className="rounded-lg border border-white/5 p-3">
                <dt className="text-slate-500">Power / Delta-V</dt>
                <dd className="mt-1 text-white">{record.missionTelemetry.power.toLocaleString()} W / {record.missionTelemetry.deltaV.toFixed(1)} km/s</dd>
              </div>
              <div className="rounded-lg border border-white/5 p-3">
                <dt className="text-slate-500">Communication / instruments</dt>
                <dd className="mt-1 text-white">{record.missionTelemetry.communication}% / {record.missionTelemetry.instruments} × {record.missionTelemetry.instrumentType}</dd>
              </div>
              <div className="rounded-lg border border-white/5 p-3">
                <dt className="text-slate-500">Resource efficiency / sustainability</dt>
                <dd className="mt-1 text-white">{record.missionTelemetry.resourceEfficiency}% / {record.missionTelemetry.sustainabilityLevel}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <h2 className="text-sm font-semibold text-white">Transparent score breakdown</h2>
            <ul className="mt-3 space-y-3">
              {evaluation.scoreCategories.map((category) => (
                <li key={category.id}>
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="text-slate-200">{category.label}</span>
                    <strong className="shrink-0 text-white">{category.points.toFixed(1)} / {category.maximum}</strong>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">{category.explanation}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <h2 className="text-sm font-semibold text-white">Mission constraints</h2>
            <ul className="mt-3 space-y-2">
              {record.missionRequirementResults.map((requirement) => (
                <li key={requirement.id} className={`rounded-xl border p-3 text-xs ${requirement.passed ? 'border-emerald-300/10' : 'border-amber-300/15'}`}>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-200">{requirement.label}</span>
                    <span className={requirement.passed ? 'text-emerald-200' : 'text-amber-200'}>{requirement.passed ? 'Met' : 'Missed'}</span>
                  </div>
                  <p className="mt-1 text-slate-400">Actual {requirement.displayActual} · required {requirement.displayTarget}</p>
                  {!requirement.passed && <p className="mt-1 text-amber-100/80">{requirement.problem}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10px] text-slate-400">
              Helped: {passedRequirements.length ? passedRequirements.map((result) => result.label).join(', ') : 'No required constraints met'}.
              {' '}Harmed: {missedRequirements.length ? missedRequirements.map((result) => result.label).join(', ') : 'No missed requirements'}.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <h2 className="text-sm font-semibold text-white">Recommended next steps</h2>
            <ul className="mt-3 space-y-2">
              {evaluation.recommendations.map((recommendation) => (
                <li key={recommendation} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                  <span className="text-sky-300" aria-hidden="true">›</span>{recommendation}
                </li>
              ))}
            </ul>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Recent attempts</h3>
            <ul className="mt-2 space-y-1 text-[10px] text-slate-400">
              {attemptHistory.slice(-5).reverse().map((attempt) => (
                <li key={attempt.id} className="flex justify-between gap-3">
                  <span>Attempt {attempt.attemptNumber} · {attempt.status}</span>
                  <span className="text-slate-200">{attempt.score}/100</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <footer className="mt-6 grid gap-2 sm:grid-cols-2">
          {successful ? (
            <>
              {nextMission && (
                <button type="button" onClick={() => onContinue(nextMission.id)} className="rounded-xl bg-emerald-300 px-4 py-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:bg-emerald-200">
                  Continue to next mission · {nextMission.title}
                </button>
              )}
              {!nextMission && (
                <p className="flex items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-4 py-4 text-xs font-bold uppercase tracking-[0.14em] text-emerald-100">
                  Campaign complete — all primary objectives achieved
                </p>
              )}
              <button type="button" onClick={onReplay} className="rounded-xl border border-sky-300/20 bg-sky-300/5 px-4 py-4 text-xs font-bold uppercase tracking-[0.14em] text-sky-100 transition hover:bg-sky-300/10">
                Replay to improve score
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onRetry} className="rounded-xl bg-amber-300 px-4 py-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:bg-amber-200">
                Retry mission
              </button>
              <button type="button" onClick={onReviewDesign} className="rounded-xl border border-sky-300/20 bg-sky-300/5 px-4 py-4 text-xs font-bold uppercase tracking-[0.14em] text-sky-100 transition hover:bg-sky-300/10">
                Review spacecraft design
              </button>
            </>
          )}
          <button type="button" onClick={onMissionSelection} className="rounded-xl border border-white/10 px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:border-white/25 hover:bg-white/5 sm:col-span-2">
            Return to mission selection
          </button>
        </footer>
      </article>
    </main>
  )
}
