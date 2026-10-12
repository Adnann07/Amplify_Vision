import { campaignMissions, getCampaignMissionGoal } from '../../data/campaign'
import type { CampaignProgress } from '../../data/campaignProgress'

interface HomeScreenProps {
  onMissionMode: () => void
  onFreeplayMode: () => void
}

export function HomeScreen({ onMissionMode, onFreeplayMode }: HomeScreenProps) {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#020912] px-4 py-12 text-slate-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_30%,rgba(14,116,144,0.22),transparent_42%),radial-gradient(ellipse_at_82%_72%,rgba(30,64,175,0.18),transparent_44%)]" />
      <section className="w-full max-w-6xl">
        <header className="mb-10 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-sky-300">
            Space mission engineering simulator
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
            Amplify Vision
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Design a spacecraft, make engineering trade-offs, and discover how your decisions shape a mission.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={onMissionMode}
            className="group rounded-[28px] border border-sky-300/25 bg-slate-900/80 p-6 text-left shadow-[0_20px_70px_rgba(2,132,199,0.08)] transition hover:-translate-y-1 hover:border-sky-200/55 hover:bg-slate-900 sm:p-8"
          >
            <span className="inline-flex rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100">
              Guided campaign
            </span>
            <h2 className="mt-5 text-2xl font-semibold text-white">Mission Mode</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Take on engineering challenges, complete objectives, and progress through an expanding space exploration campaign.
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-sky-200">
              View mission campaign <span aria-hidden="true">→</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onFreeplayMode}
            className="group rounded-[28px] border border-violet-300/20 bg-slate-900/80 p-6 text-left transition hover:-translate-y-1 hover:border-violet-200/50 hover:bg-slate-900 sm:p-8"
          >
            <span className="inline-flex rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-100">
              Open sandbox
            </span>
            <h2 className="mt-5 text-2xl font-semibold text-white">Freeplay Mode</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Design your own spacecraft, experiment with engineering trade-offs, and launch without mission objectives or campaign restrictions.
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-200">
              Enter freeplay <span aria-hidden="true">→</span>
            </span>
          </button>
        </div>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Existing spacecraft, engineering systems, telemetry, and real-time launch simulation
        </p>
      </section>
    </main>
  )
}

interface CampaignSelectionProps {
  onBack: () => void
  onSelectMission: (missionId: string) => void
  progress: CampaignProgress
  storageWarning: string | null
}

export function CampaignSelectionScreen({
  onBack,
  onSelectMission,
  progress,
  storageWarning,
}: CampaignSelectionProps) {
  const completedCount = campaignMissions.filter((mission) =>
    progress.completedMissionIds.includes(mission.id),
  ).length

  return (
    <main className="min-h-screen bg-[#020912] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-7 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white"
        >
          ← Game modes
        </button>

        <header className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-300">Mission mode · Campaign</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Flight program</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Complete the primary objective to unlock the next flight. Every attempt is scored and saved so you can replay missions to improve.
          </p>
          <p className="mt-3 text-xs text-sky-100/80" aria-live="polite">
            Campaign progress · {completedCount}/{campaignMissions.length} primary objectives complete · {progress.attempts.length} attempts recorded
          </p>
          {storageWarning && (
            <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs text-amber-100" role="status">
              {storageWarning} Progress remains available for this session.
            </p>
          )}
        </header>

        <section aria-labelledby="campaign-missions-title">
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
              Campaign
            </span>
            <h2 id="campaign-missions-title" className="text-sm font-medium text-slate-300">Playable missions</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {campaignMissions.map((mission) => {
              const goal = getCampaignMissionGoal(mission)
              const unlocked = mission.requiresMissionIds.every((id) =>
                progress.completedMissionIds.includes(id),
              )
              const completed = progress.completedMissionIds.includes(mission.id)
              const bestScore = progress.bestScores[mission.id]
              const attempts = progress.attempts.filter((attempt) => attempt.missionId === mission.id).length
              return (
                <article key={mission.id} className={`rounded-[26px] border bg-slate-900/80 p-5 sm:p-6 ${unlocked ? 'border-sky-300/20' : 'border-white/10 opacity-75'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">Mission {String(mission.level).padStart(2, '0')} · {mission.destination}</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{mission.title}</h3>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${completed ? 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100' : unlocked ? 'border-sky-300/20 bg-sky-300/5 text-sky-100' : 'border-white/10 bg-white/5 text-slate-400'}`}>
                      {completed ? `Complete · ${bestScore ?? 0}/100 best` : unlocked ? mission.difficulty : 'Locked'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{mission.summary}</p>
                  <div className="mt-5 grid gap-3 rounded-2xl border border-white/8 bg-slate-950/40 p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Primary objective</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-200">{mission.objective}</p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Mission budget</p>
                        <p className="mt-1 text-xs text-slate-200">
                          {goal.requirements.maxBudget === undefined
                            ? 'No fixed mission cap'
                            : `$${goal.requirements.maxBudget.toLocaleString()}M`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Spacecraft mass limit</p>
                        <p className="mt-1 text-xs text-slate-200">
                          {goal.requirements.maxMass === undefined
                            ? 'Set by selected rocket'
                            : `${goal.requirements.maxMass.toLocaleString()} kg`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] text-slate-400">Attempts: {attempts} · Scoring: mission objective 40, engineering 20, budget 15, resources 10, science 10, optional 5.</p>
                  <button
                    type="button"
                    disabled={!unlocked}
                    onClick={() => onSelectMission(mission.id)}
                    className="mt-5 w-full rounded-xl bg-sky-300 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {!unlocked ? 'Complete the previous mission to unlock' : completed ? 'Replay mission' : 'Review mission briefing'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
