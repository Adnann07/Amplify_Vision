import type { LaunchRecord, LaunchVehicleSpec } from '../../data/launchVehicles'
import { assessLaunchOutcome } from '../../data/launchOutcome'
import { lazy, Suspense, useCallback, useState } from 'react'
import type { MissionRequirementResult } from '../../data/missionGoals'

const LaunchSequence = lazy(() =>
  import('./LaunchSequence').then((module) => ({ default: module.LaunchSequence })),
)

interface LaunchVehicleSelectionProps {
  vehicles: LaunchVehicleSpec[]
  selectedVehicleId: string | null
  onSelectVehicle: (vehicleId: string) => void
  onReturnToBuilder: () => void
  onLaunch: (vehicle: LaunchVehicleSpec) => void
  spacecraftName: string
  spacecraftMassKg: number
  existingMissionCostMillions: number
  missionBudgetMillions: number
  missionBudgetLimitMillions: number
  designTested: boolean
  missionRequirements: MissionRequirementResult[]
  spacecraftReliability: number
}

interface LaunchResultsProps {
  record: LaunchRecord
  onRetry: (vehicle: LaunchVehicleSpec) => void
  onReturnToBuilder: () => void
  onChangeLaunchVehicle: () => void
}

function formatCurrency(value: number) {
  return value < 0 ? `-$${Math.abs(value).toLocaleString()}M` : `$${value.toLocaleString()}M`
}

