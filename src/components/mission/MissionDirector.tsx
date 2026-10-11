import { Bounds, Float, Stars, useGLTF, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Component, Suspense, useState, type ErrorInfo, type ReactNode } from 'react'
import type { MissionBriefing } from '../../data/missionBriefing'

interface MissionDirectorProps {
  briefing: MissionBriefing
  onStart: () => void
}

interface AvatarProps {
  path: string
}

function AstronautAvatar({ path }: AvatarProps) {
  const { scene } = useGLTF(path)

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

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unable to render the NASA mission director model.', error, info.componentStack)
    this.props.onFailure?.()
  }

  render() {
    if (this.state.failed) {
      if (this.props.inCanvas) return null

      return (
        <div
          className="flex h-full min-h-72 flex-col items-center justify-center gap-3 px-6 text-center"
          role="status"
        >
          <span className="text-4xl" aria-hidden="true">◌</span>
          <p className="text-sm font-medium text-white">Mission director model unavailable</p>
          <a
            className="text-xs text-sky-200 underline underline-offset-4"
            href={this.props.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            View the official NASA model
          </a>
        </div>
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

export function MissionDirector({ briefing, onStart }: MissionDirectorProps) {
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
              Amplify Vision · Mission briefing
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
            <AvatarErrorBoundary key={briefing.avatarPath} sourceUrl={briefing.sourceUrl}>
              <Canvas
                camera={{ position: [0, 0, 4], fov: 30 }}
                dpr={[1, 1.5]}
                gl={{ antialias: true, alpha: true }}
                fallback={
                  <div className="flex h-full min-h-72 items-center justify-center px-6 text-center text-sm text-slate-300">
                    3D astronaut viewer is not supported in this browser.
                  </div>
                }
              >
                <ambientLight intensity={2} />
                <directionalLight position={[3, 5, 4]} intensity={3.2} />
                <pointLight position={[-3, 1, 2]} intensity={18} color="#67e8f9" />
                <Stars radius={35} depth={24} count={260} factor={2.2} fade speed={0.25} />
                <AvatarErrorBoundary
                  sourceUrl={briefing.sourceUrl}
                  onFailure={() => setAvatarFailed(true)}
                  inCanvas
                >
                  <Suspense fallback={null}>
                    <AstronautAvatar path={briefing.avatarPath} />
                  </Suspense>
                </AvatarErrorBoundary>
              </Canvas>
            </AvatarErrorBoundary>
            <AvatarLoadStatus />
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-emerald-300/20 bg-slate-950/70 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-100 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              </span>
              Live comms
            </div>
            {avatarFailed && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/70 px-6 text-center" role="status">
                <p className="text-sm font-medium text-white">Mission director model unavailable</p>
                <a
                  className="text-xs text-sky-200 underline underline-offset-4"
                  href={briefing.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View the official NASA model
                </a>
              </div>
            )}
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
              <ul className="mt-4 space-y-3">
                {briefing.objectives.map((objective) => (
                  <li key={objective} className="flex items-start gap-3 text-sm text-slate-200">
                    <span className="mt-0.5 text-sky-300" aria-hidden="true">▸</span>
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={onStart}
                className="w-full rounded-2xl bg-sky-300 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 shadow-[0_0_32px_rgba(56,189,248,0.22)] transition hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                Start Mission
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
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
