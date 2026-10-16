import type { SpacecraftSpec } from './spacecraft'
import {
  assessSustainability,
  type SustainabilityChoices,
} from './sustainability'

export type BuildComponentId = 'solarPanel' | 'antenna' | 'engine' | 'instrument'
export type ComponentFitMode = 'upgrade' | 'attach' | 'internal'
export type MountPoint =
  | 'existing-dish'
  | 'existing-solar-array'
  | 'existing-main-engine'
  | 'science-boom-tip'
  | 'remote-sensing-pallet'
  | 'science-deck'
  | 'nadir-deck'
  | 'shadowed-bus'
  | 'body-side-panel'
  | 'truss-array-mast'
  | 'truss-payload-carrier'
  | 'rover-mast'
  | 'rover-arm-turret'
  | 'rover-underbody'
  | 'internal-bay'
export type SolarPanelSize = 'small' | 'medium' | 'large'
export type AntennaType = 'standard' | 'highGain' | 'deepSpace'
export type EngineType = 'chemical' | 'ion' | 'nuclear'
export type InstrumentType = 'camera' | 'spectrometer' | 'radar'

export interface SpacecraftBuild {
  components: BuildComponentId[]
  solarPanelSize: SolarPanelSize
  antennaType: AntennaType
  engineType: EngineType
  instrumentType: InstrumentType
  instrumentCount: number
}

export interface SpacecraftBuildProfile {
  components: BuildComponentId[]
  componentLabels: Partial<Record<BuildComponentId, string>>
  componentDescriptions: Partial<Record<BuildComponentId, string>>
  fit: Partial<Record<BuildComponentId, ComponentFit>>
  instrumentFit?: Partial<Record<InstrumentType, ComponentFit>>
  antennaTypes?: AntennaType[]
  antennaLabels?: Partial<Record<AntennaType, string>>
  engineTypes?: EngineType[]
  instrumentTypes?: InstrumentType[]
  instrumentLabels?: Partial<Record<InstrumentType, string>>
  summary: string
}

export interface ComponentFit {
  mode: ComponentFitMode
  mountPoint: MountPoint
  slots?: number
  note: string
}

export interface SpacecraftBuildStats {
  mass: number
  power: number
  powerDemand: number
  powerMargin: number
  deltaV: number
  communication: number
  science: number
  instrumentCount: number
  reliability: number
  resourceEfficiency: number
  sustainabilityLevel: 'High' | 'Medium' | 'Low'
  sustainabilityExplanation: string
  missionCost: number
}

export const buildComponentLabels: Record<BuildComponentId, string> = {
  solarPanel: 'Solar panel',
  antenna: 'Antenna',
  engine: 'Engine',
  instrument: 'Science instrument',
}

export const solarPanelOptions: Record<
  SolarPanelSize,
  { label: string; power: number; mass: number; cost: number; scale: number }
> = {
  small: { label: 'Small', power: 500, mass: 25, cost: 12, scale: 0.65 },
  medium: { label: 'Medium', power: 1000, mass: 55, cost: 22, scale: 1 },
  large: { label: 'Large', power: 1500, mass: 90, cost: 38, scale: 1.4 },
}

export const antennaOptions: Record<
  AntennaType,
  { label: string; communication: number; mass: number; cost: number; scale: number }
> = {
  standard: { label: 'Standard', communication: 62, mass: 18, cost: 8, scale: 0.65 },
  highGain: { label: 'High-gain dish', communication: 86, mass: 35, cost: 18, scale: 1 },
  deepSpace: { label: 'Deep-space high-gain link', communication: 97, mass: 70, cost: 42, scale: 1.4 },
}

export const engineOptions: Record<
  EngineType,
  { label: string; deltaV: number; mass: number; cost: number; scale: number }
> = {
  chemical: { label: 'Chemical', deltaV: 10, mass: 80, cost: 60, scale: 1 },
  ion: { label: 'Ion electric', deltaV: 16, mass: 110, cost: 110, scale: 1.1 },
  nuclear: { label: 'Nuclear thermal', deltaV: 21, mass: 180, cost: 220, scale: 1.25 },
}

export const instrumentOptions: Record<
  InstrumentType,
  { label: string; science: number; power: number; mass: number; cost: number; scale: number }