function RocketVisual({ vehicle }: { vehicle: LaunchVehicleSpec }) {
  return (
    <svg
      aria-hidden="true"
      className="mx-auto"
      width="82"
      height={vehicle.visualHeight}
      viewBox="0 0 82 150"
      fill="none"
      role="img"
    >
      <path d="M41 8C28 24 24 42 24 69v40h34V69C58 42 54 24 41 8Z" fill="#e2e8f0" />
      <path d="M41 8C35 24 34 43 34 69v40h24V69C58 42 54 24 41 8Z" fill="#94a3b8" />
      <path d="M24 70h34v11H24z" fill={vehicle.accent} />
      <path d="M24 86 8 111h16V86Zm34 0 16 25H58V86Z" fill={vehicle.accent} />
      <path d="M33 109h16v17H33z" fill="#64748b" />
      <path d="M36 126h10l-5 19-5-19Z" fill={vehicle.accent} />
      <circle cx="41" cy="50" r="7" fill="#082f49" stroke={vehicle.accent} strokeWidth="3" />
      <path d="M34 28h14" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <path d="M35 35h12" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function LaunchVehicleSelection({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  onReturnToBuilder,
  onLaunch,
  spacecraftName,
  spacecraftMassKg,
  existingMissionCostMillions,
  missionBudgetMillions,
  missionBudgetLimitMillions,
  designTested,
  missionRequirements,
  spacecraftReliability,
}: LaunchVehicleSelectionProps) {
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
  const selectedVehicleFits =
    selectedVehicle !== null && spacecraftMassKg <= selectedVehicle.payloadCapacityKg
  const selectedTotalCost =
    existingMissionCostMillions + (selectedVehicle?.launchCostMillions ?? 0)
  const selectedVehicleAffordable =
    selectedVehicle !== null && selectedTotalCost <= missionBudgetLimitMillions
  const canLaunch = designTested && selectedVehicle !== null
  const requirementsReady = missionRequirements
    .filter((requirement) => requirement.id !== 'maxBudget')
    .every((requirement) => requirement.passed)
  const missionAtRisk = !requirementsReady || !selectedVehicleAffordable
  const risk = selectedVehicle
    ? assessLaunchOutcome(spacecraftMassKg, spacecraftReliability, selectedVehicle)
    : null

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-sky-300/15 bg-slate-900/80 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.45)] sm:p-7">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-300/80">
              Launch configuration
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              SELECT LAUNCH VEHICLE
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Choose a launcher for {spacecraftName}. Values are simplified game-balancing figures,
              not real-world rocket specifications.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Current launch mass</p>
            <p className="mt-1 font-semibold text-white">{spacecraftMassKg.toLocaleString()} kg</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {vehicles.map((vehicle) => {
            const remainingCapacityKg = vehicle.payloadCapacityKg - spacecraftMassKg
            const fits = remainingCapacityKg >= 0
            const totalCostMillions = existingMissionCostMillions + vehicle.launchCostMillions
            const remainingBudgetMillions = missionBudgetLimitMillions - totalCostMillions
            const affordable = remainingBudgetMillions >= 0
            const selected = vehicle.id === selectedVehicleId

            return (
              <button
                key={vehicle.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectVehicle(vehicle.id)}
                className={`relative flex min-h-[370px] flex-col rounded-[24px] border p-4 text-left transition ${
                  selected
                    ? 'border-sky-300/60 bg-sky-400/[0.08] shadow-[0_0_30px_rgba(56,189,248,0.12)]'
                    : 'border-white/10 bg-slate-950/35 hover:border-white/25 hover:bg-slate-950/60'
                }`}
              >
                <div className="flex min-h-[160px] items-center justify-center rounded-2xl bg-slate-950/50">
                  <RocketVisual vehicle={vehicle} />
                </div>
                <div className="mt-4 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{vehicle.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Payload capacity: {vehicle.payloadCapacityKg.toLocaleString()} kg
                    </p>
                  </div>
                  {selected && (
                    <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-sky-100">
                      Selected
                    </span>
                  )}
                </div>

                <dl className="mt-4 space-y-2 border-t border-white/8 pt-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Launch cost</dt>
                    <dd className="font-medium text-white">{formatCurrency(vehicle.launchCostMillions)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Available payload</dt>
                    <dd className={fits ? 'font-medium text-emerald-200' : 'font-medium text-rose-200'}>
                      {fits
                        ? `${remainingCapacityKg.toLocaleString()} kg`
                        : `Exceeds by ${Math.abs(remainingCapacityKg).toLocaleString()} kg`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Total mission cost</dt>
                    <dd className="font-medium text-white">{formatCurrency(totalCostMillions)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Budget remaining</dt>
                    <dd className={affordable ? 'font-medium text-emerald-200' : 'font-medium text-rose-200'}>
                      {formatCurrency(remainingBudgetMillions)}
                    </dd>
                  </div>
                </dl>

                <p
                  className={`mt-auto pt-4 text-xs font-medium ${
                    fits ? 'text-emerald-200' : 'text-rose-200'
                  }`}
                >
                  {fits
                    ? 'Within payload capacity'
                    : `Payload overload: ${Math.abs(remainingCapacityKg).toLocaleString()} kg.`}
                </p>
                {fits && !affordable && (
                  <p className="mt-1 text-xs text-amber-200">Mission budget exceeded.</p>
                )}
              </button>
            )
          })}
        </div>

        <div
          className={`mt-5 rounded-2xl border p-4 ${
            canLaunch
              ? 'border-emerald-300/25 bg-emerald-300/5'
              : 'border-white/10 bg-slate-950/35'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-sm font-semibold ${canLaunch ? 'text-emerald-200' : 'text-slate-100'}`}>
                {!selectedVehicle
                  ? 'Select a launch vehicle.'
                  : !designTested
                    ? 'Test this design before reviewing launch risks.'
                    : 'Launch attempt available — review the risks first.'}
              </p>
              {selectedVehicle && (
                <p className="mt-1 text-xs text-slate-400">
                  {selectedVehicle.name} selected · Existing mission costs{' '}
                  {formatCurrency(existingMissionCostMillions)} + launch{' '}
                  {formatCurrency(selectedVehicle.launchCostMillions)} ={' '}
                  {formatCurrency(selectedTotalCost)} of {formatCurrency(missionBudgetLimitMillions)} available.
                </p>
              )}
              {!selectedVehicle && (
                <p className="mt-1 text-xs text-slate-400">
                  Mission budget available: {formatCurrency(missionBudgetLimitMillions)} of{' '}
                  {formatCurrency(missionBudgetMillions)} configured.
                </p>
              )}
              {selectedVehicle && risk && (
                <div className="mt-3 space-y-2 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs">
                  <p className="font-semibold uppercase tracking-[0.15em] text-amber-100">
                    Estimated launch risk: {risk.riskLevel}
                  </p>
                  {(!selectedVehicleFits || !selectedVehicleAffordable || !requirementsReady || spacecraftReliability < 60) && (
                    <div className="space-y-1 text-amber-100/90">
                      {!selectedVehicleFits && (
                        <p>Warning: spacecraft exceeds this rocket&apos;s payload capacity by {Math.abs(selectedVehicle.payloadCapacityKg - spacecraftMassKg).toLocaleString()} kg.</p>
                      )}
                      {!selectedVehicleAffordable && (
                        <p>Warning: mission budget will be exceeded by {formatCurrency(Math.abs(selectedTotalCost - missionBudgetLimitMillions))}.</p>
                      )}
                      {spacecraftReliability < 60 && (
                        <p>Warning: spacecraft reliability is {spacecraftReliability}%—below the 60% risk threshold.</p>
                      )}
                      {!requirementsReady && (
                        <div>
                          <p>Warning: unmet mission constraints may cause mission failure after launch:</p>
                          <ul className="mt-1 list-inside list-disc text-amber-100/75">
                            {missionRequirements.filter((requirement) => requirement.id !== 'maxBudget' && !requirement.passed).map((requirement) => (
                              <li key={requirement.id}>
                                {requirement.label}: {requirement.displayActual} / {requirement.displayTarget}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-slate-300">
                    {missionAtRisk
                      ? 'Mission constraints are at risk, but a launch can still be attempted. Launch outcome is based on payload and spacecraft reliability.'
                      : 'Mission constraints are on target. Launch risk is based on payload and spacecraft reliability; the exact outcome is not revealed before liftoff.'}
                  </p>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:w-48">
              <button
                type="button"
                disabled={!canLaunch}
                onClick={() => selectedVehicle && onLaunch(selectedVehicle)}
                className="rounded-xl bg-emerald-300 px-4 py-3 text-xs font-bold uppercase tracking-[0.15em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                Attempt Launch
              </button>
              <button
                type="button"
                onClick={onReturnToBuilder}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/5"
              >
                Return to Builder
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export function LaunchResults({
  record,
  onRetry,
  onReturnToBuilder,
  onChangeLaunchVehicle,
}: LaunchResultsProps) {
  const [sequenceComplete, setSequenceComplete] = useState(false)
  const completeSequence = useCallback(() => setSequenceComplete(true), [])
  const failed = record.outcome === 'failure'

  return (
    <section className={`rounded-[30px] border ${failed ? 'border-rose-300/20' : 'border-emerald-300/20'} bg-slate-900/80 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.45)] sm:p-8`}>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.3em] ${failed ? 'text-rose-200/80' : 'text-emerald-200/80'}`}>
        Launch results
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
        {sequenceComplete
          ? failed
            ? `LAUNCH FAILED — ${record.failureTitle}`
            : 'LAUNCH SUCCESSFUL'
          : 'Launch sequence in progress'}
      </h2>
      <p className="mt-2 text-sm text-slate-300">
        {record.missionName} · {record.destination} · {record.launchVehicle.name}
      </p>

      <div className="mt-6">
        <Suspense
          fallback={
            <div className="flex h-[480px] items-center justify-center rounded-2xl border border-sky-300/20 bg-slate-950/60 text-sm text-slate-300">
              <span className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
              Loading real-time launch simulator...
            </div>
          }
        >
          <LaunchSequence record={record} onComplete={completeSequence} />
        </Suspense>
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-500">
        Heavy launcher: NASA Space Launch System model by NASA/Alex Arredondo, optimized locally to a 1.5 MB GLB.
        {' '}
        Small and medium launchers use detailed built-in 3D vehicle assemblies.
        {' '}
        <a
          href="https://science.nasa.gov/3d-resources/space-launch-system-sls/"
          target="_blank"
          rel="noreferrer"
          className="text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-white"
        >
          NASA 3D model source
        </a>
        {' · '}
        <a
          href="https://www.nasa.gov/nasa-brand-center/images-and-media/"
          target="_blank"
          rel="noreferrer"
          className="text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-white"
        >
          NASA media use and attribution guidance
        </a>
        . Generic launcher classes use built-in 3D models.
      </p>
      {!sequenceComplete && (
        <p className="mt-3 text-center text-xs text-slate-400" role="status" aria-live="polite">
          Mission control is tracking the countdown and ascent...
        </p>
      )}

      {sequenceComplete && (
        <>
          {failed ? (
            <section className="mt-5 rounded-2xl border border-rose-300/25 bg-rose-300/5 p-4" aria-labelledby="failure-report-title">
              <h3 id="failure-report-title" className="text-sm font-bold uppercase tracking-[0.12em] text-rose-100">
                Failure report — {record.failureTitle}
              </h3>
              <p className="mt-2 text-sm text-slate-200">{record.failureCause}</p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  [record.failureParameter ?? 'Parameter', record.failureActual ?? '—'],
                  ['Expected requirement', record.failureExpected ?? '—'],
                  ['Launch vehicle', record.launchVehicle.name],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/8 bg-slate-950/35 p-3">
                    <dt className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{label}</dt>
                    <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-rose-100/90">
                {record.failureParameter === 'Spacecraft mass'
                  ? `Excess mass: ${Math.max(0, record.spacecraftMassKg - record.launchVehicle.payloadCapacityKg).toLocaleString()} kg`
                  : 'Reliability fell below the minimum recommended for a stable ascent.'}
              </p>
              <p className="mt-4 border-l-2 border-rose-300/50 pl-3 text-sm italic leading-relaxed text-slate-200">
                Mission Commander: “{record.commanderMessage}”
              </p>
              <p className="mt-3 text-sm font-semibold text-amber-100">
                Suggested change: {record.suggestedChange}
              </p>
            </section>
          ) : (
            <section className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-emerald-100">
                Launch constraints satisfied
              </h3>
              <p className="mt-2 text-sm text-slate-200">
                Spacecraft mass is within the launch vehicle payload capacity and spacecraft reliability is sufficient for ascent.
              </p>
              <p className="mt-2 text-xs text-slate-300">
                The launch succeeded; mission objectives are still in progress and are not considered complete by reaching orbit.
              </p>
            </section>
          )}

          <section className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-200">
              Mission systems check · {record.missionRequirementResults.filter((result) => result.passed).length}/{record.missionRequirementResults.length} constraints met
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {record.missionRequirementResults.map((result) => (
                <li key={result.id} className={`rounded-lg border px-3 py-2 text-xs ${result.passed ? 'border-emerald-300/10 text-emerald-100' : 'border-amber-300/15 text-amber-100'}`}>
                  <span aria-hidden="true">{result.passed ? '✓ ' : '⚠ '}</span>
                  {result.label}: {result.displayActual} / {result.displayTarget}
                  {!result.passed && <span className="block pt-1 text-slate-400">{result.problem}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-400">
              {record.missionRequirementResults.every((result) => result.passed)
                ? 'All listed mission design constraints are satisfied. Mission objectives still require in-flight completion.'
                : 'These unmet constraints put mission completion at risk; a completed launch sequence does not mean mission success.'}
            </p>
          </section>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['Spacecraft', record.spacecraftName],
              ['Spacecraft launch mass', `${record.spacecraftMassKg.toLocaleString()} kg`],
              ['Spacecraft reliability', `${record.spacecraftReliability}%`],
              ['Rocket payload capacity', `${record.launchVehicle.payloadCapacityKg.toLocaleString()} kg`],
              ['Estimated launch risk', record.riskLevel],
              ['Launch cost', formatCurrency(record.launchVehicle.launchCostMillions)],
              ['Total mission cost', formatCurrency(record.totalMissionCostMillions)],
              ['Mission budget', formatCurrency(record.missionBudgetMillions)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/8 bg-slate-950/35 p-3">
                <dt className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{label}</dt>
                <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => onRetry(record.launchVehicle)} className="rounded-xl bg-emerald-300 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-emerald-200">
              Retry Launch
            </button>
            <button type="button" onClick={onReturnToBuilder} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200 transition hover:border-white/25 hover:bg-white/5">
              Return to Spacecraft Builder
            </button>
            <button type="button" onClick={onChangeLaunchVehicle} className="rounded-xl border border-sky-300/20 bg-sky-300/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:bg-sky-300/10">
              Change Launch Vehicle
            </button>
          </div>
        </>
      )}
    </section>
  )
}
