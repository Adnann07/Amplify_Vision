import { campaignMissions, getCampaignMissionGoal, upcomingCampaignLevels } from '../../data/campaign'

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
}

export function CampaignSelectionScreen({
  onBack,
  onSelectMission,
}: CampaignSelectionProps) {
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
            Begin with a guided low-orbit mission. Later levels will introduce payload planning and budget trade-offs.
          </p>
        </header>

        <section aria-labelledby="level-one-title">
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
              Level 1
            </span>
            <h2 id="level-one-title" className="text-sm font-medium text-slate-300">Mission fundamentals</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {campaignMissions.map((mission) => {
              const goal = getCampaignMissionGoal(mission)
              return (
                <article key={mission.id} className="rounded-[26px] border border-sky-300/20 bg-slate-900/80 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">Mission 01 · {mission.destination}</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{mission.title}</h3>
                    </div>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-2.5 py-1 text-[10px] text-emerald-100">
                      {mission.difficulty}
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
                  <button
                    type="button"
                    onClick={() => onSelectMission(mission.id)}
                    className="mt-5 w-full rounded-xl bg-sky-300 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-sky-200"
                  >
                    Review mission briefing
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mt-9" aria-labelledby="upcoming-levels-title">
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Upcoming
            </span>
            <h2 id="upcoming-levels-title" className="text-sm font-medium text-slate-400">Campaign roadmap</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingCampaignLevels.map((level) => (
              <div key={level.level} className="rounded-2xl border border-white/8 bg-slate-900/45 p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">Level {level.level} · In development</p>
                <h3 className="mt-2 text-sm font-medium text-slate-300">{level.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{level.summary}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