> = {
  camera: { label: 'Survey camera', science: 18, power: 120, mass: 12, cost: 20, scale: 0.75 },
  spectrometer: {
    label: 'Spectrometer',
    science: 34,
    power: 240,
    mass: 32,
    cost: 58,
    scale: 1,
  },
  radar: { label: 'Mapping radar', science: 52, power: 390, mass: 75, cost: 125, scale: 1.35 },
}

const upgrade = (mountPoint: MountPoint, note: string): ComponentFit => ({
  mode: 'upgrade',
  mountPoint,
  note,
})
const attach = (mountPoint: MountPoint, note: string, slots: number): ComponentFit => ({
  mode: 'attach',
  mountPoint,
  slots,
  note,
})
const internal = (note: string): ComponentFit => ({
  mode: 'internal',
  mountPoint: 'internal-bay',
  note,
})
const existingDish = (note: string) => upgrade('existing-dish', note)
const existingArray = (note: string) => upgrade('existing-solar-array', note)
const existingEngine = (note: string) => upgrade('existing-main-engine', note)

const spacecraftBuildProfiles: Record<string, SpacecraftBuildProfile> = {
  voyager: {
    components: ['antenna', 'instrument'],
    componentLabels: {
      antenna: 'Deep-space antenna upgrade',
      instrument: 'Interstellar science package',
    },
    componentDescriptions: {
      antenna: 'Deep-space communications fit the probe and its modeled high-gain dish.',
      instrument: 'Choose an imaging or spectrometer package for the probe science boom.',
    },
    fit: {
      antenna: existingDish('Uses the modeled high-gain dish; no extra antenna is added.'),
      instrument: upgrade('science-boom-tip', 'Selects instruments already modeled on the science boom.'),
    },
    antennaTypes: ['deepSpace'],
    antennaLabels: { deepSpace: 'Upgraded high-gain antenna' },
    instrumentTypes: ['camera', 'spectrometer'],
    instrumentLabels: {
      camera: 'Imaging science package',
      spectrometer: 'Plasma / ultraviolet science package',
    },
    summary: 'RTG-powered probe with a high-gain dish and science-instrument booms.',
  },
  cassini: {
    components: ['antenna', 'engine', 'instrument'],
    componentLabels: {
      antenna: 'High-gain dish upgrade',
      engine: 'Chemical propulsion package',
      instrument: 'Saturn science package',
    },
    componentDescriptions: {
      antenna: 'A high-gain dish is appropriate for Cassini’s deep-space communications.',
      engine: 'Cassini used chemical propulsion; other propulsion classes are not offered.',
      instrument: 'Select a package consistent with Cassini’s imaging, spectroscopy, and radar suite.',
    },
    fit: {
      antenna: existingDish('Uses the modeled high-gain dish; no extra antenna is added.'),
      engine: existingEngine('Binds to the existing main engine; no new geometry is added.'),
      instrument: attach('remote-sensing-pallet', 'Mounts on Cassini’s side-mounted remote-sensing pallet.', 3),
    },
    instrumentFit: {
      radar: existingDish('Cassini RADAR used the high-gain dish; no separate radar hardware is added.'),
    },
    antennaTypes: ['deepSpace'],
    antennaLabels: { deepSpace: 'Upgraded high-gain dish' },
    engineTypes: ['chemical'],
    instrumentTypes: ['camera', 'spectrometer', 'radar'],
    instrumentLabels: {
      camera: 'Imaging Science Subsystem',
      spectrometer: 'Visual and Infrared Mapping Spectrometer',
      radar: 'Titan radar package',
    },
    summary: 'RTG-powered Saturn orbiter with a high-gain dish, chemical propulsion, and a broad science suite.',
  },
  clipper: {
    components: ['solarPanel', 'antenna', 'engine', 'instrument'],
    componentLabels: {
      solarPanel: 'Solar-wing capacity extension',
      antenna: 'High-gain communications upgrade',
      engine: 'Chemical propulsion package',
      instrument: 'Europa flyby science package',
    },
    componentDescriptions: {
      solarPanel: 'An array extension matches Europa Clipper’s modeled solar wings.',
      antenna: 'A high-gain communications upgrade suits the Jupiter-system mission.',
      engine: 'Chemical propulsion is compatible with this spacecraft’s maneuvering system.',
      instrument: 'Choose imaging, spectroscopy, or ice-penetrating radar for Europa flybys.',
    },
    fit: {
      solarPanel: existingArray('Binds to the modeled solar wings; no extra panels are added.'),
      antenna: existingDish('Binds to the modeled high-gain dish.'),
      engine: existingEngine('Binds to the existing main propulsion module.'),
      instrument: attach('nadir-deck', 'Camera and spectrometer payloads mount on the Europa-facing nadir deck.', 3),
    },
    instrumentFit: {
      radar: existingArray('REASON antennas are mounted on the solar wings; no body-mounted radar is added.'),
    },
    antennaTypes: ['highGain'],
    engineTypes: ['chemical'],
    instrumentTypes: ['camera', 'spectrometer', 'radar'],
    instrumentLabels: {
      camera: 'Europa Imaging System',
      spectrometer: 'Mapping Imaging Spectrometer for Europa',
      radar: 'REASON ice-penetrating radar',
    },
    summary: 'Solar-powered Jupiter flyby spacecraft with solar wings, high-gain communications, and a dedicated Europa science suite.',
  },
  iss: {
    components: ['solarPanel', 'instrument'],
    componentLabels: {
      solarPanel: 'Station solar-array extension',
      instrument: 'Orbital research payload',
    },
    componentDescriptions: {
      solarPanel: 'An additional power-wing module is appropriate for the station truss.',
      instrument: 'The station can host external research payloads; no spacecraft engine or dish is added.',
    },
    fit: {
      solarPanel: attach('truss-array-mast', 'Mounts at an existing solar-array mast on the truss.', 2),
      instrument: attach('truss-payload-carrier', 'Mounts on one of the station’s external truss payload carriers.', 4),
    },
    instrumentTypes: ['camera', 'spectrometer', 'radar'],
    instrumentLabels: {
      camera: 'Earth-observation camera payload',
      spectrometer: 'External spectrometer payload',
      radar: 'Earth-observation radar payload',
    },
    summary: 'Modular orbital laboratory with solar power and payload accommodation; visiting vehicles provide reboost.',
  },
  perseverance: {
    components: ['instrument'],
    componentLabels: { instrument: 'Rover science package' },
    componentDescriptions: {
      instrument: 'Choose a camera, spectrometer, or ground-penetrating radar package for the rover.',
    },
    fit: {
      instrument: upgrade('rover-mast', 'The rover’s instruments bind to their existing mast, arm turret, and underbody locations.'),
    },
    instrumentFit: {
      camera: upgrade('rover-mast', 'Mastcam-Z and SuperCam are mounted on the remote-sensing mast.'),
      spectrometer: upgrade('rover-arm-turret', 'PIXL and SHERLOC are mounted on the robotic-arm turret.'),
      radar: upgrade('rover-underbody', 'RIMFAX is mounted beneath the rover body.'),
    },
    instrumentTypes: ['camera', 'spectrometer', 'radar'],
    instrumentLabels: {
      camera: 'Mastcam-Z / SuperCam camera package',
      spectrometer: 'PIXL / SHERLOC science package',
      radar: 'RIMFAX ground-penetrating radar',
    },
    summary: 'RTG-powered surface rover; arrays, antennas, and wheel mobility are not bolt-on spacecraft modules.',
  },
  'osiris-rex': {
    components: ['solarPanel', 'antenna', 'engine', 'instrument'],
    componentLabels: {
      solarPanel: 'Solar-array capacity extension',
      antenna: 'Deep-space communications upgrade',
      engine: 'Chemical propulsion package',
      instrument: 'Asteroid science package',
    },
    componentDescriptions: {
      solarPanel: 'An array extension matches the spacecraft’s solar-powered design.',
      antenna: 'Deep-space communications match the modeled high-gain link.',
      engine: 'Chemical propulsion is compatible with the mission’s maneuvering system.',
      instrument: 'Choose an imaging or spectrometer package for asteroid characterization.',
    },
    fit: {
      solarPanel: existingArray('Binds to the modeled solar wings.'),
      antenna: existingDish('Binds to the modeled high-gain dish.'),
      engine: existingEngine('Binds to the existing propulsion system.'),
      instrument: upgrade('science-deck', 'Selects science hardware already on the science deck.'),
    },
    antennaTypes: ['deepSpace'],
    engineTypes: ['chemical'],
    instrumentTypes: ['camera', 'spectrometer'],
    instrumentLabels: {
      camera: 'OCAMS imaging package',
      spectrometer: 'OVIRS / OTES spectrometer package',
    },
    summary: 'Solar-powered asteroid sampler with deep-space communications and an existing chemical propulsion system.',
  },
  jwst: {
    components: ['solarPanel', 'antenna', 'instrument'],
    componentLabels: {
      solarPanel: 'Spacecraft power-array extension',
      antenna: 'Deep-space communications upgrade',
      instrument: 'Infrared instrument package',
    },
    componentDescriptions: {
      solarPanel: 'A spacecraft power extension; it does not replace or alter Webb’s sunshield.',
      antenna: 'Deep-space communications fit the Sun-Earth L2 observatory.',
      instrument: 'Choose an imaging or spectroscopy package from Webb’s infrared science domain.',
    },
    fit: {
      solarPanel: existingArray('Binds to the modeled power array; no extra panels are added.'),
      antenna: existingDish('Binds to the modeled communications antenna.'),
      instrument: internal('JWST science instruments are inside the Integrated Science Instrument Module.'),
    },
    antennaTypes: ['deepSpace'],
    instrumentTypes: ['camera', 'spectrometer'],
    instrumentLabels: {
      camera: 'NIRCam imaging package',
      spectrometer: 'NIRSpec / MIRI spectroscopy package',
    },
    summary: 'Sun-Earth L2 infrared observatory with a solar power wing, high-gain link, and infrared instruments.',
  },
  'parker-solar-probe': {
    components: ['antenna', 'instrument'],
    componentLabels: {
      antenna: 'Deep-space communications upgrade',
      instrument: 'Solar science package',
    },
    componentDescriptions: {
      antenna: 'Deep-space communications match the probe’s link; no extra solar panel is offered near the Sun.',
      instrument: 'The modeled probe supports solar imaging payloads; its thermal shield remains unchanged.',
    },
    fit: {
      antenna: existingDish('Binds to the modeled high-gain dish.'),
      instrument: upgrade('shadowed-bus', 'WISPR is on the bus; all modeled hardware remains in the heat-shield shadow.'),
    },
    antennaTypes: ['deepSpace'],
    instrumentTypes: ['camera'],
    instrumentLabels: { camera: 'WISPR solar-imaging package' },
    summary: 'Thermally protected solar probe; its power arrays are shielded and are not treated as generic panel add-ons.',
  },
  juno: {
    components: ['solarPanel', 'antenna', 'engine', 'instrument'],
    componentLabels: {
      solarPanel: 'Solar-wing capacity extension',
      antenna: 'Deep-space communications upgrade',
      engine: 'Chemical propulsion package',
      instrument: 'Jupiter science package',
    },
    componentDescriptions: {
      solarPanel: 'An array extension matches Juno’s solar-powered design.',
      antenna: 'Deep-space communications suit the Jupiter orbiter.',
      engine: 'Chemical propulsion is compatible with Juno’s maneuvering system.',
      instrument: 'Choose an imaging or infrared science package for Jupiter.',
    },
    fit: {
      solarPanel: existingArray('Binds to Juno’s modeled solar wings.'),
      antenna: existingDish('Binds to the modeled high-gain dish.'),
      engine: existingEngine('Binds to the existing main engine.'),
      instrument: upgrade('body-side-panel', 'Selects instruments already mounted on the spacecraft body.'),
    },
    antennaTypes: ['deepSpace'],
    engineTypes: ['chemical'],
    instrumentTypes: ['camera', 'spectrometer'],
    instrumentLabels: {
      camera: 'JunoCam imaging package',
      spectrometer: 'JIRAM infrared imaging spectrometer',
    },
    summary: 'Solar-powered Jupiter orbiter with large arrays, deep-space communications, and a planetary science suite.',
  },
  roman: {
    components: ['solarPanel', 'antenna', 'instrument'],
    componentLabels: {
      solarPanel: 'Spacecraft power-array extension',
      antenna: 'Deep-space communications upgrade',
      instrument: 'Wide-field observatory payload',
    },
    componentDescriptions: {
      solarPanel: 'A spacecraft power extension fits the observatory’s solar-powered design.',
      antenna: 'Deep-space communications suit the Sun-Earth L2 observatory.',
      instrument: 'Choose a wide-field imaging or coronagraph payload.',
    },
    fit: {
      solarPanel: existingArray('Binds to the modeled solar array.'),
      antenna: existingDish('Binds to the modeled high-gain antenna.'),
      instrument: internal('Roman instruments are inside the telescope assembly; nothing is mounted externally.'),
    },
    antennaTypes: ['deepSpace'],
    instrumentTypes: ['camera'],
    instrumentLabels: { camera: 'Wide Field Instrument imaging package' },
    summary: 'Sun-Earth L2 observatory with solar power, deep-space communications, and wide-field imaging.',
  },
  ingenuity: {
    components: [],
    componentLabels: {},
    componentDescriptions: {},
    fit: {},
    summary: 'The compact helicopter has its solar-charged battery, rotor, and navigation cameras built in; no bolt-on modules are offered.',
  },
  'landsat-8': {
    components: ['solarPanel', 'instrument'],
    componentLabels: {
      solarPanel: 'Solar-array capacity extension',
      instrument: 'Earth-observation sensor package',
    },
    componentDescriptions: {
      solarPanel: 'An array extension matches Landsat 8’s solar-powered satellite design.',
      instrument: 'Choose an imaging sensor package consistent with OLI/TIRS observations.',
    },
    fit: {
      solarPanel: existingArray('Binds to Landsat 8’s modeled solar array.'),
      instrument: upgrade('nadir-deck', 'Selects the Earth-facing OLI/TIRS sensor already in the model.'),
    },
    instrumentTypes: ['camera'],
    instrumentLabels: { camera: 'Operational Land Imager package' },
    summary: 'Solar-powered Earth-observation satellite with its OLI and TIRS instruments represented in the base model.',
  },
  dscovr: {
    components: ['solarPanel', 'antenna', 'instrument'],
    componentLabels: {
      solarPanel: 'Solar-array capacity extension',
      antenna: 'Deep-space communications upgrade',
      instrument: 'Earth / space-weather sensor package',
    },
    componentDescriptions: {
      solarPanel: 'An array extension matches the observatory’s solar-powered design.',
      antenna: 'A deep-space link fits DSCOVR’s Sun-Earth L1 communications role.',
      instrument: 'Choose an Earth-imaging payload consistent with the modeled observatory.',
    },
    fit: {
      solarPanel: existingArray('Binds to DSCOVR’s modeled solar arrays.'),
      antenna: existingDish('Binds to the modeled communications antenna.'),
      instrument: upgrade('nadir-deck', 'Selects the Earth-facing EPIC imager already in the model.'),
    },
    antennaTypes: ['deepSpace'],
    instrumentTypes: ['camera'],
    instrumentLabels: { camera: 'EPIC Earth-imaging package' },
    summary: 'Solar-powered Sun-Earth L1 observatory with deep-space communications and Earth / space-weather instruments.',
  },
}

