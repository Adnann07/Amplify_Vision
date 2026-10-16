import { motion } from 'framer-motion'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  antennaOptions,
  buildComponentLabels,
  calculateBuildStats,
  createInitialBuild,
  engineOptions,
  instrumentOptions,
  solarPanelOptions,
  type AntennaType,
  type BuildComponentId,
  type EngineType,
  type InstrumentType,
  type SolarPanelSize,
} from './data/spacecraftBuild'
import { evaluateMissionRequirements, missionGoals } from './data/missionGoals'
import {
  assessSustainability,
  defaultSustainabilityChoices,
  type SustainabilityChoices,
} from './data/sustainability'
import {
  availableSpacecraftCatalog,
  destinations,
  propulsionOptions,
} from './data/spacecraft'
import { launchVehicles, type LaunchRecord, type LaunchVehicleSpec } from './data/launchVehicles'
import { getPlanetaryBodyForDestination } from './data/planetaryData'
import { LaunchResults, LaunchVehicleSelection } from './components/mission/LaunchVehicleSelection'
import { assessLaunchOutcome } from './data/launchOutcome'
import { HomeScreen, CampaignSelectionScreen } from './components/mission/GameModeSelection'
import { LiveEventsBoard } from './components/mission/LiveEventsBoard'
import {
  campaignMissions,
  getCampaignMissionGoal,
  isCampaignMissionUnlocked,
  resolveCampaignMission,
} from './data/campaign'
import type { CampaignMission } from './data/campaign'
import { evaluateCampaignAttempt, type CampaignEvaluation } from './data/campaignScoring'
import {
  loadCampaignProgress,
  saveCampaignProgress,
  unlockAllCampaignMissions,
  type CampaignProgress,
} from './data/campaignProgress'
import {
  CampaignMissionSimulation,
  CampaignPerformanceReport,
} from './components/mission/CampaignPerformanceReport'
import { SolarSystemPlanner } from './components/mission/SolarSystemPlanner'
import { loadSolarSystemPositions, type HorizonsPosition } from './data/horizonsService'
import { estimateHohmannTransfer } from './data/missionPlanner'
import {
  advanceMissionControl,
  createMissionControlSession,
  clearMissionControlSession,
  loadMissionControlSession,
  saveMissionControlSession,
  type MissionControlSession,
} from './data/missionControlSimulation'

type GameMode = 'mission' | 'freeplay'
type EntryScreen =
  | 'home'
  | 'campaign'
  | 'events'
  | 'briefing'
  | 'builder'
  | 'freeplay-warp'
  | 'freeplay-catalog'
  | 'juno-orbit'
type BriefingOrigin = 'campaign' | 'builder'
type LaunchScreen =
  | 'builder'
  | 'selection'
  | 'results'
  | 'simulation'
  | 'report'
  | 'mission-control'
  | 'mission-overview'

type AppNavigationEntry =
  | { kind: 'sentinel' }
  | {
      kind: 'page'
      entryScreen: EntryScreen
      launchScreen: LaunchScreen
      showCinematicLanding: boolean
    }

const APP_NAVIGATION_STATE_KEY = 'amplifyVisionNavigation'

interface CampaignState {
  progress: CampaignProgress
  storageWarning: string | null
}

type StoredCampaignEvaluation = CampaignEvaluation & { previousBestScore: number | null }

const SpacecraftViewer = lazy(() =>
  import('./components/3d/SpacecraftViewer').then((module) => ({ default: module.SpacecraftViewer })),
)
const SpacecraftOrbitGallery = lazy(() =>
  import('./components/3d/SpacecraftOrbitGallery').then((module) => ({
    default: module.SpacecraftOrbitGallery,
  })),
)
const SpaceWarpTransition = lazy(() =>
  import('./components/3d/SpaceWarpTransition').then((module) => ({
    default: module.SpaceWarpTransition,
  })),
)
const JunoOrbitalSimulation = lazy(() =>
  import('./components/mission/JunoOrbitalSimulation').then((module) => ({
    default: module.JunoOrbitalSimulation,
  })),
)
const defaultSpacecraft =
  availableSpacecraftCatalog.find((spacecraft) => spacecraft.id === 'landsat-8') ??
  availableSpacecraftCatalog[0]
