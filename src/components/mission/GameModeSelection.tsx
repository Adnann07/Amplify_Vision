import { useMemo, useState, type FormEvent } from 'react'
import {
  campaignMissions,
  filterCampaignMissions,
  getCampaignMissionGoal,
  isCampaignMissionUnlocked,
  type CampaignMission,
  type MissionCategory,
} from '../../data/campaign'
import { isCampaignUnlockCode, type CampaignProgress } from '../../data/campaignProgress'

interface HomeScreenProps {
  onMissionMode: () => void
  onFreeplayMode: () => void
  onLiveEvents: () => void
  onJunoSimulation: () => void
}

export function HomeScreen({
  onMissionMode,
  onFreeplayMode,
  onLiveEvents,
  onJunoSimulation,
}: HomeScreenProps) {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-12 text-slate-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.08),transparent_52%)]" />
      <section className="w-full max-w-6xl">
        <header className="mb-10 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-white/70">
            Space mission engineering simulator
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
            Amplify Vision
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Design a spacecraft, make engineering trade-offs, and discover how your decisions shape a mission.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={onMissionMode}
            className="group rounded-[28px] border border-white/15 bg-[#090909] p-6 text-left transition hover:-translate-y-1 hover:border-white/50 hover:bg-[#101010] sm:p-8"
          >
            <span className="inline-flex rounded-full border border-white/25 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
              Guided campaign
            </span>
            <h2 className="mt-5 text-2xl font-semibold text-white">Mission Mode</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Take on engineering challenges, complete objectives, and progress through an expanding space exploration campaign.
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white">
              View mission campaign <span aria-hidden="true">→</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onFreeplayMode}
            className="group rounded-[28px] border border-white/15 bg-[#090909] p-6 text-left transition hover:-translate-y-1 hover:border-white/50 hover:bg-[#101010] sm:p-8"
          >
            <span className="inline-flex rounded-full border border-white/25 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
              Open sandbox
            </span>
            <h2 className="mt-5 text-2xl font-semibold text-white">Freeplay Mode</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Design your own spacecraft, experiment with engineering trade-offs, and launch without mission objectives or campaign restrictions.
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white">
              Enter freeplay <span aria-hidden="true">→</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onLiveEvents}
            className="group rounded-[28px] border border-white/15 bg-[#090909] p-6 text-left transition hover:-translate-y-1 hover:border-white/50 hover:bg-[#101010] sm:p-8"
          >
            <span className="inline-flex rounded-full border border-white/25 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
              NOAA · NASA · JPL
            </span>
            <h2 className="mt-5 text-2xl font-semibold text-white">Live Events</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Explore current space-weather alerts, Earth events, and asteroid close approaches. Turn eligible records into clearly labeled design exercises.
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white">
              Open live event board <span aria-hidden="true">→</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onJunoSimulation}
            className="group rounded-[28px] border border-cyan-200/20 bg-[#07111d] p-6 text-left transition hover:-translate-y-1 hover:border-cyan-100/50 hover:bg-[#0a1724] sm:p-8"
          >
            <span className="inline-flex rounded-full border border-cyan-200/25 bg-cyan-200/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
              Jupiter · JPL Horizons
            </span>
            <h2 className="mt-5 text-2xl font-semibold text-white">Juno Orbital Simulation</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Watch Juno move around Jupiter using Horizons ephemeris vectors, with a labeled
              approximate-orbit fallback.
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-100">
              Open orbital simulation <span aria-hidden="true">→</span>
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
  onUnlockAllMissions: () => void
  missions?: CampaignMission[]
  progress: CampaignProgress
  storageWarning: string | null
}

