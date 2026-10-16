import { Bounds, Float, Stars, useGLTF, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Component, Suspense, useState, type ReactNode } from 'react'
import type { MissionBriefing } from '../../data/missionBriefing'
import type { MissionGoal } from '../../data/missionGoals'
import { NasaMissionImagery } from './NasaMissionImagery'

interface MissionDirectorProps {
  briefing: MissionBriefing
  missionGoal: MissionGoal
  onStart: () => void
  onBack?: () => void
  startLabel?: string
  backLabel?: string
}

interface AvatarProps {
  path: string
}

function AstronautAvatar({ path }: AvatarProps) {
  const { scene } = useGLTF(path, `${import.meta.env.BASE_URL}draco/`)

  return (
    <Bounds fit clip margin={0.95}>
      <Float
        speed={0.8}
        floatIntensity={0.045}
        rotationIntensity={0.015}
        floatingRange={[-0.025, 0.025]}
      >
        <group rotation={[0, Math.PI / 2, 0]}>
          <primitive object={scene} />
        </group>
      </Float>
    </Bounds>
  )
}

function AvatarFallback({ sourceUrl, message }: { sourceUrl: string; message: string }) {
  return (
    <div
      className="flex h-full min-h-72 flex-col items-center justify-center gap-4 px-6 text-center"
      role="status"
    >
      <svg
        aria-hidden="true"
        className="h-40 w-40 drop-shadow-[0_0_32px_rgba(56,189,248,0.2)]"
        viewBox="0 0 160 180"
        fill="none"
      >
        <path d="M80 15c-35 0-58 25-58 64v70h116V79c0-39-23-64-58-64Z" fill="#cbd5e1" />
        <path d="M80 15c35 0 58 25 58 64v70H80V15Z" fill="#94a3b8" />
        <path d="M37 73c0-26 18-42 43-42s43 16 43 42v14H37V73Z" fill="#082f49" stroke="#38bdf8" strokeWidth="5" />
        <path d="M42 75c0-21 15-34 38-34v44H42v-10Z" fill="#0e7490" fillOpacity=".7" />
        <path d="M80 100h39v10H80z" fill="#64748b" />
        <path d="m61 149 8-26h22l8 26H61Z" fill="#e2e8f0" />
        <path d="M80 123h11l8 26H80v-26Z" fill="#94a3b8" />
        <path d="m37 103-17 18 13 8 16-17m74-9 17 18-13 8-16-17" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M68 125h24" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
        <circle cx="80" cy="105" r="5" fill="#38bdf8" />
      </svg>
      <div>
        <p className="text-sm font-medium text-white">{message}</p>
        <a
          className="mt-2 inline-block text-xs text-sky-200 underline underline-offset-4"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          View the official NASA model
        </a>
      </div>
    </div>
  )
}

interface AvatarErrorBoundaryProps {
  children: ReactNode
  sourceUrl: string
  onFailure?: () => void
  inCanvas?: boolean
}

interface AvatarErrorBoundaryState {
  failed: boolean
}

class AvatarErrorBoundary extends Component<
  AvatarErrorBoundaryProps,
  AvatarErrorBoundaryState
> {
  state: AvatarErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AvatarErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.warn('NASA mission director model unavailable; using the static portrait.', error.message)
    this.props.onFailure?.()
  }

  render() {
    if (this.state.failed) {
      if (this.props.inCanvas) return null

      return (
        <AvatarFallback
          sourceUrl={this.props.sourceUrl}
          message="3D model unavailable. Showing the mission director portrait."
        />
      )
    }

    return this.props.children
  }
}

function AvatarLoadStatus() {
  const { active } = useProgress()

  if (!active) return null

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-48 flex-col items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/85 p-4 text-center text-xs text-slate-200 backdrop-blur">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
        Loading mission director...
      </div>
    </div>
  )
}