const MissionDirector = lazy(() =>
  import('./components/mission/MissionDirector').then((module) => ({ default: module.MissionDirector })),
)
const MissionControlChat = lazy(() =>
  import('./components/mission/MissionControlChat').then((module) => ({ default: module.MissionControlChat })),
)
const SpaceWeatherControl = lazy(() =>
  import('./components/mission/SpaceWeatherControl').then((module) => ({ default: module.SpaceWeatherControl })),
)
const MissionControlPage = lazy(() =>
  import('./components/mission/MissionControl').then((module) => ({ default: module.MissionControl })),
)
const CinematicLandingPage = lazy(() =>
  import('./components/landing/CinematicLandingPage').then((module) => ({
    default: module.CinematicLandingPage,
  })),
)

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}M`
}

interface MissionDataTableProps {
  title: string
  rows: { label: string; value: string; valueClassName?: string }[]
}

function MissionDataTable({ title, rows }: MissionDataTableProps) {
  return (
    <section className="min-w-0 rounded-[24px] border border-white/8 bg-slate-900/75 p-4">
      <h3 className="mb-3 text-base font-medium text-white">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse text-left text-xs">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {rows.map(({ label, value, valueClassName }) => (
              <tr key={label} className="border-b border-white/5 last:border-0">
                <th scope="row" className="py-2.5 pr-3 text-left font-medium text-slate-400">
                  {label}
                </th>
                <td className={`py-2.5 pl-3 text-slate-100 ${valueClassName ?? 'text-right'}`}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AppHomeLink({ onHome }: { onHome: () => void }) {
  return (
    <button
      type="button"
      aria-label="Amplify Vision home"
      onClick={onHome}
      className="app-home-link fixed left-4 top-4 z-[100] inline-flex items-center gap-2 border border-white/35 bg-black/85 px-3 py-2 text-[10px] tracking-[0.16em] text-white shadow-lg backdrop-blur transition hover:border-white hover:bg-black"
    >
      <span className="grid h-6 w-6 place-items-center border border-white/70 text-xs font-bold tracking-normal" aria-hidden="true">
        A
      </span>
      <span>AMPLIFY<strong className="ml-1 font-bold">VISION</strong></span>
    </button>
  )
}

function MissionOverview({
  session,
  onEnterMissionControl,
  onRunAssessment,
  onExit,
}: {
  session: MissionControlSession
  onEnterMissionControl: () => void
  onRunAssessment: () => void
  onExit: () => void
}) {
  const { record, state } = session
  const elapsedMinutes = Math.floor(state.elapsedSeconds / 60)
  const completedOperations = [
    true,
    state.communicationEstablished,
    state.observationsCompleted > 0,
    state.dataDownlinkedMb > 0,
  ].filter(Boolean).length

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#03080e] px-4 py-10 text-slate-100">
      <section className="w-full max-w-4xl border border-cyan-300/20 bg-[#07111d] shadow-2xl">
        <header className="border-b border-slate-700/60 p-6 sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300/75">
            Flight operations · deployed mission
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">{session.missionTitle}</h1>
          <p className="mt-2 text-sm text-slate-400">{record.spacecraftName} · {record.destination}</p>
        </header>
        <div className="grid gap-0 sm:grid-cols-2">
          {[
            ['Launch status', 'Spacecraft deployed'],
            ['Launch vehicle', record.launchVehicle.name],
            ['Mission elapsed time', `${elapsedMinutes} simulated min`],
            ['Operations milestones', `${completedOperations} / 4 complete`],
            ['Recorded launch mass', `${record.spacecraftMassKg.toLocaleString()} kg`],
            ['Design power generation', `${record.missionTelemetry.power.toLocaleString()} W`],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-r border-slate-800 p-4 sm:p-5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
              <p className="mt-2 text-sm font-medium text-slate-100">{value}</p>
            </div>
          ))}
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Primary mission objective</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{session.missionObjective}</p>
          <p className="mt-3 text-xs leading-relaxed text-amber-100/75">
            Deployment is confirmed; mission completion has not been declared. Operations telemetry is illustrative and the campaign assessment remains a separate evaluation.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onEnterMissionControl}
              className="border border-cyan-300/40 bg-cyan-300/[0.1] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-300/[0.16]"
            >
              Enter Mission Control
            </button>
            {record.mode === 'mission' && (
              <button
                type="button"
                onClick={onRunAssessment}
                className="border border-emerald-300/25 bg-emerald-300/[0.06] px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-100 transition hover:bg-emerald-300/[0.1]"
              >
                Run campaign assessment
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              className="border border-slate-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Return to game modes
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function App() {
  const [missionControlRestore] = useState(loadMissionControlSession)
  const [missionControlSession, setMissionControlSession] =
    useState<MissionControlSession | null>(missionControlRestore.session)
  const [missionControlWarning, setMissionControlWarning] =
    useState<string | null>(missionControlRestore.warning)
  const missionControlSessionRef = useRef(missionControlRestore.session)
  const [showCinematicLanding, setShowCinematicLanding] = useState(
    () => !window.location.hash && !missionControlRestore.session,
  )
  const [entryScreen, setEntryScreen] = useState<EntryScreen>('home')
  const [briefingOrigin, setBriefingOrigin] = useState<BriefingOrigin>('campaign')
  const [gameMode, setGameMode] = useState<GameMode | null>(
    missionControlRestore.session?.record.mode ?? null,
  )
  const [selectedSpacecraft, setSelectedSpacecraft] = useState(() =>
    availableSpacecraftCatalog.find(
      (spacecraft) =>
        spacecraft.id === missionControlRestore.session?.record.spacecraftId ||
        spacecraft.name === missionControlRestore.session?.record.spacecraftName,
    ) ?? defaultSpacecraft,
  )
  const [selectedCampaignMissionId, setSelectedCampaignMissionId] = useState(
    missionControlRestore.session?.campaignMissionId ?? campaignMissions[0].id,
  )
  const [selectedMissionId, setSelectedMissionId] = useState(
    missionControlRestore.session?.missionGoalId ?? 'earth-observation',
  )
  const [testedDesign, setTestedDesign] = useState<string | null>(null)
  const [launchScreen, setLaunchScreen] = useState<LaunchScreen>(() =>
    missionControlRestore.session && window.location.hash === '#mission-control'
      ? 'mission-control'
      : missionControlRestore.session && window.location.hash === '#mission-overview'
        ? 'mission-overview'
        : 'builder',
  )
  const [selectedLaunchVehicleId, setSelectedLaunchVehicleId] = useState<string | null>(
    missionControlRestore.session?.record.launchVehicle.id ?? null,
  )
  const [launchRecord, setLaunchRecord] = useState<LaunchRecord | null>(
    missionControlRestore.session?.record ?? null,
  )
  const [launchDemoMode, setLaunchDemoMode] = useState(false)
  const [campaignEvaluation, setCampaignEvaluation] = useState<StoredCampaignEvaluation | null>(null)
  const [campaignState, setCampaignState] = useState<CampaignState>(() => {
    const loaded = loadCampaignProgress()
    return { progress: loaded.progress, storageWarning: loaded.warning }
  })
  const [launchAttempt, setLaunchAttempt] = useState(
    missionControlRestore.session?.record.attemptId ?? 0,
  )
  const lastAppRouteKey = useRef<string | null>(null)
  const [selectedDestinationId, setSelectedDestinationId] = useState(destinations[0].id)
  const [selectedPlannerBodyId, setSelectedPlannerBodyId] = useState('earth')
  const [launchDate, setLaunchDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [plannerPositions, setPlannerPositions] = useState<HorizonsPosition[]>([])
  const [plannerErrors, setPlannerErrors] = useState<string[]>([])
  const [plannerLoading, setPlannerLoading] = useState(true)
  const [selectedPropulsionId, setSelectedPropulsionId] = useState(propulsionOptions[0].id)
  const [build, setBuild] = useState(createInitialBuild)
  const [sustainabilityChoices, setSustainabilityChoices] = useState<SustainabilityChoices>(
    defaultSustainabilityChoices,
  )
  const [payload, setPayload] = useState(250)
  const [fuel, setFuel] = useState(750)
  const [budget, setBudget] = useState(3)
  const [riskTolerance, setRiskTolerance] = useState(38)

  const campaignProgress = campaignState.progress
  const updateMissionControlSession = useCallback((session: MissionControlSession) => {
    missionControlSessionRef.current = session
    setMissionControlSession(session)
    setMissionControlWarning(saveMissionControlSession(session))
  }, [])
  const availableCampaignMissions = useMemo(
    () => [...campaignMissions, ...campaignProgress.eventMissions],
    [campaignProgress.eventMissions],
  )
  const selectedCampaignMission =
    availableCampaignMissions.find((mission) => mission.id === selectedCampaignMissionId) ?? campaignMissions[0]
  const isAsteroidPlanningExercise =
    gameMode === 'mission' &&
    (selectedCampaignMission.eventProvenance?.provider === 'jpl' || selectedCampaignMission.planningOnly === true)
  useEffect(() => {
    if (entryScreen !== 'builder' || launchScreen === 'results' || isAsteroidPlanningExercise) return
    const controller = new AbortController()
    void loadSolarSystemPositions(launchDate, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setPlannerPositions(result.positions)
        setPlannerErrors(result.errors)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setPlannerPositions([])
        setPlannerErrors([
          error instanceof Error ? error.message : 'Planetary positions could not be loaded.',
        ])
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlannerLoading(false)
      })
    return () => controller.abort()
  }, [entryScreen, isAsteroidPlanningExercise, launchDate, launchScreen])

  const missionControlRunning =
    missionControlSession !== null && !missionControlSession.state.paused
  useEffect(() => {
    if (!missionControlRunning) return
    const intervalId = window.setInterval(() => {
      const current = missionControlSessionRef.current
      if (!current || current.state.paused) return
      const state = advanceMissionControl(current.record, current.state)
      if (state === current.state) return
      updateMissionControlSession({ ...current, state })
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [missionControlRunning, updateMissionControlSession])

  useEffect(() => {
    const route: AppNavigationEntry = {
      kind: 'page',
      entryScreen,
      launchScreen,
      showCinematicLanding,
    }
    const routeKey = JSON.stringify(route)
    const routeUrl = () => {
      const hash = launchScreen === 'mission-control'
        ? '#mission-control'
        : launchScreen === 'mission-overview'
          ? '#mission-overview'
          : ''
      return `${window.location.pathname}${window.location.search}${hash}`
    }
    const withNavigationState = (navigation: AppNavigationEntry) => {
      const currentState = window.history.state
      const baseState = currentState && typeof currentState === 'object'
        ? currentState as Record<string, unknown>
        : {}
      return { ...baseState, [APP_NAVIGATION_STATE_KEY]: navigation }
    }

    if (lastAppRouteKey.current === null) {
      const currentState = window.history.state as Record<string, unknown> | null
      const savedNavigation = currentState?.[APP_NAVIGATION_STATE_KEY] as AppNavigationEntry | undefined
      if (savedNavigation?.kind === 'sentinel') {
        window.history.pushState(withNavigationState(route), '', routeUrl())
      } else if (!savedNavigation) {
        window.history.replaceState(
          withNavigationState({ kind: 'sentinel' }),
          '',
          window.location.href,
        )
        window.history.pushState(withNavigationState(route), '', routeUrl())
      } else {
        window.history.replaceState(withNavigationState(route), '', routeUrl())
      }
      lastAppRouteKey.current = routeKey
    } else if (lastAppRouteKey.current !== routeKey) {
      window.history.pushState(withNavigationState(route), '', routeUrl())
      lastAppRouteKey.current = routeKey
    }
  }, [entryScreen, launchScreen, showCinematicLanding])

  useEffect(() => {
    const handleHistoryNavigation = (event: PopStateEvent) => {
      const state = event.state as Record<string, unknown> | null
      const navigation = state?.[APP_NAVIGATION_STATE_KEY] as AppNavigationEntry | undefined
      if (navigation?.kind === 'page') {
        lastAppRouteKey.current = JSON.stringify(navigation)
        setEntryScreen(navigation.entryScreen)
        setLaunchScreen(navigation.launchScreen)
        setShowCinematicLanding(navigation.showCinematicLanding)
        return
      }

      lastAppRouteKey.current = JSON.stringify({ kind: 'sentinel' })
      setShowCinematicLanding(false)
      setEntryScreen('home')
      setLaunchScreen('builder')
    }
    window.addEventListener('popstate', handleHistoryNavigation)
    return () => window.removeEventListener('popstate', handleHistoryNavigation)
  }, [])

  const selectedDestination =
    destinations.find((destination) => destination.id === selectedDestinationId) ?? destinations[0]
  const selectedPropulsion =
    propulsionOptions.find((option) => option.id === selectedPropulsionId) ?? propulsionOptions[0]
  const selectedMission =
    missionGoals.find((mission) => mission.id === selectedMissionId) ?? missionGoals[0]
  const selectedLaunchVehicle =
    launchVehicles.find((vehicle) => vehicle.id === selectedLaunchVehicleId) ?? null
  const missionBudgetMillions = budget * 1000
  const missionBudgetLimitMillions =
    gameMode === 'freeplay'
      ? missionBudgetMillions
      : Math.min(missionBudgetMillions, selectedMission.requirements.maxBudget ?? Number.POSITIVE_INFINITY)
  const isEarthOrbitMission = selectedDestinationId === 'earth-orbit'
  const sustainability = useMemo(
    () => assessSustainability(sustainabilityChoices, isEarthOrbitMission),
    [isEarthOrbitMission, sustainabilityChoices],
  )

  const buildStats = useMemo(
    () =>
      calculateBuildStats(
        selectedSpacecraft,
        build,
        payload,
        fuel,
        selectedDestination.risk,
        selectedPropulsion.cost,
        sustainabilityChoices,
        isEarthOrbitMission,
      ),
    [
      build,
      fuel,
      isEarthOrbitMission,
      payload,
      selectedDestination.risk,
      selectedPropulsion.cost,
      selectedSpacecraft,
      sustainabilityChoices,
    ],
  )
  const totalMissionCost =
    buildStats.missionCost + (selectedLaunchVehicle?.launchCostMillions ?? 0)
  const missionWithBudgetLimit = {
    ...selectedMission,
    requirements: {
      ...selectedMission.requirements,
      maxBudget: missionBudgetLimitMillions,
    },
  }
  const missionRequirements =
    gameMode === 'freeplay'
      ? []
      : evaluateMissionRequirements(missionWithBudgetLimit, {
          ...buildStats,
          missionCost: totalMissionCost,
        })
  const metRequirements = missionRequirements.filter((requirement) => requirement.passed).length
  const missionReadiness = missionRequirements.length
    ? Math.round((metRequirements / missionRequirements.length) * 100)
    : 0
  const missionPassed = missionRequirements.length > 0 && metRequirements === missionRequirements.length
  const designSignature = JSON.stringify([
    selectedMissionId,
    selectedSpacecraft.id,
    buildStats.power,
    buildStats.deltaV,
    buildStats.communication,
    buildStats.instrumentCount,
    buildStats.mass,
    buildStats.missionCost,
    buildStats.reliability,
    buildStats.resourceEfficiency,
  ])
  const hasTestedCurrentDesign = testedDesign === designSignature
  const canReviewLaunchVehicles = hasTestedCurrentDesign

  const metrics = useMemo(() => {
    const missionReadiness = clamp(
      25 +
        buildStats.powerMargin * 0.035 +
        buildStats.communication * 0.12 +
        buildStats.science * 0.18 +
        selectedPropulsion.efficiency * 0.1 +
        buildStats.reliability * 0.12 +
        (buildStats.resourceEfficiency - 65) * 0.08 -
        selectedDestination.risk * 0.34 -
        riskTolerance * 0.08 +
        Math.min(buildStats.deltaV, 12) * 1.3,
      28,
      97,
    )

    const transferTime = Math.max(
      3,
      Math.round(
        selectedDestination.risk / 16 +
          (100 - selectedPropulsion.efficiency) / 10 +
          payload / 180,
      ),
    )

    const missionRisk = clamp(
      12 +
        selectedDestination.risk * 0.5 +
        (100 - buildStats.reliability) * 0.45 +
        (100 - selectedPropulsion.efficiency) * 0.12 -
        riskTolerance * 0.18,
      8,
      89,
    )

    return {
      missionReadiness,
      powerMargin: clamp((buildStats.powerMargin / Math.max(buildStats.power, 1)) * 100, 0, 100),
      totalCost: totalMissionCost,
      transferTime,
      missionRisk,
    }
  }, [buildStats, payload, riskTolerance, selectedDestination.risk, selectedPropulsion.efficiency, totalMissionCost])

  const missionChecklist =
    gameMode === 'freeplay'
      ? [
          `Destination selected: ${selectedDestination.label}`,
          `${selectedPropulsion.label} propulsion selected`,
          `Spacecraft power output: ${buildStats.power.toLocaleString()} W`,
          `Communications link: ${buildStats.communication}%`,
          `Spacecraft launch mass: ${buildStats.mass.toLocaleString()} kg`,
          ...(selectedLaunchVehicle
            ? [`${selectedLaunchVehicle.name} selected · ${formatCurrency(selectedLaunchVehicle.launchCostMillions)} launch cost`]
            : []),
        ]
      : [
          isAsteroidPlanningExercise
            ? 'Small-body event is retained as context only · no orbit or intercept is modeled'
            : `${selectedDestination.environment} route validated`,
          isAsteroidPlanningExercise
            ? `${selectedPropulsion.label} propulsion selected · asteroid transfer not calculated`
            : `${selectedPropulsion.label} transfer profile selected · ${metrics.transferTime} mo simplified estimate`,
          `${buildStats.communication}% communications link margin`,
          `${payload.toLocaleString()} kg payload balance within thermal envelope`,
          ...(selectedLaunchVehicle
            ? [`${selectedLaunchVehicle.name} assigned · ${formatCurrency(selectedLaunchVehicle.launchCostMillions)} launch cost`]
            : []),
        ]
  const remainingMissionBudget = missionBudgetLimitMillions - metrics.totalCost
  const availableComponents: BuildComponentId[] = ['solarPanel', 'antenna', 'engine', 'instrument']
  const updateBuild = <Key extends keyof typeof build>(key: Key, value: (typeof build)[Key]) =>
    setBuild((current) => ({ ...current, [key]: value }))
  const clearSavedMissionControl = () => {
    missionControlSessionRef.current = null
    setMissionControlSession(null)
    setMissionControlWarning(clearMissionControlSession())
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
    }
  }
  const updateLaunchDate = (date: string) => {
    if (date === launchDate) return
    setPlannerLoading(true)
    setPlannerErrors([])
    setPlannerPositions([])
    setLaunchDate(date)
  }
  const updateSustainability = <Key extends keyof SustainabilityChoices>(
    key: Key,
    value: SustainabilityChoices[Key],
  ) => setSustainabilityChoices((current) => ({ ...current, [key]: value }))
  const toggleComponent = (component: BuildComponentId) =>
    setBuild((current) => ({
      ...current,
      components: current.components.includes(component)
        ? current.components.filter((item) => item !== component)
        : [...current.components, component],
    }))
  const warnings = [
    {
      label: buildStats.powerMargin >= 0 ? 'Power sufficient' : 'Insufficient power',
      ok: buildStats.powerMargin >= 0,
    },
    {
      label: buildStats.communication >= 60 ? 'Communication sufficient' : 'Weak communication link',
      ok: buildStats.communication >= 60,
    },
    { label: 'Low Delta-V', ok: buildStats.deltaV >= 3 },
    { label: 'Over budget', ok: totalMissionCost <= missionBudgetLimitMillions },
  ]
  const designNeedsReview = warnings.some((warning) => !warning.ok)
  const startCampaignMission = (
    missionId: string,
    screen: 'briefing' | 'builder' = 'briefing',
    missions: CampaignMission[] = availableCampaignMissions,
  ) => {
    clearSavedMissionControl()
    const campaignMission = resolveCampaignMission(
      missionId,
      campaignProgress.completedMissionIds,
      campaignProgress.allMissionsUnlocked,
      missions,
    )
    const missionGoal = getCampaignMissionGoal(campaignMission)
    setGameMode('mission')
    setSelectedCampaignMissionId(campaignMission.id)
    setSelectedMissionId(campaignMission.missionGoalId)
    const recommendedSpacecraft = availableSpacecraftCatalog.find(
      (spacecraft) => spacecraft.id === campaignMission.recommendedSpacecraftId,
    )
    if (recommendedSpacecraft) setSelectedSpacecraft(recommendedSpacecraft)
    setSelectedDestinationId(missionGoal.destinationId)
    setSelectedPlannerBodyId(getPlanetaryBodyForDestination(missionGoal.destinationId)?.id ?? 'earth')
    setSelectedLaunchVehicleId(null)
    setTestedDesign(null)
    setBriefingOrigin('campaign')
    setLaunchRecord(null)
    setCampaignEvaluation(null)
    setLaunchScreen('builder')
    setEntryScreen(screen)
  }
  const startEventMission = (mission: CampaignMission) => {
    const savedMission = campaignProgress.eventMissions.find((candidate) => candidate.id === mission.id)
    const missionSnapshot = savedMission ?? mission
    if (!savedMission) {
      const nextProgress = {
        ...campaignProgress,
        eventMissions: [...campaignProgress.eventMissions, missionSnapshot],
      }
      const storageWarning = saveCampaignProgress(nextProgress)
      setCampaignState({ progress: nextProgress, storageWarning })
    }
    startCampaignMission(
      missionSnapshot.id,
      'briefing',
      savedMission ? availableCampaignMissions : [...availableCampaignMissions, missionSnapshot],
    )
  }
  const unlockCampaignMissions = () => {
    const nextProgress = unlockAllCampaignMissions(campaignProgress)
    const storageWarning = saveCampaignProgress(nextProgress)
    setCampaignState({ progress: nextProgress, storageWarning })
  }
  const finishCampaignAttempt = (record: LaunchRecord) => {
    const evaluation = evaluateCampaignAttempt(selectedCampaignMission, record)
    const previousBestScore = campaignProgress.bestScores[evaluation.missionId] ?? null
    setCampaignEvaluation({ ...evaluation, previousBestScore })
    const previousProgress = campaignProgress
    const completedMissionIds = evaluation.objectiveAchieved
      ? [...new Set([...previousProgress.completedMissionIds, evaluation.missionId])]
      : previousProgress.completedMissionIds
    const attemptNumber =
      previousProgress.attempts
        .filter((attempt) => attempt.missionId === evaluation.missionId)
        .reduce((highest, attempt) => Math.max(highest, attempt.attemptNumber), 0) + 1
    const nextProgress: CampaignProgress = {
      ...previousProgress,
      completedMissionIds,
      bestScores: {
        ...previousProgress.bestScores,
        [evaluation.missionId]: Math.max(
          previousProgress.bestScores[evaluation.missionId] ?? 0,
          evaluation.score,
        ),
      },
      attempts: [
        ...previousProgress.attempts,
        {
          id: `${evaluation.missionId}-${attemptNumber}`,
          missionId: evaluation.missionId,
          attemptNumber,
          score: evaluation.score,
          status: evaluation.status,
          objectiveAchieved: evaluation.objectiveAchieved,
        },
      ].slice(-100),
    }
    const storageWarning = saveCampaignProgress(nextProgress)
    setCampaignState({ progress: nextProgress, storageWarning })
    setLaunchScreen('report')
  }
  const launchMission = (vehicle: LaunchVehicleSpec) => {
    const totalCost = buildStats.missionCost + vehicle.launchCostMillions
    const missionProfile =
      selectedDestinationId === 'asteroid-planning'
        ? 'planning'
        : gameMode === 'mission' &&
            `${selectedMission.name} ${selectedMission.description}`.toLocaleLowerCase().includes('flyby')
          ? 'flyby'
          : 'orbiter'
    const launchRequirements = evaluateMissionRequirements(missionWithBudgetLimit, {
      ...buildStats,
      missionCost: totalCost,
    })
    const assessment = assessLaunchOutcome(buildStats.mass, buildStats.reliability, vehicle, {
      destination: selectedDestination.label,
      missionType: missionProfile === 'orbiter' ? 'orbital' : missionProfile === 'flyby' ? 'flyby' : 'unknown',
      availableDeltaV: buildStats.deltaV,
      requiredDeltaV: launchRequirements.find((requirement) => requirement.id === 'deltaV')?.target ?? buildStats.deltaV,
      availablePowerW: buildStats.power,
      requiredPowerW: launchRequirements.find((requirement) => requirement.id === 'power')?.target ?? buildStats.powerDemand,
      availableCommunication: buildStats.communication,
      requiredCommunication: launchRequirements.find((requirement) => requirement.id === 'communication')?.target ?? 0,
      availableInstruments: buildStats.instrumentCount,
      requiredInstruments: launchRequirements.find((requirement) => requirement.id === 'instruments')?.target ?? 0,
      maxMassKg: launchRequirements.find((requirement) => requirement.id === 'maxMass')?.target ?? undefined,
    })
    const ephemerides = isAsteroidPlanningExercise
      ? []
      : plannerPositions.filter((position) => position.requestedDate === launchDate)
    const destinationBody = getPlanetaryBodyForDestination(selectedDestinationId) ?? null
    const transferEstimate =
      destinationBody && destinationBody.id !== 'earth'
        ? (() => {
            const earth = ephemerides.find((position) => position.bodyId === 'earth')
            const target = ephemerides.find((position) => position.bodyId === destinationBody.id)
            return earth && target ? estimateHohmannTransfer(earth, target) : null
          })()
        : null

    const attemptId = launchAttempt + 1
    setLaunchAttempt(attemptId)
    setSelectedLaunchVehicleId(vehicle.id)
    setLaunchRecord({
      attemptId,
      mode: gameMode ?? 'mission',
      missionName: gameMode === 'freeplay'
        ? selectedMission.name
        : selectedCampaignMission.title,
      destination: selectedDestination.label,
      planningSnapshot: {
        launchDate,
        destinationBodyId: destinationBody?.id ?? null,
        destinationId: selectedDestinationId,
        missionProfile,
        ephemerides,
        transferEstimate,
      },
      spacecraftName: selectedSpacecraft.name,
      spacecraftId: selectedSpacecraft.id,
      spacecraftType: selectedSpacecraft.type,
      spacecraftModel: selectedSpacecraft.model,
      spacecraftBuild: { ...build, components: [...build.components] },
      spacecraftMassKg: buildStats.mass,
      existingMissionCostMillions: buildStats.missionCost,
      launchVehicle: vehicle,
      totalMissionCostMillions: totalCost,
      missionBudgetMillions: missionBudgetLimitMillions,
      spacecraftReliability: buildStats.reliability,
      missionTelemetry: {
        power: buildStats.power,
        deltaV: buildStats.deltaV,
        communication: buildStats.communication,
        instruments: buildStats.instrumentCount,
        instrumentType: build.instrumentType,
        science: buildStats.science,
        resourceEfficiency: buildStats.resourceEfficiency,
        sustainabilityLevel: buildStats.sustainabilityLevel,
      },
      missionRequirementResults: launchRequirements,
      ...assessment,
      failureCategory: assessment.failureCategory,
    })
    setLaunchScreen('results')
  }

  const enterMissionControl = () => {
    if (!launchRecord || launchRecord.outcome !== 'success') {
      setMissionControlWarning('Mission Control opens only after successful spacecraft deployment.')
      return
    }
    const missionTitle = gameMode === 'mission' ? selectedCampaignMission.title : selectedMission.name
    const missionObjective = gameMode === 'mission'
      ? selectedCampaignMission.objective
      : selectedMission.description
    const missionGoalId = gameMode === 'mission'
      ? selectedCampaignMission.missionGoalId
      : selectedMission.id
    const session = createMissionControlSession(launchRecord, {
      missionId: gameMode === 'mission' ? selectedCampaignMission.id : selectedMission.id,
      missionTitle,
      missionObjective,
      missionGoalId,
      campaignMissionId: gameMode === 'mission' ? selectedCampaignMission.id : null,
    })
    updateMissionControlSession(session)
    setLaunchScreen('mission-control')
  }

  const returnToMissionOverview = () => {
    setLaunchScreen('mission-overview')
  }

  const openMissionControl = () => {
    if (!missionControlSession) return
    setLaunchScreen('mission-control')
  }

  const runMissionControlAssessment = () => {
    if (!missionControlSession || missionControlSession.record.mode !== 'mission') return
    setLaunchRecord(missionControlSession.record)
    setLaunchScreen('simulation')
  }

  const returnToHome = () => {
    setShowCinematicLanding(false)
    setEntryScreen('home')
    setLaunchScreen('builder')
  }
  const appHomeLink =
    entryScreen !== 'home' && (entryScreen !== 'builder' || launchScreen !== 'builder') ||
    launchScreen === 'mission-control' ||
    launchScreen === 'mission-overview'
      ? <AppHomeLink onHome={returnToHome} />
      : null

  const missionControlChat = (
    <>
      {appHomeLink}
      <Suspense fallback={null}>
        <MissionControlChat
          context={{
            mode: gameMode === 'mission' ? 'Mission Mode' : gameMode === 'freeplay' ? 'Freeplay' : 'Mode selection',
            mission: gameMode === 'mission' ? selectedCampaignMission.title : 'Freeplay sandbox',
            objective: gameMode === 'mission' ? selectedCampaignMission.objective : selectedMission.description,
            destination: selectedDestination.label,
            phase: launchScreen === 'results' ? `Launch results · ${launchRecord?.outcome ?? 'not available'}` : launchScreen,
            spacecraft: selectedSpacecraft.name,
            propulsion: selectedPropulsion.label,
            ...(selectedLaunchVehicle ? { launchVehicle: selectedLaunchVehicle.name } : {}),
            massKg: buildStats.mass,
            powerWatts: buildStats.power,
            deltaVKmPerSecond: buildStats.deltaV,
            communicationPercent: buildStats.communication,
            reliabilityPercent: buildStats.reliability,
            scienceInstruments: buildStats.instrumentCount,
          }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SpaceWeatherControl />
      </Suspense>
    </>
  )

  if (launchScreen === 'mission-control' && missionControlSession) {
    return (
      <>
        {appHomeLink}
        <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#03080e] text-sm text-slate-300">Establishing Mission Control…</div>}>
          <MissionControlPage
            key={missionControlSession.record.attemptId}
            initialSession={missionControlSession}
            onSessionChange={updateMissionControlSession}
            onReturnToOverview={returnToMissionOverview}
            onRunMissionAssessment={runMissionControlAssessment}
            persistenceWarning={missionControlWarning}
          />
        </Suspense>
      </>
    )
  }

  if (launchScreen === 'mission-overview' && missionControlSession) {
    return (
      <>
        {appHomeLink}
        <MissionOverview
          session={missionControlSession}
          onEnterMissionControl={openMissionControl}
          onRunAssessment={runMissionControlAssessment}
          onExit={() => {
            setLaunchScreen('builder')
            setEntryScreen('home')
            if (window.location.hash) {
              window.history.replaceState(
                window.history.state,
                '',
                `${window.location.pathname}${window.location.search}`,
              )
            }
          }}
        />
      </>
    )
  }

  if (showCinematicLanding) {
    return (
      <Suspense
        fallback={
          <div className="grid min-h-screen place-items-center bg-[#02060d] text-[10px] uppercase tracking-[0.2em] text-slate-400">
            Preparing flight systems
          </div>
        }
      >
        <CinematicLandingPage
          onEnter={() => {
            setShowCinematicLanding(false)
            setEntryScreen('home')
          }}
        />
      </Suspense>
    )
  }

  if (entryScreen === 'juno-orbit') {
    return (
      <Suspense
        fallback={
          <div className="grid min-h-screen place-items-center bg-[#030912] text-sm text-slate-300">
            Preparing Juno orbital simulation…
          </div>
        }
      >
        <JunoOrbitalSimulation onBack={() => setEntryScreen('home')} />
      </Suspense>
    )
  }

  if (entryScreen === 'home') {
    return (
      <>
        <HomeScreen
          onMissionMode={() => setEntryScreen('campaign')}
          onLiveEvents={() => setEntryScreen('events')}
          onJunoSimulation={() => {
            setShowCinematicLanding(false)
            setEntryScreen('juno-orbit')
          }}
          onFreeplayMode={() => {
            clearSavedMissionControl()
            setGameMode('freeplay')
            setTestedDesign(null)
            setLaunchRecord(null)
            setLaunchScreen('builder')
            setEntryScreen('freeplay-warp')
          }}
        />
        {missionControlSession && (
          <button
            type="button"
            onClick={openMissionControl}
            className="fixed right-4 top-4 z-50 border border-cyan-300/35 bg-[#07111d]/95 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100 shadow-xl transition hover:bg-cyan-300/10"
          >
            Resume {missionControlSession.missionTitle}
          </button>
        )}
        {missionControlChat}
      </>
    )
  }

  if (entryScreen === 'campaign') {
    return (
      <>
        <CampaignSelectionScreen
          onBack={() => setEntryScreen('home')}
          progress={campaignProgress}
          missions={availableCampaignMissions}
          storageWarning={campaignState.storageWarning}
          onUnlockAllMissions={unlockCampaignMissions}
          onSelectMission={(missionId) => startCampaignMission(missionId)}
        />
        {missionControlChat}
      </>
    )
  }

  if (entryScreen === 'events') {
    return (
      <>
        <LiveEventsBoard
          onBack={() => setEntryScreen('home')}
          onOpenCampaign={() => setEntryScreen('campaign')}
          onCreateMission={startEventMission}
          savedMissionIds={campaignProgress.eventMissions.map((mission) => mission.id)}
        />
        {missionControlChat}
      </>
    )
  }

  if (entryScreen === 'freeplay-warp') {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#020711]" aria-hidden="true" />
        }
      >
        <SpaceWarpTransition
          selectedId={selectedSpacecraft.id}
          onClose={() => setEntryScreen('home')}
          onSelect={(spacecraft) => {
            setSelectedSpacecraft(spacecraft)
            setEntryScreen('builder')
          }}
        />
      </Suspense>
    )
  }

  if (entryScreen === 'freeplay-catalog') {
    return (
      <>
        <Suspense
          fallback={
            <div className="grid min-h-screen place-items-center bg-black text-sm text-white/70">
              Preparing spacecraft gallery...
            </div>
          }
        >
          <SpacecraftOrbitGallery
            selectedId={selectedSpacecraft.id}
            selectedModel={null}
            onClose={() => setEntryScreen('home')}
            onSelect={(spacecraft) => {
              setSelectedSpacecraft(spacecraft)
              setEntryScreen('builder')
            }}
          />
        </Suspense>
        {missionControlChat}
      </>
    )
  }

  if (launchScreen === 'simulation' && launchRecord && gameMode === 'mission') {
    return (
      <>
        <CampaignMissionSimulation
          mission={selectedCampaignMission}
          record={launchRecord}
          onComplete={() => finishCampaignAttempt(launchRecord)}
        />
        {missionControlChat}
      </>
    )
  }

  if (launchScreen === 'report' && launchRecord && campaignEvaluation) {
    const nextMission = campaignMissions.find(
      (mission) =>
        mission.requiresMissionIds.includes(selectedCampaignMission.id) &&
        isCampaignMissionUnlocked(
          mission,
          campaignProgress.completedMissionIds,
          campaignProgress.allMissionsUnlocked,
        ),
    ) ?? null
    return (
      <>
        <CampaignPerformanceReport
          mission={selectedCampaignMission}
          record={launchRecord}
          evaluation={campaignEvaluation}
          previousBestScore={campaignEvaluation.previousBestScore}
          attemptHistory={campaignProgress.attempts.filter(
            (attempt) => attempt.missionId === selectedCampaignMission.id,
          )}
          nextMission={nextMission}
          onContinue={startCampaignMission}
          onReplay={() => {
            setLaunchRecord(null)
            setCampaignEvaluation(null)
            setLaunchScreen('builder')
            setEntryScreen('builder')
          }}
          onRetry={() => startCampaignMission(selectedCampaignMission.id)}
          onReviewDesign={() => {
            setLaunchRecord(null)
            setCampaignEvaluation(null)
            setLaunchScreen('builder')
            setEntryScreen('builder')
          }}
          onMissionSelection={() => {
            setLaunchRecord(null)
            setCampaignEvaluation(null)
            setLaunchScreen('builder')
            setEntryScreen('campaign')
          }}
        />
        {missionControlChat}
      </>
    )
  }

  if (entryScreen === 'briefing') {
    return (
    <>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#020912] text-sm text-slate-300">
            Preparing mission briefing...
          </div>
        }
      >
        <MissionDirector
          briefing={selectedCampaignMission.briefing}
          missionGoal={getCampaignMissionGoal(selectedCampaignMission)}
          onBack={() => setEntryScreen(briefingOrigin)}
          onStart={() => setEntryScreen('builder')}
          startLabel={briefingOrigin === 'builder' ? 'Return to Spacecraft Design' : 'Continue to Spacecraft Design'}
          backLabel={briefingOrigin === 'builder' ? 'Return to design' : 'Back to mission selection'}
        />
      </Suspense>
      {missionControlChat}
    </>
    )
  }

  return (
    <div className="min-h-screen bg-[#020912] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.35em] text-sky-300/80">
              {gameMode === 'freeplay' ? 'Freeplay · Open sandbox' : `Mission Mode · Level ${selectedCampaignMission.level}`}
            </p>
            <button
              type="button"
              onClick={returnToHome}
              aria-label="Amplify Vision home"
              className="text-left text-3xl font-semibold tracking-[-0.06em] text-white transition hover:text-slate-300 sm:text-4xl"
            >
              Amplify Vision
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className={`flex items-center gap-3 rounded-full border px-3 py-2 text-sm ${
              designNeedsReview
                ? 'border-amber-400/20 bg-amber-400/5 text-amber-100'
                : 'border-sky-400/20 bg-sky-400/5 text-sky-100'
            }`}>
              <span className={`h-2.5 w-2.5 rounded-full ${
                designNeedsReview ? 'bg-amber-400' : 'bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]'
              }`} />
              {designNeedsReview ? 'Design needs review' : 'Mission ready for flight review'}
            </div>
            {gameMode === 'mission' && (
              <button
                type="button"
                onClick={() => {
                  setBriefingOrigin('builder')
                  setEntryScreen('briefing')
                }}
                className="rounded-full border border-sky-300/20 px-4 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/10"
              >
                Review briefing
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setGameMode(null)
                setEntryScreen('home')
              }}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              Exit to game modes
            </button>
          </div>
        </header>

        <main className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_350px]">
          <aside className="space-y-6">
            <div className="rounded-[28px] border border-white/8 bg-slate-900/70 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium text-white">Mission configuration</h2>
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-violet-100">
                  Design
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-slate-400">
                    Spacecraft
                  </label>
                  <select
                    aria-label="Choose spacecraft model"
                    value={selectedSpacecraft.id}
                    onChange={(event) => {
                      const spacecraft = availableSpacecraftCatalog.find(
                        (craft) => craft.id === event.target.value,
                      )
                      if (spacecraft) setSelectedSpacecraft(spacecraft)
                    }}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-100 outline-none focus:border-sky-400/60"
                  >
                    {availableSpacecraftCatalog.map((craft) => (
                      <option key={craft.id} value={craft.id}>
                        {craft.name} · {craft.type}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 rounded-xl border border-white/8 bg-slate-950/30 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{selectedSpacecraft.name}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {selectedSpacecraft.missionCategory ?? 'Mission preset'} · {selectedSpacecraft.missionStatus ?? 'Mission profile'}
                        </p>
                      </div>
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: selectedSpacecraft.accent, boxShadow: `0 0 16px ${selectedSpacecraft.accent}` }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="destination" className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-slate-400">
                    Destination
                  </label>
                  {gameMode === 'freeplay' ? (
                    <select
                      id="destination"
                      value={selectedDestinationId}
                      onChange={(event) => {
                        const destinationId = event.target.value
                        setSelectedDestinationId(destinationId)
                        setSelectedPlannerBodyId(getPlanetaryBodyForDestination(destinationId)?.id ?? 'earth')
                      }}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-100 outline-none ring-0 transition focus:border-sky-400/60"
                    >
                      {destinations.map((destination) => (
                        <option key={destination.id} value={destination.id}>
                          {destination.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-100">
                      {selectedDestination.label} · set by mission
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-slate-400">
                    Propulsion
                  </label>
                  <div className="grid gap-2">
                    {propulsionOptions.map((option) => {
                      const isSelected = option.id === selectedPropulsionId

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSelectedPropulsionId(option.id)}
                          className={`rounded-2xl border p-3 text-left transition ${
                            isSelected
                              ? 'border-violet-400/60 bg-violet-500/10'
                              : 'border-white/8 bg-slate-950/30 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-white">{option.label}</span>
                            <span className="text-xs text-violet-200">{option.efficiency}%</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{option.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-slate-900/70 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-white">Build / Edit</h3>
                <p className="mt-1 text-xs text-slate-400">
                  The spacecraft model shows its original configuration. Add optional modules to customize it.
                </p>
              </div>
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-950/30 px-3 py-2.5 text-sm">
                  <span className="text-slate-200">Spacecraft body</span>
                  <span className="text-emerald-300">Installed</span>
                </div>
                {availableComponents.map((component) => {
                  const installed = build.components.includes(component)
                  return (
                    <div
                      key={component}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-slate-950/30 px-3 py-2.5"
                    >
                      <span className="text-sm text-slate-200">
                        {buildComponentLabels[component]}
                        {component === 'instrument' && installed && (
                          <span className="ml-1 text-slate-400">×{build.instrumentCount}</span>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {component === 'instrument' && installed && (
                          <>
                            <button
                              type="button"
                              aria-label="Remove one science instrument"
                              disabled={build.instrumentCount <= 1}
                              onClick={() =>
                                updateBuild('instrumentCount', Math.max(1, build.instrumentCount - 1))
                              }
                              className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              aria-label="Add one science instrument"
                              disabled={build.instrumentCount >= 4}
                              onClick={() =>
                                updateBuild('instrumentCount', Math.min(4, build.instrumentCount + 1))
                              }
                              className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              +
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          aria-label={`${installed ? 'Remove' : 'Add'} ${buildComponentLabels[component]}`}
                          aria-pressed={installed}
                          onClick={() => toggleComponent(component)}
                          className={`rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            installed
                              ? 'border-rose-300/25 bg-rose-300/10 text-rose-100 hover:bg-rose-300/20'
                              : 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20'
                          }`}
                        >
                          {installed ? 'Remove' : `+ Add`}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="space-y-3">
                {build.components.includes('solarPanel') && (
                  <label className="block text-xs text-slate-400">
                    Solar panel size
                    <select
                      aria-label="Solar panel size"
                      value={build.solarPanelSize}
                      onChange={(event) => updateBuild('solarPanelSize', event.target.value as SolarPanelSize)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white"
                    >
                      {(['small', 'medium', 'large'] as const).map((size) => (
                        <option key={size} value={size}>
                          {solarPanelOptions[size].label} — {solarPanelOptions[size].power.toLocaleString()} W
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {build.components.includes('antenna') && (
                  <label className="block text-xs text-slate-400">
                    Antenna
                    <select
                      aria-label="Antenna type"
                      value={build.antennaType}
                      onChange={(event) => updateBuild('antennaType', event.target.value as AntennaType)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white"
                    >
                      {(Object.keys(antennaOptions) as AntennaType[]).map((type) => (
                        <option key={type} value={type}>{antennaOptions[type].label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {build.components.includes('engine') && (
                  <label className="block text-xs text-slate-400">
                    Engine
                    <select
                      aria-label="Engine type"
                      value={build.engineType}
                      onChange={(event) => updateBuild('engineType', event.target.value as EngineType)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white"
                    >
                      {(Object.keys(engineOptions) as EngineType[]).map((type) => (
                        <option key={type} value={type}>{engineOptions[type].label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {build.components.includes('instrument') && (
                  <label className="block text-xs text-slate-400">
                    Science payload
                    <select
                      aria-label="Science instrument"
                      value={build.instrumentType}
                      onChange={(event) => updateBuild('instrumentType', event.target.value as InstrumentType)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white"
                    >
                      {(Object.keys(instrumentOptions) as InstrumentType[]).map((type) => (
                        <option key={type} value={type}>{instrumentOptions[type].label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-emerald-300/15 bg-slate-900/70 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-white">Sustainability choices</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Balance upfront mass and cost against long-term mission value.
                </p>
              </div>
              <div className="space-y-4">
                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-slate-200">Propulsion lifecycle</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={sustainabilityChoices.propulsionLifecycle === 'disposable'}
                      onClick={() => updateSustainability('propulsionLifecycle', 'disposable')}
                      className={`rounded-xl border p-3 text-left transition ${
                        sustainabilityChoices.propulsionLifecycle === 'disposable'
                          ? 'border-sky-300/45 bg-sky-300/10'
                          : 'border-white/8 bg-slate-950/25 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-white">Disposable</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                        Lower mass and cost; single-flight hardware.
                      </span>
                      <span className="mt-2 block text-[10px] text-emerald-200">Baseline mass and cost</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={sustainabilityChoices.propulsionLifecycle === 'reusable'}
                      onClick={() => updateSustainability('propulsionLifecycle', 'reusable')}
                      className={`rounded-xl border p-3 text-left transition ${
                        sustainabilityChoices.propulsionLifecycle === 'reusable'
                          ? 'border-emerald-300/45 bg-emerald-300/10'
                          : 'border-white/8 bg-slate-950/25 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-white">Reusable propulsion</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                        Better future reuse and reliability.
                      </span>
                      <span className="mt-2 block text-[10px] text-amber-200">+120 kg · +$40M</span>
                    </button>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-slate-200">Spacecraft architecture</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={sustainabilityChoices.architecture === 'integrated'}
                      onClick={() => updateSustainability('architecture', 'integrated')}
                      className={`rounded-xl border p-3 text-left transition ${
                        sustainabilityChoices.architecture === 'integrated'
                          ? 'border-sky-300/45 bg-sky-300/10'
                          : 'border-white/8 bg-slate-950/25 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-white">Integrated</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                        Lighter and cheaper; harder to repair or upgrade.
                      </span>
                      <span className="mt-2 block text-[10px] text-emerald-200">Baseline mass and cost</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={sustainabilityChoices.architecture === 'modular'}
                      onClick={() => updateSustainability('architecture', 'modular')}
                      className={`rounded-xl border p-3 text-left transition ${
                        sustainabilityChoices.architecture === 'modular'
                          ? 'border-emerald-300/45 bg-emerald-300/10'
                          : 'border-white/8 bg-slate-950/25 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-white">Modular</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                        Easier to repair, upgrade, and reuse.
                      </span>
                      <span className="mt-2 block text-[10px] text-amber-200">+85 kg · +$28M</span>
                    </button>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-slate-200">Spare parts</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={sustainabilityChoices.spareParts === 'minimal'}
                      onClick={() => updateSustainability('spareParts', 'minimal')}
                      className={`rounded-xl border p-3 text-left transition ${
                        sustainabilityChoices.spareParts === 'minimal'
                          ? 'border-sky-300/45 bg-sky-300/10'
                          : 'border-white/8 bg-slate-950/25 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-white">Minimal spares</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                        Lower launch mass and cost, fewer repair options.
                      </span>
                      <span className="mt-2 block text-[10px] text-emerald-200">Baseline mass and cost</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={sustainabilityChoices.spareParts === 'spares'}
                      onClick={() => updateSustainability('spareParts', 'spares')}
                      className={`rounded-xl border p-3 text-left transition ${
                        sustainabilityChoices.spareParts === 'spares'
                          ? 'border-emerald-300/45 bg-emerald-300/10'
                          : 'border-white/8 bg-slate-950/25 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-white">Spare components</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                        More repair capacity, reliability, and future reuse.
                      </span>
                      <span className="mt-2 block text-[10px] text-amber-200">+55 kg · +$18M</span>
                    </button>
                  </div>
                </fieldset>

                {isEarthOrbitMission && (
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium text-slate-200">End-of-life strategy</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        aria-pressed={sustainabilityChoices.endOfLife === 'controlledDeorbit'}
                        onClick={() => updateSustainability('endOfLife', 'controlledDeorbit')}
                        className={`rounded-xl border p-3 text-left transition ${
                          sustainabilityChoices.endOfLife === 'controlledDeorbit'
                            ? 'border-emerald-300/45 bg-emerald-300/10'
                            : 'border-white/8 bg-slate-950/25 hover:border-white/20'
                        }`}
                      >
                        <span className="block text-xs font-semibold text-white">Controlled deorbit</span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                          Extra propellant helps reduce orbital debris.
                        </span>
                        <span className="mt-2 block text-[10px] text-amber-200">+80 kg · +$20M</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={sustainabilityChoices.endOfLife === 'leaveInOrbit'}
                        onClick={() => updateSustainability('endOfLife', 'leaveInOrbit')}
                        className={`rounded-xl border p-3 text-left transition ${
                          sustainabilityChoices.endOfLife === 'leaveInOrbit'
                            ? 'border-sky-300/45 bg-sky-300/10'
                            : 'border-white/8 bg-slate-950/25 hover:border-white/20'
                        }`}
                      >
                        <span className="block text-xs font-semibold text-white">Leave in orbit</span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
                          Lighter and cheaper, but leaves debris risk.
                        </span>
                        <span className="mt-2 block text-[10px] text-emerald-200">No added mass or cost</span>
                      </button>
                    </div>
                  </fieldset>
                )}
              </div>
            </div>

          </aside>

          <section className="space-y-6">
            {launchScreen === 'selection' && (
              <SolarSystemPlanner
                mode={gameMode ?? 'mission'}
                planningOnly={isAsteroidPlanningExercise}
                planningOnlyTitle={selectedCampaignMission.eventProvenance?.title ?? selectedCampaignMission.title}
                planningOnlySourceUrl={
                  selectedCampaignMission.eventProvenance?.sourceUrl ?? selectedCampaignMission.briefing.sourceUrl
                }
                planningOnlyIsLiveEvent={selectedCampaignMission.eventProvenance?.provider === 'jpl'}
                launchDate={launchDate}
                onLaunchDateChange={updateLaunchDate}
                positions={plannerPositions}
                loading={plannerLoading}
                errors={plannerErrors}
                selectedBodyId={selectedPlannerBodyId}
                selectedDestinationId={selectedDestinationId}
                onSelectBody={setSelectedPlannerBodyId}
                onSetDestination={(destinationId) => {
                  setSelectedDestinationId(destinationId)
                  const body = getPlanetaryBodyForDestination(destinationId)
                  if (body) setSelectedPlannerBodyId(body.id)
                  setTestedDesign(null)
                }}
              />
            )}
            {launchScreen === 'selection' ? (
              <LaunchVehicleSelection
                mode={gameMode ?? 'mission'}
                vehicles={launchVehicles}
                selectedVehicleId={selectedLaunchVehicleId}
                onSelectVehicle={setSelectedLaunchVehicleId}
                onReturnToBuilder={() => setLaunchScreen('builder')}
                onLaunch={(vehicle) => {
                  setLaunchDemoMode(false)
                  launchMission(vehicle)
                }}
                onDemoMission={(vehicle) => {
                  setLaunchDemoMode(true)
                  launchMission(vehicle)
                }}
                spacecraftName={selectedSpacecraft.name}
                spacecraftMassKg={buildStats.mass}
                existingMissionCostMillions={buildStats.missionCost}
                missionBudgetMillions={missionBudgetMillions}
                missionBudgetLimitMillions={missionBudgetLimitMillions}
                designTested={gameMode === 'freeplay' || hasTestedCurrentDesign}
                missionRequirements={missionRequirements}
                spacecraftReliability={buildStats.reliability}
              />
            ) : launchScreen === 'results' && launchRecord ? (
              <LaunchResults
                key={launchRecord.attemptId}
                record={launchRecord}
                onRetry={(vehicle) => {
                  setLaunchDemoMode(false)
                  launchMission(vehicle)
                }}
                onReturnToBuilder={() => setLaunchScreen('builder')}
                onChangeLaunchVehicle={() => setLaunchScreen('selection')}
                onMissionFailure={() => finishCampaignAttempt(launchRecord)}
                onStartMissionSimulation={() => setLaunchScreen('simulation')}
                onEnterMissionControl={enterMissionControl}
                startInDemoMode={launchDemoMode}
              />
            ) : (
              <>
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="rounded-[30px] border border-white/8 bg-slate-900/70 p-4 shadow-[0_15px_55px_rgba(15,23,42,0.45)] backdrop-blur-xl"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_230px]">
                <Suspense
                  fallback={
                    <div
                      className="flex h-[430px] flex-col items-center justify-center gap-3 rounded-[28px] border border-white/10 bg-slate-950/70 text-sm text-slate-300"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="h-8 w-8 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
                      Loading {selectedSpacecraft.name} 3D viewer...
                    </div>
                  }
                >
                  <SpacecraftViewer
                    spacecraft={selectedSpacecraft}
                    build={build}
                    onSelectSpacecraft={setSelectedSpacecraft}
                  />
                </Suspense>
                <div className="flex flex-col gap-4 rounded-[24px] border border-white/8 bg-slate-950/45 p-4">
                  <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-sky-200/80">
                      Spacecraft status
                    </h3>
                    <dl className="mt-4 space-y-3">
                      {[
                        ['Mass', `${buildStats.mass.toLocaleString()} kg`],
                        ['Power', `${buildStats.power.toLocaleString()} W`],
                        ['Delta-V', `${buildStats.deltaV.toFixed(1)} km/s`],
                        ['Communication', `${buildStats.communication}%`],
                        ['Reliability', `${buildStats.reliability}%`],
                        ['Resource efficiency', `${buildStats.resourceEfficiency}%`],
                        ['Science score', `${buildStats.science} pts`],
                        ['Mission cost', formatCurrency(buildStats.missionCost)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-2">
                          <dt className="text-xs text-slate-400">{label}</dt>
                          <dd className="text-right text-sm font-medium text-white">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-[10px] text-slate-500">
                      Power load: {buildStats.powerDemand.toLocaleString()} W
                    </p>
                  </div>
                  <div className="border-t border-white/8 pt-3">
                    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Design checks
                    </h4>
                    <ul className="space-y-2">
                      {warnings.map((warning) => (
                        <li
                          key={warning.label}
                          className={`flex items-center gap-2 text-xs ${
                            warning.ok ? 'text-emerald-200' : 'text-amber-200'
                          }`}
                        >
                          <span aria-hidden="true">{warning.ok ? '✓' : '⚠'}</span>
                          {warning.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>

            <SolarSystemPlanner
              mode={gameMode ?? 'mission'}
              planningOnly={isAsteroidPlanningExercise}
              planningOnlyTitle={selectedCampaignMission.eventProvenance?.title ?? selectedCampaignMission.title}
              planningOnlySourceUrl={
                selectedCampaignMission.eventProvenance?.sourceUrl ?? selectedCampaignMission.briefing.sourceUrl
              }
              planningOnlyIsLiveEvent={selectedCampaignMission.eventProvenance?.provider === 'jpl'}
              launchDate={launchDate}
              onLaunchDateChange={updateLaunchDate}
              positions={plannerPositions}
              loading={plannerLoading}
              errors={plannerErrors}
              selectedBodyId={selectedPlannerBodyId}
              selectedDestinationId={selectedDestinationId}
              onSelectBody={setSelectedPlannerBodyId}
              onSetDestination={(destinationId) => {
                setSelectedDestinationId(destinationId)
                const body = getPlanetaryBodyForDestination(destinationId)
                if (body) setSelectedPlannerBodyId(body.id)
                setTestedDesign(null)
              }}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-white/8 bg-slate-900/75 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
                  {gameMode === 'freeplay' ? 'Design profile score' : 'Mission readiness'}
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-semibold text-white">{Math.round(metrics.missionReadiness)}</span>
                  <span className="pb-1 text-xs text-slate-400">/ 100</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400"
                    style={{ width: `${metrics.missionReadiness}%` }}
                  />
                </div>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-slate-900/75 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Power margin</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-semibold text-white">{Math.round(metrics.powerMargin)}</span>
                  <span className="pb-1 text-xs text-slate-400">%</span>
                </div>
                <p className="mt-3 text-xs text-slate-400">Sustained operation reserves remain healthy.</p>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-slate-900/75 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{isAsteroidPlanningExercise ? 'Asteroid transfer time' : 'Transfer time'}</p>
                {isAsteroidPlanningExercise ? (
                  <div className="mt-3">
                    <p className="text-xl font-semibold text-white">Not calculated</p>
                    <p className="mt-3 text-xs text-slate-400">This JPL close-approach exercise has no asteroid orbit, intercept, or launch-window simulation.</p>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-semibold text-white">{metrics.transferTime}</span>
                      <span className="pb-1 text-xs text-slate-400">months</span>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">
                      Simplified game estimate only; not a JPL trajectory or launch window.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <section className="min-w-0 rounded-[24px] border border-white/8 bg-slate-900/75 p-4">
                {gameMode === 'freeplay' ? (
                  <div className="flex h-full min-h-52 flex-col justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">Freeplay engineering readout</p>
                      <h3 className="mt-1 text-base font-medium text-white">No campaign objectives applied</h3>
                      <p className="mt-3 text-xs leading-relaxed text-slate-400">
                        Use the live telemetry and warnings to explore your design. Mission requirements and campaign progression do not restrict freeplay launches.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                      Live validation
                    </p>
                    <h3 className="mt-1 text-base font-medium text-white">Mission requirements</h3>
                  </div>
                  <span className="shrink-0 rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[10px] font-medium text-sky-100">
                    {metRequirements}/{missionRequirements.length} passed
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[390px] border-collapse text-left text-xs">
                    <caption className="sr-only">
                      Current spacecraft measurements compared with mission requirements
                    </caption>
                    <thead>
                      <tr className="border-b border-white/10 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        <th scope="col" className="py-2 pr-2 font-medium">System</th>
                        <th scope="col" className="py-2 px-2 text-right font-medium">Current</th>
                        <th scope="col" className="py-2 px-2 text-right font-medium">Required</th>
                        <th scope="col" className="py-2 pl-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missionRequirements.map((requirement) => (
                        <tr key={requirement.id} className="border-b border-white/5 last:border-0">
                          <th scope="row" className="py-2.5 pr-2 font-medium text-slate-200">
                            {requirement.label}
                          </th>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-300">
                            {requirement.displayActual}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-400">
                            {requirement.displayTarget}
                          </td>
                          <td
                            className={`whitespace-nowrap py-2.5 pl-2 text-right font-medium ${
                              requirement.passed ? 'text-emerald-200' : 'text-rose-200'
                            }`}
                          >
                            {requirement.passed ? 'PASS' : 'REVIEW'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                  </>
                )}
              </section>

              <section className="min-w-0 rounded-[24px] border border-white/8 bg-slate-900/75 p-4">
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                    Cost control · USD millions
                  </p>
                  <h3 className="mt-1 text-base font-medium text-white">
                    {gameMode === 'freeplay' ? 'Optional spending target' : 'Mission budget ledger'}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-left text-xs">
                    <caption className="sr-only">
                      Existing mission costs, launch cost, total, and remaining mission budget
                    </caption>
                    <thead>
                      <tr className="border-b border-white/10 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        <th scope="col" className="py-2 pr-3 font-medium">Cost item</th>
                        <th scope="col" className="py-2 pl-3 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [gameMode === 'freeplay' ? 'Spacecraft & systems' : 'Spacecraft & mission', formatCurrency(buildStats.missionCost)],
                        [
                          `Launch · ${selectedLaunchVehicle?.name ?? 'not selected'}`,
                          selectedLaunchVehicle
                            ? formatCurrency(selectedLaunchVehicle.launchCostMillions)
                            : '—',
                        ],
                        ['Total mission cost', formatCurrency(metrics.totalCost)],
                        [gameMode === 'freeplay' ? 'Configured target' : 'Mission budget limit', formatCurrency(missionBudgetLimitMillions)],
                        [gameMode === 'freeplay' ? 'Target remaining' : 'Budget remaining', formatCurrency(remainingMissionBudget)],
                      ].map(([label, amount], index) => (
                        <tr
                          key={label}
                          className={`border-b border-white/5 last:border-0 ${
                            index === 2 ? 'font-semibold text-white' : ''
                          }`}
                        >
                          <th scope="row" className="py-2.5 pr-3 text-left font-medium text-slate-200">
                            {label}
                          </th>
                          <td
                            className={`whitespace-nowrap py-2.5 pl-3 text-right tabular-nums ${
                              index === 4 && remainingMissionBudget < 0
                                ? 'font-semibold text-rose-200'
                                : 'text-slate-300'
                            }`}
                          >
                            {amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {remainingMissionBudget < 0 && (
                  <p className="mt-3 text-xs font-medium text-rose-200" role="status">
                    Mission budget exceeded by {formatCurrency(Math.abs(remainingMissionBudget))}.
                  </p>
                )}
              </section>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <section className="min-w-0 rounded-[24px] border border-white/8 bg-slate-900/75 p-4 lg:col-span-2">
                <h3 className="mb-3 text-base font-medium text-white">
                  {gameMode === 'freeplay' ? 'Configuration review' : 'Flight review checklist'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                    <caption className="sr-only">Current flight review checklist</caption>
                    <thead>
                      <tr className="border-b border-white/10 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        <th scope="col" className="py-2 pr-3 font-medium">Check</th>
                        <th scope="col" className="py-2 px-3 font-medium">Flight review item</th>
                        <th scope="col" className="py-2 pl-3 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missionChecklist.map((item, index) => (
                        <tr key={item} className="border-b border-white/5 last:border-0">
                          <th scope="row" className="py-2.5 pr-3 font-medium text-slate-400">
                            {String(index + 1).padStart(2, '0')}
                          </th>
                          <td className="px-3 py-2.5 text-slate-200">{item}</td>
                          <td className="whitespace-nowrap py-2.5 pl-3 text-right font-medium text-emerald-200">
                            READY
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <MissionDataTable
                title="Spacecraft build configuration"
                rows={[
                  {
                    label: 'Solar panel',
                    value: build.components.includes('solarPanel')
                      ? `${solarPanelOptions[build.solarPanelSize].label} · ${solarPanelOptions[build.solarPanelSize].power.toLocaleString()} W`
                      : 'Not installed',
                  },
                  {
                    label: 'Antenna',
                    value: build.components.includes('antenna')
                      ? antennaOptions[build.antennaType].label
                      : 'Not installed',
                  },
                  {
                    label: 'Engine',
                    value: build.components.includes('engine')
                      ? engineOptions[build.engineType].label
                      : 'Not installed',
                  },
                  {
                    label: 'Science instrument',
                    value: build.components.includes('instrument')
                      ? `${instrumentOptions[build.instrumentType].label} ×${build.instrumentCount}`
                      : 'Not installed',
                  },
                  { label: 'Science payload', value: `${payload.toLocaleString()} kg` },
                  { label: 'Propellant', value: `${fuel.toLocaleString()} kg` },
                  { label: 'Risk tolerance', value: `${riskTolerance}%` },
                ]}
              />
              <div className="rounded-[28px] border border-white/8 bg-slate-900/70 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                <h3 className="mb-4 text-lg font-medium text-white">Trajectory tuning</h3>
                <div className="space-y-5">
                  <label className="block">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-200">
                      <span>Payload mass</span>
                      <span className="text-sky-200">{payload.toLocaleString()} kg</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="1500"
                      step="50"
                      value={payload}
                      onChange={(event) => setPayload(Number(event.target.value))}
                      className="slider"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-200">
                      <span>Propellant</span>
                      <span className="text-orange-200">{fuel.toLocaleString()} kg</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5000"
                      step="50"
                      value={fuel}
                      onChange={(event) => setFuel(Number(event.target.value))}
                      className="slider"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-200">
                      <span>Mission budget</span>
                      <span className="text-emerald-200">{budget} B</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="12"
                      value={budget}
                      onChange={(event) => setBudget(Number(event.target.value))}
                      className="slider"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-200">
                      <span>Risk tolerance</span>
                      <span className="text-orange-200">{riskTolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={riskTolerance}
                      onChange={(event) => setRiskTolerance(Number(event.target.value))}
                      className="slider"
                    />
                  </label>
                </div>
              </div>
            </div>
              </>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-[28px] border border-sky-400/15 bg-slate-900/75 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.45)]">
              <div className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-sky-300/80">
                  {gameMode === 'freeplay' ? 'Freeplay controls' : 'Mission selection'}
                </p>
                <h2 className="mt-1 text-lg font-medium text-white">
                  {gameMode === 'freeplay' ? 'Experiment freely' : 'Choose your objective'}
                </h2>
              </div>
              {gameMode === 'freeplay' ? (
                <div>
                  <p className="text-sm leading-relaxed text-slate-300">
                    Select any available spacecraft, tune its systems, pick a destination, and attempt a launch. Engineering warnings are advisory; no mission checklist is required.
                  </p>
                  <label htmlFor="freeplay-objective" className="mt-5 block text-xs font-medium text-slate-200">
                    Optional reference objective
                  </label>
                  <select
                    id="freeplay-objective"
                    value={selectedMissionId}
                    onChange={(event) => {
                      const mission = missionGoals.find((item) => item.id === event.target.value)
                      if (!mission) return
                      setSelectedMissionId(mission.id)
                      setSelectedDestinationId(mission.destinationId)
                      setSelectedPlannerBodyId(
                        getPlanetaryBodyForDestination(mission.destinationId)?.id ?? 'earth',
                      )
                    }}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-slate-100 outline-none focus:border-violet-300/60"
                  >
                    {missionGoals.map((mission) => (
                      <option key={mission.id} value={mission.id}>
                        {mission.name} · optional
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setLaunchScreen('selection')}
                    className="mt-5 w-full rounded-xl bg-violet-300 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-violet-200"
                  >
                    Choose Launch Vehicle
                  </button>
                </div>
              ) : (
                <>
              <div className="border-t border-white/8 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">
                      {selectedCampaignMission.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {selectedCampaignMission.objective}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-xs font-semibold text-sky-100">
                    {missionReadiness}%
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${missionPassed ? 'bg-emerald-400' : 'bg-sky-400'}`}
                    style={{ width: `${missionReadiness}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">
                  {metRequirements} / {missionRequirements.length} requirements met
                </p>
                <button
                  type="button"
                  onClick={() => setEntryScreen('briefing')}
                  className="mt-3 w-full rounded-lg border border-sky-300/20 bg-sky-300/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:bg-sky-300/10"
                >
                  Review Mission Briefing
                </button>
              </div>

              <div className="mt-4">
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Mission requirements
                </h4>
                <ul className="space-y-2">
                  {missionRequirements.map((requirement) => (
                    <li
                      key={requirement.id}
                      className={`grid grid-cols-[16px_minmax(0,1fr)_auto] items-baseline gap-1.5 text-xs ${
                        requirement.passed ? 'text-emerald-100' : 'text-rose-200'
                      }`}
                    >
                      <span aria-hidden="true">{requirement.passed ? '✓' : '✗'}</span>
                      <span>{requirement.label}</span>
                      <span className="text-right tabular-nums">
                        {requirement.displayActual} / {requirement.displayTarget}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => setTestedDesign(designSignature)}
                className="mt-5 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/20"
              >
                Test Mission
              </button>

              {hasTestedCurrentDesign && (
                <div
                  className={`mt-3 rounded-xl border p-3 ${
                    missionPassed
                      ? 'border-emerald-300/25 bg-emerald-300/5'
                      : 'border-rose-300/20 bg-rose-300/5'
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {missionPassed ? (
                    <>
                      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
                        Mission ready
                      </h4>
                      <p className="mt-1 text-xs text-slate-200">
                        Your spacecraft meets all mission requirements. Continue to choose a launch vehicle.
                      </p>
                      <button
                        type="button"
                        onClick={() => setLaunchScreen('selection')}
                        className="mt-3 w-full rounded-lg bg-emerald-300 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-emerald-200"
                      >
                        {selectedLaunchVehicle ? 'Review Launch Vehicle' : 'Check Launch Vehicles'}
                      </button>
                    </>
                  ) : (
                    <>
                      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">
                        Mission not ready
                      </h4>
                      <p className="mt-2 text-[10px] text-slate-300">Problems detected:</p>
                      <ul className="mt-1 space-y-1 text-xs text-slate-200">
                        {missionRequirements
                          .filter((requirement) => !requirement.passed)
                          .map((requirement) => (
                            <li key={requirement.id}>• {requirement.problem}</li>
                          ))}
                      </ul>
                      <p className="mt-2 text-[10px] text-slate-400">
                        Modify your spacecraft and try again.
                      </p>
                      {canReviewLaunchVehicles && (
                        <button
                          type="button"
                          onClick={() => setLaunchScreen('selection')}
                          className="mt-3 w-full rounded-lg border border-sky-300/25 bg-sky-300/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:bg-sky-300/20"
                        >
                          {selectedLaunchVehicle ? 'Review Launch Vehicle' : 'Select Launch Vehicle'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
                </>
              )}
            </section>

            <MissionDataTable
              title="Spacecraft profile"
              rows={[
                { label: 'Spacecraft', value: selectedSpacecraft.name },
                { label: 'Mission type', value: selectedSpacecraft.type },
                { label: 'Category', value: selectedSpacecraft.missionCategory ?? 'Mission preset' },
                { label: 'Mission status', value: selectedSpacecraft.missionStatus ?? 'Mission profile' },
                { label: 'Agency', value: selectedSpacecraft.agency },
                ...(selectedSpacecraft.crewCapacity
                  ? [{ label: 'Crew capacity', value: `${selectedSpacecraft.crewCapacity} people` }]
                  : []),
                { label: 'Base mass', value: `${selectedSpacecraft.mass.toLocaleString()} kg` },
                ...(selectedSpacecraft.powerSystem
                  ? [{ label: 'Power system', value: selectedSpacecraft.powerSystem }]
                  : []),
                ...(selectedSpacecraft.propulsionSystem
                  ? [{ label: 'Propulsion', value: selectedSpacecraft.propulsionSystem }]
                  : []),
                ...(selectedSpacecraft.instruments?.length
                  ? [{ label: 'Equipment', value: selectedSpacecraft.instruments.join(', ') }]
                  : []),
                { label: '3D asset', value: `${selectedSpacecraft.model.format.toUpperCase()} mission model` },
                { label: 'Model file', value: selectedSpacecraft.model.modelPath },
                ...(selectedSpacecraft.assetAttribution
                  ? [{ label: 'Model attribution', value: selectedSpacecraft.assetAttribution }]
                  : []),
                ...(selectedSpacecraft.assetUsageNotes
                  ? [{
                      label: 'Asset notes',
                      value: selectedSpacecraft.assetUsageNotes,
                      valueClassName: 'text-left leading-relaxed',
                    }]
                  : []),
                {
                  label: 'Mission purpose',
                  value: selectedSpacecraft.missionPurpose,
                  valueClassName: 'text-left leading-relaxed',
                },
                ...(selectedSpacecraft.gameplayNote
                  ? [{
                      label: 'Simulation scope',
                      value: selectedSpacecraft.gameplayNote,
                      valueClassName: 'text-left leading-relaxed',
                    }]
                  : []),
              ]}
            />
            <div className="flex flex-wrap gap-2">
              {selectedSpacecraft.missionSourceUrl && (
                <a
                  href={selectedSpacecraft.missionSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-sky-300/15 bg-sky-300/[.04] px-4 py-3 text-xs text-sky-200 underline decoration-sky-200/30 underline-offset-4"
                >
                  Official mission reference
                </a>
              )}
              <a
                href={selectedSpacecraft.model.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-sky-300/15 bg-sky-300/[.04] px-4 py-3 text-xs text-sky-200 underline decoration-sky-200/30 underline-offset-4"
              >
                3D asset source
              </a>
            </div>
            <MissionDataTable
              title={gameMode === 'freeplay' ? 'Freeplay summary' : 'Mission summary'}
              rows={[
                { label: gameMode === 'freeplay' ? 'Mode' : 'Objective', value: gameMode === 'freeplay' ? 'Open sandbox' : selectedMission.name },
                { label: 'Destination', value: selectedDestination.label },
                { label: 'Distance', value: selectedDestination.distance },
                { label: 'Environment', value: selectedDestination.environment },
                { label: 'Propulsion', value: selectedPropulsion.label },
                { label: 'Launch vehicle', value: selectedLaunchVehicle?.name ?? 'Not selected' },
              ]}
            />
            <MissionDataTable
              title={gameMode === 'freeplay' ? 'Engineering telemetry' : 'Mission performance'}
              rows={[
                {
                  label: gameMode === 'freeplay' ? 'Campaign requirements' : 'Readiness',
                  value: gameMode === 'freeplay'
                    ? 'Not applied'
                    : `${missionReadiness}% · ${metRequirements}/${missionRequirements.length} requirements`,
                },
                { label: 'Launch mass', value: `${buildStats.mass.toLocaleString()} kg` },
                { label: 'Power / load', value: `${buildStats.power.toLocaleString()} / ${buildStats.powerDemand.toLocaleString()} W` },
                { label: 'Delta-V', value: `${buildStats.deltaV.toFixed(1)} km/s` },
                { label: 'Communications', value: `${buildStats.communication}%` },
                { label: 'Reliability', value: `${buildStats.reliability}%` },
                { label: 'Mission risk', value: `${Math.round(metrics.missionRisk)} / 100` },
                { label: 'Transit duration', value: isAsteroidPlanningExercise ? 'Not calculated · no small-body orbit modeled' : `${metrics.transferTime} months · ${selectedDestination.transfer}` },
              ]}
            />
            <MissionDataTable
              title={`Sustainability · ${sustainability.level}`}
              rows={[
                { label: 'Reusability', value: `${sustainability.reusability}%` },
                { label: 'Repairability', value: `${sustainability.repairability}%` },
                { label: 'Resource efficiency', value: `${sustainability.resourceEfficiency}%` },
                { label: 'End-of-life planning', value: `${sustainability.endOfLifePlanning}%` },
                {
                  label: 'Assessment',
                  value: sustainability.explanation,
                  valueClassName: 'text-left leading-relaxed',
                },
              ]}
            />
          </aside>
        </main>
      </div>
      {missionControlChat}
    </div>
  )
}

export default App
