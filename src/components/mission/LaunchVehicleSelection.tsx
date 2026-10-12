import type { LaunchRecord, LaunchVehicleSpec } from '../../data/launchVehicles'

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
  requirementsReady: boolean
}

interface LaunchResultsProps {
  record: LaunchRecord
  onReturnToBuilder: () => void
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
  requirementsReady,
}: LaunchVehicleSelectionProps) {
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
  const selectedVehicleFits =
    selectedVehicle !== null && spacecraftMassKg <= selectedVehicle.payloadCapacityKg
  const selectedTotalCost =
    existingMissionCostMillions + (selectedVehicle?.launchCostMillions ?? 0)
  const selectedVehicleAffordable =
    selectedVehicle !== null && selectedTotalCost <= missionBudgetLimitMillions
  const canLaunch =
    designTested && requirementsReady && selectedVehicleFits && selectedVehicleAffordable
  const noVehicleCanCarry = vehicles.every(
    (vehicle) => spacecraftMassKg > vehicle.payloadCapacityKg,
  )

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
                disabled={!fits}
                onClick={() => onSelectVehicle(vehicle.id)}
                className={`relative flex min-h-[370px] flex-col rounded-[24px] border p-4 text-left transition ${
                  !fits
                    ? 'cursor-not-allowed border-white/5 bg-slate-950/30 opacity-65'
                    : selected
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
                    ? 'Can launch current spacecraft'
                    : `Spacecraft exceeds payload capacity by ${Math.abs(remainingCapacityKg).toLocaleString()} kg.`}
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
                {noVehicleCanCarry
                  ? 'No available vehicle can carry this spacecraft.'
                  : !selectedVehicle
                    ? 'Select a launch vehicle.'
                    : !selectedVehicleFits
                      ? 'Spacecraft exceeds payload capacity.'
                      : !selectedVehicleAffordable
                        ? 'Mission budget exceeded.'
                        : !designTested
                          ? 'Re-test the mission after changing the configuration.'
                          : !requirementsReady
                            ? 'Resolve the spacecraft mission requirements before launch.'
                            : 'Ready for launch.'}
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
              {noVehicleCanCarry && (
                <p className="mt-1 text-xs text-slate-400">
                  Return to the spacecraft builder and reduce mass or modify the design.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:w-48">
              <button
                type="button"
                disabled={!canLaunch}
                onClick={() => selectedVehicle && onLaunch(selectedVehicle)}
                className="rounded-xl bg-emerald-300 px-4 py-3 text-xs font-bold uppercase tracking-[0.15em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                Launch Mission
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

export function LaunchResults({ record, onReturnToBuilder }: LaunchResultsProps) {
  return (
    <section className="rounded-[30px] border border-emerald-300/20 bg-slate-900/80 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.45)] sm:p-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200/80">
        Mission results
      </p>
      <h2 className="mt-2 text-3xl font-semibold text-white">Launch sequence initiated</h2>
      <p className="mt-2 text-sm text-slate-300">
        {record.missionName} is assigned to {record.launchVehicle.name}.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex min-h-[210px] items-center justify-center rounded-2xl border border-white/8 bg-slate-950/45">
          <RocketVisual vehicle={record.launchVehicle} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ['Launch vehicle', record.launchVehicle.name],
            ['Destination', record.destination],
            ['Spacecraft', record.spacecraftName],
            ['Spacecraft launch mass', `${record.spacecraftMassKg.toLocaleString()} kg`],
            ['Available payload after spacecraft', `${(record.launchVehicle.payloadCapacityKg - record.spacecraftMassKg).toLocaleString()} kg`],
            ['Launch cost', formatCurrency(record.launchVehicle.launchCostMillions)],
            ['Spacecraft & other mission costs', formatCurrency(record.existingMissionCostMillions)],
            ['Total mission cost', formatCurrency(record.totalMissionCostMillions)],
            ['Mission budget', formatCurrency(record.missionBudgetMillions)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/8 bg-slate-950/35 p-3">
              <dt className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{label}</dt>
              <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">
        Launch vehicle and mission cost are saved with this mission result.
      </p>
      <button
        type="button"
        onClick={onReturnToBuilder}
        className="mt-5 rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-200 transition hover:border-white/25 hover:bg-white/5"
      >
        Return to Mission Control
      </button>
    </section>
  )
}