export function getSpacecraftBuildProfile(spacecraft: SpacecraftSpec): SpacecraftBuildProfile {
  if (spacecraft.model.format === 'unavailable') {
    return {
      components: [],
      componentLabels: {},
      componentDescriptions: {},
      fit: {},
      summary: 'No verified 3D model is available, so model-specific physical extensions are disabled.',
    }
  }
  return spacecraftBuildProfiles[spacecraft.id] ?? {
    components: [],
    componentLabels: {},
    componentDescriptions: {},
    fit: {},
    summary: 'No mission-specific extension profile is defined for this spacecraft model.',
  }
}

export function getComponentFit(
  profile: SpacecraftBuildProfile,
  component: BuildComponentId,
  instrumentType?: InstrumentType,
): ComponentFit | undefined {
  if (component === 'instrument' && instrumentType) {
    return profile.instrumentFit?.[instrumentType] ?? profile.fit.instrument
  }
  return profile.fit[component]
}

export function createInitialBuild(): SpacecraftBuild {
  return {
    components: [],
    solarPanelSize: 'medium',
    antennaType: 'highGain',
    engineType: 'chemical',
    instrumentType: 'camera',
    instrumentCount: 1,
  }
}

function pickAllowed<T>(allowed: T[] | undefined, current: T): T {
  if (!allowed?.length || allowed.includes(current)) return current
  return allowed[0]
}