export function CampaignSelectionScreen({
  onBack,
  onSelectMission,
  onUnlockAllMissions,
  missions = campaignMissions,
  progress,
  storageWarning,
}: CampaignSelectionProps) {
  const [unlockCode, setUnlockCode] = useState('')
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<MissionCategory | 'All'>('All')
  const [difficultyFilter, setDifficultyFilter] = useState<CampaignMission['difficulty'] | 'All'>('All')
  const [search, setSearch] = useState('')
  const missionCategories = [...new Set(missions.map((mission) => mission.category))]
  const visibleMissions = useMemo(
    () => filterCampaignMissions(missions, {
      category: categoryFilter,
      difficulty: difficultyFilter,
      search,
    }),
    [categoryFilter, difficultyFilter, search, missions],
  )
  const completedCount = missions.filter((mission) =>
    progress.completedMissionIds.includes(mission.id),
  ).length
  const unlockedCount = missions.filter((mission) =>
    isCampaignMissionUnlocked(mission, progress.completedMissionIds, progress.allMissionsUnlocked),
  ).length

  const submitUnlockCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isCampaignUnlockCode(unlockCode)) {
      setUnlockMessage('That code is not recognized.')
      return
    }
    onUnlockAllMissions()
    setUnlockCode('')
    setUnlockMessage('All campaign missions unlocked.')
  }

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

        <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-300">Mission mode · Campaign</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Flight program</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
              Complete the primary objective to unlock the next flight. Every attempt is scored and saved so you can replay missions to improve.
            </p>
            <p className="mt-3 text-xs text-sky-100/80" aria-live="polite">
              {unlockedCount}/{missions.length} available · {missions.length - unlockedCount} locked · {completedCount} objectives complete · {progress.attempts.length} attempts
            </p>
            {storageWarning && (
              <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs text-amber-100" role="status">
                {storageWarning} Progress remains available for this session.
              </p>
            )}
          </div>
          <form
            onSubmit={submitUnlockCode}
            className="w-full rounded-xl border border-white/10 bg-slate-900/70 p-3 sm:ml-6 sm:w-auto sm:min-w-[230px]"
            aria-label="Unlock campaign missions"
          >
            <label htmlFor="campaign-unlock-code" className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Mission access code
            </label>
            <div className="flex gap-2">
              <input
                id="campaign-unlock-code"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={unlockCode}
                onChange={(event) => {
                  setUnlockCode(event.target.value.replace(/\D/g, '').slice(0, 4))
                  setUnlockMessage(null)
                }}
                placeholder="Enter code"
                autoComplete="off"
                aria-label="Mission access code"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm tracking-[0.25em] text-white outline-none placeholder:tracking-normal placeholder:text-slate-600 focus:border-sky-300/50"
              />
              <button
                type="submit"
                disabled={progress.allMissionsUnlocked || unlockCode.length !== 4}
                className="rounded-lg bg-sky-300 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {progress.allMissionsUnlocked ? 'Unlocked' : 'Unlock'}
              </button>
            </div>
            {unlockMessage && (
              <p className={`mt-2 text-[10px] ${progress.allMissionsUnlocked ? 'text-emerald-200' : 'text-rose-200'}`} role="status">
                {unlockMessage}
              </p>
            )}
            {progress.allMissionsUnlocked && !unlockMessage && (
              <p className="mt-2 text-[10px] text-emerald-200" role="status">All campaign missions unlocked.</p>
            )}
          </form>
        </header>

        <section aria-labelledby="campaign-missions-title">
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/8 bg-slate-900/55 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                Campaign
              </span>
              <h2 id="campaign-missions-title" className="text-sm font-medium text-slate-300">
                Missions · {visibleMissions.length} shown
              </h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(150px,1fr)_160px_160px]">
              <label className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                Search
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Title, target, objective"
                  className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs normal-case tracking-normal text-white placeholder:text-slate-600"
                />
              </label>
              <label className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                Category
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as MissionCategory | 'All')} className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs normal-case tracking-normal text-white">
                  <option value="All">All categories</option>
                  {missionCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                Difficulty
                <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as typeof difficultyFilter)} className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs normal-case tracking-normal text-white">
                  <option value="All">All difficulties</option>
                  <option value="Introductory">Introductory</option>
                  <option value="Easy">Easy</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Challenging">Challenging</option>
                </select>
              </label>
            </div>
          </div>
          {(categoryFilter !== 'All' || difficultyFilter !== 'All' || search !== '') && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('All')
                setDifficultyFilter('All')
                setSearch('')
              }}
              className="mb-3 rounded-lg border border-sky-200/15 px-3 py-2 text-[10px] font-semibold text-sky-100"
            >
              Clear filters · show all missions
            </button>
          )}
          {visibleMissions.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-400">No missions match these filters. Clear filters to return to the full catalogue.</p>
          ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleMissions.map((mission) => {
              const goal = getCampaignMissionGoal(mission)
              const unlocked = isCampaignMissionUnlocked(
                mission,
                progress.completedMissionIds,
                progress.allMissionsUnlocked,
              )
              const completed = progress.completedMissionIds.includes(mission.id)
              const bestScore = progress.bestScores[mission.id]
              const attempts = progress.attempts.filter((attempt) => attempt.missionId === mission.id).length
              const currentAttempt = progress.attempts.find((attempt) => attempt.missionId === mission.id && !attempt.objectiveAchieved)
              const previousMission = mission.requiresMissionIds.length
                ? missions.find((candidate) => candidate.id === mission.requiresMissionIds[0])
                : null
              const status = completed ? `Complete · ${bestScore ?? 0}/100`
                : !unlocked ? 'Locked'
                  : attempts > 0 ? 'In progress'
                    : mission.difficulty
              return (
                <article key={mission.id} className={`flex min-h-[250px] flex-col rounded-2xl border bg-slate-900/80 p-4 ${unlocked ? 'border-sky-300/20' : 'border-white/10 opacity-80'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-sky-300">Mission {String(mission.level).padStart(2, '0')} · {mission.destination}</p>
                      <h3 className="mt-1.5 text-base font-semibold text-white">{mission.title}</h3>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] ${completed ? 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100' : unlocked ? 'border-sky-300/20 bg-sky-300/5 text-sky-100' : 'border-white/10 bg-white/5 text-slate-400'}`}>{status}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{mission.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-violet-300/10 px-2 py-1 text-[9px] text-violet-100">{mission.category}</span>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-slate-300">{mission.difficulty}</span>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-slate-300">~{mission.estimatedDuration}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px]">
                    <div><dt className="text-slate-500">Recommended instrument</dt><dd className="text-slate-200">{mission.recommendedInstrumentType}</dd></div>
                    <div><dt className="text-slate-500">Target</dt><dd className="text-slate-200">{goal.destination}</dd></div>
                    <div className="col-span-2"><dt className="text-slate-500">Objective</dt><dd className="text-slate-300">{mission.objective}</dd></div>
                  </dl>
                  {!unlocked && previousMission && (
                    <p className="mt-3 rounded-lg border border-amber-200/10 bg-amber-100/[.03] p-2 text-[9px] text-amber-100/80">
                      Unlocks after completing Mission {String(previousMission.level).padStart(2, '0')}: {previousMission.title}.
                    </p>
                  )}
                  <p className="mt-auto pt-3 text-[9px] text-slate-500">
                    Requirements: {goal.requirements.power.toLocaleString()} W · {goal.requirements.deltaV.toFixed(1)} km/s · {goal.requirements.communication}% comms · {goal.requirements.instruments} instrument{goal.requirements.instruments === 1 ? '' : 's'} · ${goal.requirements.maxBudget.toLocaleString()}M
                    {currentAttempt && !completed ? ` · Last result: ${currentAttempt.status}` : ''}
                    {attempts > 0 ? ` · ${attempts} attempt${attempts === 1 ? '' : 's'}` : ''}
                  </p>
                  <button
                    type="button"
                    disabled={!unlocked}
                    onClick={() => onSelectMission(mission.id)}
                    className="mt-3 w-full rounded-xl bg-sky-300 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {!unlocked ? 'Mission locked' : completed || attempts > 0 ? 'Review briefing / retry' : 'Review mission briefing'}
                  </button>
                </article>
              )
            })}
          </div>
          )}
        </section>
      </div>
    </main>
  )
}