export function MissionDirector({
  briefing,
  missionGoal,
  onStart,
  onBack,
  startLabel = 'Start Mission',
  backLabel = 'Back to mission selection',
}: MissionDirectorProps) {
  const [avatarFailed, setAvatarFailed] = useState(false)

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#020912] px-4 py-10 text-slate-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_18%_40%,rgba(14,116,144,0.2),transparent_40%),radial-gradient(ellipse_at_82%_70%,rgba(30,64,175,0.16),transparent_42%)]" />
      <section
        aria-labelledby="briefing-title"
        className="w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/75 shadow-[0_25px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5 sm:px-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-sky-300">
              Amplify Vision · Level {briefing.level} Mission Briefing
            </p>
            <h1 id="briefing-title" className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {briefing.title}
            </h1>
          </div>
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-100">
            {briefing.difficulty}
          </span>
        </header>

        <div className="grid md:grid-cols-[minmax(230px,0.8fr)_1.2fr]">
          <div className="relative min-h-[320px] overflow-hidden border-b border-white/8 bg-[#06111e] md:min-h-[540px] md:border-b-0 md:border-r">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,rgba(56,189,248,0.17),transparent_58%)]" />
            {!avatarFailed ? (
              <AvatarErrorBoundary
                key={briefing.avatarPath}
                sourceUrl={briefing.sourceUrl}
                onFailure={() => setAvatarFailed(true)}
              >
                <Canvas
                  camera={{ position: [0, 0, 4], fov: 30 }}
                  dpr={[1, 1.5]}
                  gl={{ antialias: true, alpha: true }}
                >
                  <ambientLight intensity={2} />
                  <directionalLight position={[3, 5, 4]} intensity={3.2} />
                  <pointLight position={[-3, 1, 2]} intensity={18} color="#67e8f9" />
                  <Stars radius={35} depth={24} count={260} factor={2.2} fade speed={0.25} />
                  <Suspense fallback={null}>
                    <AstronautAvatar path={briefing.avatarPath} />
                  </Suspense>
                </Canvas>
                <AvatarLoadStatus />
              </AvatarErrorBoundary>
            ) : (
              <AvatarFallback
                sourceUrl={briefing.sourceUrl}
                message="3D model unavailable. Showing the mission director portrait."
              />
            )}
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-emerald-300/20 bg-slate-950/70 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-100 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              </span>
              Live comms
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-center justify-center gap-2">
              <span className="h-px w-7 bg-sky-300/40" />
              <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-300">
                Mission Control · Flight Director
              </p>
              <span className="h-px w-7 bg-sky-300/40" />
            </div>
          </div>

          <div className="flex flex-col p-6 sm:p-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-200/75">
              Mission Director
            </p>
            <div className="mt-3 space-y-3">
              {briefing.dialogueStages.map((dialogue, index) => (
                <blockquote
                  key={`${briefing.id}-dialogue-${index}`}
                  className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 text-sm leading-relaxed text-slate-200"
                >
                  “{dialogue}”
                </blockquote>
              ))}
            </div>

            <section className="mt-6 rounded-2xl border border-sky-300/15 bg-sky-300/5 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300">
                Mission: {briefing.missionName}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">{briefing.scenario}</p>
              <dl className="mt-4 grid gap-2 rounded-xl border border-white/8 bg-slate-950/35 p-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Budget limit</dt>
                  <dd className="mt-1 text-slate-100">
                    {missionGoal.requirements.maxBudget === undefined
                      ? 'No fixed mission cap'
                      : `$${missionGoal.requirements.maxBudget.toLocaleString()}M`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Mass constraint</dt>
                  <dd className="mt-1 text-slate-100">
                    {missionGoal.requirements.maxMass === undefined
                      ? 'Set by the selected launch vehicle'
                      : `${missionGoal.requirements.maxMass.toLocaleString()} kg`}
                  </dd>
                </div>
              </dl>
              <ul className="mt-4 space-y-3">
                {briefing.objectives.map((objective) => (
                  <li key={objective} className="flex items-start gap-3 text-sm text-slate-200">
                    <span className="mt-0.5 text-sky-300" aria-hidden="true">▸</span>
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
              <NasaMissionImagery query={briefing.nasaImageQuery} />
            </section>

            <div className="mt-auto pt-6">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="mb-3 w-full rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:border-white/25 hover:text-white"
                >
                  {backLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onStart}
                className="w-full rounded-2xl bg-sky-300 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 shadow-[0_0_32px_rgba(56,189,248,0.22)] transition hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                {startLabel}
              </button>
              <p className="mt-3 text-center text-[10px] text-slate-500">
                Character model: <a
                  href={briefing.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-300 underline decoration-slate-500 underline-offset-2 hover:text-white"
                >
                  {briefing.sourceLabel}
                </a>
                <span className="mt-1 block">
                  Mission imagery: <a
                    href="https://images.nasa.gov/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-300 underline decoration-slate-500 underline-offset-2 hover:text-white"
                  >
                    NASA Images and Video Library
                  </a>
                  {' · '}
                  <a
                    href="https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-300 underline decoration-slate-500 underline-offset-2 hover:text-white"
                  >
                    API documentation
                  </a>
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