export function normalizeBuild(spacecraft: SpacecraftSpec, build: SpacecraftBuild): SpacecraftBuild {
  const profile = getSpacecraftBuildProfile(spacecraft)
  return {
    ...build,
    components: build.components.filter((component) => profile.components.includes(component)),
    antennaType: pickAllowed(profile.antennaTypes, build.antennaType),
    engineType: pickAllowed(profile.engineTypes, build.engineType),
    instrumentType: pickAllowed(profile.instrumentTypes, build.instrumentType),
    instrumentCount: Math.min(
      4,
      Math.max(1, Math.round(Number.isFinite(build.instrumentCount) ? build.instrumentCount : 1)),
    ),
  }
}

export function calculateBuildStats(
  spacecraft: SpacecraftSpec,
  build: SpacecraftBuild,
  payloadKg: number,
  fuelKg: number,
  destinationRisk: number,
  propulsionCost: number,
  sustainabilityChoices: SustainabilityChoices,
  isEarthOrbitMission: boolean,
): SpacecraftBuildStats {
  build = normalizeBuild(spacecraft, build)
  const has = (component: BuildComponentId) => build.components.includes(component)
  const panel = has('solarPanel') ? solarPanelOptions[build.solarPanelSize] : undefined
  const antenna = has('antenna') ? antennaOptions[build.antennaType] : undefined
  const engine = has('engine') ? engineOptions[build.engineType] : undefined
  const instrumentCount = has('instrument') ? build.instrumentCount : 0
  const instrument = instrumentCount > 0 ? instrumentOptions[build.instrumentType] : undefined
  const sustainability = assessSustainability(sustainabilityChoices, isEarthOrbitMission)
  const reusableMass = sustainabilityChoices.propulsionLifecycle === 'reusable' ? 120 : 0
  const modularMass = sustainabilityChoices.architecture === 'modular' ? 85 : 0
  const sparesMass = sustainabilityChoices.spareParts === 'spares' ? 55 : 0
  const deorbitMass =
    isEarthOrbitMission && sustainabilityChoices.endOfLife === 'controlledDeorbit' ? 80 : 0
  const reusableCost = sustainabilityChoices.propulsionLifecycle === 'reusable' ? 40 : 0
  const modularCost = sustainabilityChoices.architecture === 'modular' ? 28 : 0
  const sparesCost = sustainabilityChoices.spareParts === 'spares' ? 18 : 0
  const deorbitCost =
    isEarthOrbitMission && sustainabilityChoices.endOfLife === 'controlledDeorbit' ? 20 : 0
  const componentMass =
    (panel?.mass ?? 0) +
    (antenna?.mass ?? 0) +
    (engine?.mass ?? 0) +
    (instrument?.mass ?? 0) * instrumentCount
  const mass =
    spacecraft.mass +
    payloadKg +
    fuelKg +
    componentMass +
    reusableMass +
    modularMass +
    sparesMass +
    deorbitMass
  const power = panel?.power ?? 0
  const powerDemand = 220 + (antenna ? 25 : 0) + (instrument?.power ?? 0) * instrumentCount
  const deltaV = engine
    ? engine.deltaV * Math.log1p(fuelKg / Math.max(mass - fuelKg, 1)) * 0.9
    : 0
  const communication = antenna
    ? Math.max(25, Math.round(antenna.communication - Math.max(0, mass - 5000) / 1500))
    : 18
  const science = (instrument?.science ?? 0) * instrumentCount + Math.round(payloadKg / 100)
  const componentCost =
    (panel?.cost ?? 0) +
    (antenna?.cost ?? 0) +
    (engine?.cost ?? 0) +
    (instrument?.cost ?? 0) * instrumentCount
  const missionCost = Math.round(
    spacecraft.cost +
      componentCost +
      reusableCost +
      modularCost +
      sparesCost +
      deorbitCost +
      payloadKg * 0.15 +
      fuelKg * 0.08 +
      destinationRisk * 18 +
      propulsionCost * 24,
  )

  return {
    mass: Math.round(mass),
    power,
    powerDemand,
    powerMargin: power - powerDemand,
    deltaV: Math.max(0, deltaV),
    communication,
    science,
    instrumentCount,
    reliability: Math.min(
      99,
      Math.max(
        35,
        spacecraft.reliability +
          (sustainabilityChoices.propulsionLifecycle === 'reusable' ? 4 : -3) +
          (sustainabilityChoices.architecture === 'modular' ? 3 : 0) +
          (sustainabilityChoices.spareParts === 'spares' ? 7 : 0) -
          (isEarthOrbitMission && sustainabilityChoices.endOfLife === 'leaveInOrbit' ? 2 : 0),
      ),
    ),
    resourceEfficiency: sustainability.resourceEfficiency,
    sustainabilityLevel: sustainability.level,
    sustainabilityExplanation: sustainability.explanation,
    missionCost,
  }
}
