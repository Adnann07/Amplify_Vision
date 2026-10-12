export type Vector3Tuple = [number, number, number]

export interface StlAssemblyPart {
  path: string
  position: Vector3Tuple
  rotation: Vector3Tuple
}

export interface SpacecraftGlbModel {
  format: 'glb'
  modelPath: string
  sourceUrl: string
}

export interface SpacecraftStlModel {
  format: 'stl'
  modelPath: string
  sourceUrl: string
  scale: number
  parts: StlAssemblyPart[]
  solarWings?: {
    path: string
    centerOffset: number
  }
}

export interface UnavailableSpacecraftModel {
  format: 'unavailable'
  sourceUrl: string
  reason: string
}

export type SpacecraftModel =
  | SpacecraftGlbModel
  | SpacecraftStlModel
  | UnavailableSpacecraftModel

export interface SpacecraftSpec {
  id: string
  name: string
  agency: string
  type: string
  missionCategory?: string
  missionStatus?: string
  description: string
  missionPurpose: string
  destination: string
  mass: number
  power: number
  communication: string
  propulsionSystem?: string
  powerSystem?: string
  instruments?: string[]
  crewCapacity?: number
  missionSourceUrl?: string
  assetAttribution?: string
  assetUsageNotes?: string
  gameplayNote?: string
  reliability: number
  cost: number
  accent: string
  model: SpacecraftModel
}

export function filterSpacecraft(
  spacecraft: SpacecraftSpec[],
  category: string,
  search: string,
): SpacecraftSpec[] {
  const query = search.trim().toLocaleLowerCase()
  return spacecraft.filter((craft) => {
    if (category !== 'All' && (craft.missionCategory ?? 'Other') !== category) return false
    return !query || [
      craft.name,
      craft.type,
      craft.description,
      craft.destination,
      craft.missionPurpose,
      craft.missionStatus ?? '',
    ].some((value) => value.toLocaleLowerCase().includes(query))
  })
}

export interface DestinationOption {
  id: string
  label: string
  distance: string
  environment: string
  risk: number
  transfer: string
}

export interface PropulsionOption {
  id: string
  label: string
  efficiency: number
  cost: number
  description: string
}

export const spacecraftCatalog: SpacecraftSpec[] = [
  {
    id: 'voyager',
    name: 'Voyager',
    agency: 'NASA / JPL',
    type: 'Deep-space probe',
    missionCategory: 'Deep-space exploration',
    missionStatus: 'Extended interstellar mission',
    description:
      'Long-range science platform built for heliosphere reconnaissance and interstellar monitoring.',
    missionPurpose:
      'Explore the outer planets and measure the heliosphere and interstellar space.',
    destination: 'Outer planets / interstellar space',
    mass: 722,
    power: 68,
    communication: 'Deep-space radio array',
    reliability: 91,
    cost: 840,
    accent: '#7dd3fc',
    missionSourceUrl: 'https://science.nasa.gov/mission/voyager/',
    model: {
      format: 'stl',
      modelPath: '/models/voyager/bus.stl',
      sourceUrl: 'https://science.nasa.gov/3d-resources/voyager/',
      scale: 0.01,
      parts: [
        { path: '/models/voyager/bus.stl', position: [0, 0, 0], rotation: [0, 0, 0] },
        {
          path: '/models/voyager/dish.stl',
          position: [0, 51, 0],
          rotation: [-Math.PI / 2, 0, 0],
        },
        { path: '/models/voyager/legs.stl', position: [0, -34, 0], rotation: [0, 0, 0] },
        {
          path: '/models/voyager/boom_01.stl',
          position: [103, -3, 0],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/voyager/boom_02.stl',
          position: [263, -3, 0],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/voyager/boom_03.stl',
          position: [423, -3, 0],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/voyager/instrument_01.stl',
          position: [518, -3, 0],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/voyager/instrument_02.stl',
          position: [518, 3, 8],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/voyager/instrument_03.stl',
          position: [518, -5, -9],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/voyager/arm_left_01.stl',
          position: [-21, -32, 40],
          rotation: [Math.PI / 2, 0, 0],
        },
        {
          path: '/models/voyager/arm_left_02.stl',
          position: [-21, -32, 91],
          rotation: [Math.PI / 2, 0, 0],
        },
        {
          path: '/models/voyager/arm_right_01.stl',
          position: [14, -38, -57],
          rotation: [0, 0, Math.PI / 2],
        },
        {
          path: '/models/voyager/arm_right_02.stl',
          position: [-14, -38, -57],
          rotation: [0, 0, Math.PI / 2],
        },
      ],
    },
  },
  {
    id: 'cassini',
    name: 'Cassini',
    agency: 'NASA / ESA / ASI',
    type: 'Saturn orbiter & Huygens probe',
    missionCategory: 'Planetary science',
    missionStatus: 'Mission ended in 2017',
    description:
      'Orbiter and atmospheric probe built to investigate Saturn, its rings, and its moons.',
    missionPurpose:
      'Study Saturn’s atmosphere, rings, magnetosphere, and icy moons; deliver Huygens to Titan.',
    destination: 'Saturn system',
    mass: 5712,
    power: 82,
    communication: 'High-gain dish and X-band radio',
    reliability: 88,
    cost: 3200,
    accent: '#c4b5fd',
    missionSourceUrl: 'https://science.nasa.gov/mission/cassini/',
    model: {
      format: 'stl',
      modelPath: '/models/cassini/bus_01.stl',
      sourceUrl: 'https://science.nasa.gov/3d-resources/cassini/',
      scale: 0.012,
      parts: [
        { path: '/models/cassini/bus_01.stl', position: [0, 0, 0], rotation: [0, 0, 0] },
        {
          path: '/models/cassini/bus_02.stl',
          position: [0, 36, 0],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/cassini/bus_top.stl',
          position: [0, 73, 0],
          rotation: [0, 0, 0],
        },
        { path: '/models/cassini/bottom.stl', position: [0, -39, 0], rotation: [0, 0, 0] },
        {
          path: '/models/cassini/dish.stl',
          position: [0, 105, 0],
          rotation: [-Math.PI / 2, 0, 0],
        },
        {
          path: '/models/cassini/boom_01.stl',
          position: [-34, 46, 0],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/cassini/boom_02.stl',
          position: [-34, 129, 0],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/cassini/bracket.stl',
          position: [0, 86, 0],
          rotation: [0, 0, 0],
        },
        {
          path: '/models/cassini/huygens_01.stl',
          position: [34, -28, 0],
          rotation: [0, 0, -Math.PI / 2],
        },
        {
          path: '/models/cassini/huygens_02.stl',
          position: [34, -19, 0],
          rotation: [0, 0, -Math.PI / 2],
        },
        {
          path: '/models/cassini/RTG_3.stl',
          position: [-36, -20, -45],
          rotation: [0, 0, Math.PI / 2],
        },
        {
          path: '/models/cassini/RTG_3.stl',
          position: [36, -20, -45],
          rotation: [0, 0, Math.PI / 2],
        },
        {
          path: '/models/cassini/RTG_3.stl',
          position: [0, -20, 52],
          rotation: [0, 0, Math.PI / 2],
        },
      ],
    },
  },
  {
    id: 'clipper',
    name: 'Europa Clipper',
    agency: 'NASA / JPL',
    type: 'Europa flyby science mission',
    missionCategory: 'Planetary science',
    missionStatus: 'En route to Jupiter; Europa flybys planned',
    description:
      'Radiation-hardened spacecraft designed to survey Europa and characterize oceanic habitability.',
    missionPurpose:
      'Determine whether Europa has conditions suitable for life with repeated close flybys.',
    destination: 'Jupiter / Europa',
    mass: 6000,
    power: 85,
    communication: 'High-gain X-band',
    reliability: 87,
    cost: 2900,
    accent: '#67e8f9',
    missionSourceUrl: 'https://science.nasa.gov/mission/europa-clipper/',
    model: {
      format: 'stl',
      modelPath: '/models/europa-clipper/YZ-Body-EuropaClipper-2025D.stl',
      sourceUrl:
        'https://science.nasa.gov/resource/europa-clipper-scale-model-3d-print-version-2025d/',
      scale: 0.01,
      parts: [
        {
          path: '/models/europa-clipper/YZ-Body-EuropaClipper-2025D.stl',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
      ],
      solarWings: {
        path: '/models/europa-clipper/X-Wings-EuropaClipper-2025D.stl',
        centerOffset: 134,
      },
    },
  },
  {
    id: 'iss',
    name: 'ISS Modules',
    agency: 'NASA / Roscosmos / ESA / JAXA / CSA',
    type: 'Modular orbital research station',
    missionCategory: 'Orbital infrastructure',
    missionStatus: 'Crewed orbital laboratory',
    description:
      'A permanently crewed orbital laboratory assembled from international pressurized and truss modules.',
    missionPurpose:
      'Enable long-duration human spaceflight research and technology demonstrations in low Earth orbit.',
    destination: 'Low Earth orbit',
    mass: 420000,
    power: 92,
    communication: 'Multi-band relay',
    reliability: 94,
    cost: 1500,
    accent: '#a7f3d0',
    missionSourceUrl: 'https://www.nasa.gov/international-space-station/',
    model: {
      format: 'glb',
      modelPath: '/models/iss/iss.glb',
      sourceUrl: 'https://science.nasa.gov/3d-resources/international-space-station-iss-a/',
    },
  },
  {
    id: 'lunar',
    name: 'Lunar Pathfinder',
    agency: 'ESA / SSTL',
    type: 'Lunar communications relay',
    missionCategory: 'Communications',
    missionStatus: 'Planned lunar communications relay',
    description:
      'A planned lunar-orbit communications relay satellite intended to support future lunar missions.',
    missionPurpose:
      'Demonstrate a commercial lunar communications relay service for missions on and around the Moon.',
    destination: 'Lunar orbit',
    mass: 64,
    power: 76,
    communication: 'Lunar relay radio',
    reliability: 90,
    cost: 1100,
    accent: '#f9a8d4',
    missionSourceUrl:
      'https://www.esa.int/Applications/Connectivity_and_Secure_Communications/Lunar_Pathfinder',
    model: {
      format: 'unavailable',
      sourceUrl: 'https://science.nasa.gov/3d-resources/',
      reason:
        'No downloadable NASA/JPL 3D model for Lunar Pathfinder could be verified in the official NASA 3D Resources catalog.',
    },
  },
  {
    id: 'orion',
    name: 'Orion',
    agency: 'NASA',
    type: 'Crewed lunar spacecraft',
    missionCategory: 'Crewed exploration',
    missionStatus: 'Artemis crew spacecraft',
    description:
      'Crew transportation spacecraft designed for Artemis missions beyond low Earth orbit.',
    missionPurpose:
      'Carry crew to lunar vicinity and return them safely to Earth; Orion is not a lunar lander.',
    destination: 'Lunar vicinity / Earth return',
    mass: 11500,
    power: 1100,
    communication: 'Crew-rated deep-space communications',
    propulsionSystem: 'Crew/service-module maneuvering; simplified in this game',
    powerSystem: 'Solar-array electrical power',
    instruments: ['Crew life-support and environmental control', 'Navigation and communications systems'],
    crewCapacity: 4,
    reliability: 92,
    cost: 4200,
    accent: '#fbbf24',
    missionSourceUrl: 'https://www.nasa.gov/humans-in-space/orion-spacecraft/orion-overview/',
    gameplayNote:
      'Mass, power, reliability, and cost are rounded gameplay values, not Orion flight specifications. Crew consumables, life-support reserves, thermal protection, and human-rating are not independently simulated.',
    assetAttribution: 'NASA',
    assetUsageNotes:
      'No mission-specific Orion model was verified in the inspected NASA-3D-Resources catalog; the builder remains usable without a 3D model.',
    model: {
      format: 'unavailable',
      sourceUrl: 'https://github.com/nasa/NASA-3D-Resources',
      reason:
        'No mission-specific Orion model was verified in the inspected NASA 3D Resources catalog.',
    },
  },
  {
    id: 'perseverance',
    name: 'Mars 2020 Perseverance Rover',
    agency: 'NASA / JPL',
    type: 'Mars surface rover',
    missionCategory: 'Surface exploration',
    missionStatus: 'Operating on Mars',
    description:
      'Jezero Crater rover investigating ancient habitability and collecting rock and regolith samples.',
    missionPurpose:
      'Explore the Martian surface, study its geology and past water environment, and cache samples.',
    destination: 'Mars · Jezero Crater surface',
    mass: 1500,
    power: 900,
    communication: 'Mars relay and direct-to-Earth links',
    propulsionSystem: 'Surface mobility; entry, descent, and landing are separate mission systems',
    powerSystem: 'Radioisotope power system',
    instruments: ['Mastcam-Z', 'SuperCam', 'PIXL', 'SHERLOC', 'RIMFAX'],
    reliability: 91,
    cost: 3600,
    accent: '#fb923c',
    missionSourceUrl: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
    gameplayNote:
      'Mass, power, reliability, and cost are rounded gameplay values, not rover flight specifications. The game does not simulate Mars entry/descent/landing, surface driving, sample caching, or relay coverage.',
    assetAttribution: 'NASA/JPL-Caltech, NASA 3D Resources',
    assetUsageNotes:
      'Mission-specific GLB downloaded from the official NASA-3D-Resources repository; its README describes assets as free and without copyright. Review NASA usage guidance at https://www.nasa.gov/nasa-brand-center/images-and-media.',
    model: {
      format: 'glb',
      modelPath: '/models/perseverance/Mars2020PerseveranceRover.glb',
      sourceUrl: 'https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/',
    },
  },
  {
    id: 'osiris-rex',
    name: 'OSIRIS-REx',
    agency: 'NASA / Goddard / University of Arizona',
    type: 'Asteroid sample-return spacecraft',
    missionCategory: 'Asteroid exploration and sample return',
    missionStatus: 'Primary mission complete; spacecraft continued as OSIRIS-APEX',
    description:
      'Bennu sample-return mission that collected a sample in 2020 and delivered it to Earth in 2023.',
    missionPurpose:
      'Characterize Bennu, collect and contain a sample, and return it to Earth.',
    destination: 'Asteroid Bennu · Earth sample return',
    mass: 2200,
    power: 1000,
    communication: 'Deep-space high-gain communications',
    propulsionSystem: 'Chemical propulsion and proximity navigation; simplified in this game',
    powerSystem: 'Solar arrays',
    instruments: ['OCAMS', 'OVIRS', 'OTES', 'REXIS', 'TAGSAM sample acquisition system'],
    reliability: 90,
    cost: 3500,
    accent: '#c084fc',
    missionSourceUrl: 'https://science.nasa.gov/mission/osiris-rex/',
    gameplayNote:
      'Mass, power, reliability, and cost are rounded gameplay values, not OSIRIS-REx flight specifications. Asteroid approach, contact sampling, sample containment, and Earth return are represented only as planning objectives.',
    assetAttribution: 'NASA / NASA-3D-Resources contributors',
    assetUsageNotes:
      'Mission-specific GLB downloaded from the official NASA-3D-Resources repository; its README describes assets as free and without copyright. Review NASA usage guidance at https://www.nasa.gov/nasa-brand-center/images-and-media.',
    model: {
      format: 'glb',
      modelPath: '/models/osiris-rex/OSIRIS-REx.glb',
      sourceUrl:
        'https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Origins%2C%20Spectral%20Interpretation%2C%20Resource%20Identification%2C%20and%20Security%20-%20Regolith%20Explorer%20%28OSIRIS-REx%29',
    },
  },
  {
    id: 'psyche',
    name: 'Psyche',
    agency: 'NASA / JPL',
    type: 'Deep-space asteroid orbiter',
    missionCategory: 'Deep-space exploration',
    missionStatus: 'En route to asteroid Psyche; arrival planned for 2029',
    description:
      'Solar-electric spacecraft on a cruise to investigate the metal-rich asteroid Psyche.',
    missionPurpose:
      'Study asteroid Psyche using imaging, magnetic-field measurements, and gamma-ray/neutron spectroscopy.',
    destination: 'Asteroid Psyche',
    mass: 2600,
    power: 1200,
    communication: 'Deep-space high-gain communications',
    propulsionSystem: 'Solar-electric propulsion; simplified power and thrust trade-off in this game',
    powerSystem: 'Solar arrays',
    instruments: ['Multispectral imager', 'Magnetometer', 'Gamma Ray and Neutron Spectrometer'],
    reliability: 89,
    cost: 3800,
    accent: '#e879f9',
    missionSourceUrl: 'https://science.nasa.gov/mission/psyche/',
    gameplayNote:
      'Mass, power, reliability, and cost are rounded gameplay values, not Psyche flight specifications. Solar-electric propulsion, asteroid orbit insertion, and science operations are not separately simulated.',
    assetAttribution: 'NASA',
    assetUsageNotes:
      'No mission-specific Psyche model was verified in the inspected NASA-3D-Resources catalog; the builder remains usable without a 3D model.',
    model: {
      format: 'unavailable',
      sourceUrl: 'https://github.com/nasa/NASA-3D-Resources',
      reason:
        'No mission-specific Psyche model was verified in the inspected NASA 3D Resources catalog.',
    },
  },
  {
    id: 'lucy',
    name: 'Lucy',
    agency: 'NASA / Southwest Research Institute',
    type: 'Multiple-asteroid flyby spacecraft',
    missionCategory: 'Asteroid flyby exploration',
    missionStatus: 'Active; en route to planned asteroid encounters',
    description:
      'Long-duration mission that will perform flybys of main-belt and Jupiter Trojan asteroids.',
    missionPurpose:
      'Study multiple small bodies during close flybys; Lucy does not routinely enter asteroid orbit.',
    destination: 'Main-belt and Jupiter Trojan asteroids',
    mass: 1800,
    power: 1000,
    communication: 'Deep-space high-gain communications',
    propulsionSystem: 'Cruise propulsion and trajectory corrections; simplified in this game',
    powerSystem: 'Solar arrays',
    instruments: ['L’Ralph', 'L’LORRI', 'L’TES'],
    reliability: 90,
    cost: 3400,
    accent: '#f472b6',
    missionSourceUrl: 'https://science.nasa.gov/mission/lucy/',
    gameplayNote:
      'Mass, power, reliability, and cost are rounded gameplay values, not Lucy flight specifications. Multi-target trajectory design, flyby timing, and observation scheduling are not simulated.',
    assetAttribution: 'NASA',
    assetUsageNotes:
      'No mission-specific Lucy model was verified in the inspected NASA-3D-Resources catalog; the builder remains usable without a 3D model.',
    model: {
      format: 'unavailable',
      sourceUrl: 'https://github.com/nasa/NASA-3D-Resources',
      reason:
        'No mission-specific Lucy model was verified in the inspected NASA 3D Resources catalog.',
    },
  },
  {
    id: 'landsat-9',
    name: 'Landsat 9',
    agency: 'NASA / USGS',
    type: 'Earth-observation satellite',
    missionCategory: 'Earth observation',
    missionStatus: 'Operational in Earth orbit',
    description:
      'Operational land-imaging mission extending the Landsat record with optical and thermal observations.',
    missionPurpose:
      'Collect multispectral land imagery using the Operational Land Imager 2 and Thermal Infrared Sensor 2.',
    destination: 'Earth orbit',
    mass: 2800,
    power: 1300,
    communication: 'Earth-orbit data downlink',
    propulsionSystem: 'Earth-orbit station-keeping; simplified in this game',
    powerSystem: 'Solar arrays',
    instruments: ['Operational Land Imager 2 (OLI-2)', 'Thermal Infrared Sensor 2 (TIRS-2)'],
    reliability: 93,
    cost: 2800,
    accent: '#4ade80',
    missionSourceUrl: 'https://science.nasa.gov/mission/landsat-9/',
    gameplayNote:
      'Mass, power, reliability, and cost are rounded gameplay values, not Landsat 9 flight specifications. Observation scheduling, image resolution, data volume, and ground-station access are not simulated.',
    assetAttribution: 'NASA / USGS',
    assetUsageNotes:
      'NASA publishes a Landsat 9 printable 3D model, but a compatible direct model file was not verified or integrated. The builder remains usable without it.',
    model: {
      format: 'unavailable',
      sourceUrl: 'https://science.nasa.gov/3d-resources/landsat-9/',
      reason:
        'NASA lists a Landsat 9 printable STL model; a compatible direct file was not verified for the application’s model loader.',
    },
  },
]

export const availableSpacecraftCatalog = spacecraftCatalog.filter(
  (spacecraft): spacecraft is SpacecraftSpec & {
    model: SpacecraftGlbModel | SpacecraftStlModel
  } => spacecraft.model.format !== 'unavailable',
)

export const destinations: DestinationOption[] = [
  {
    id: 'moon',
    label: 'Moon',
    distance: '384,400 km',
    environment: 'Lunar orbit + polar terrain',
    risk: 15,
    transfer: '3-5 days',
  },
  {
    id: 'mercury',
    label: 'Mercury',
    distance: 'Varies by date',
    environment: 'Extreme solar heating + high radiation',
    risk: 55,
    transfer: 'Preliminary estimate only',
  },
  {
    id: 'venus',
    label: 'Venus',
    distance: 'Varies by date',
    environment: 'Dense atmosphere + high surface temperature',
    risk: 38,
    transfer: 'Preliminary estimate only',
  },
  {
    id: 'mars',
    label: 'Mars',
    distance: '54.6M km',
    environment: 'Dust storms + cold desert',
    risk: 38,
    transfer: '6-8 months',
  },
  {
    id: 'europa',
    label: 'Europa',
    distance: '628M km',
    environment: 'Radiation-heavy ice shell',
    risk: 62,
    transfer: '2-5 years',
  },
  {
    id: 'saturn',
    label: 'Saturn',
    distance: '1.2B km',
    environment: 'Cryogenic, deep-space conditions',
    risk: 71,
    transfer: '6-8 years',
  },
  {
    id: 'uranus',
    label: 'Uranus',
    distance: 'Varies by date',
    environment: 'Cold ice giant + long-duration cruise',
    risk: 76,
    transfer: 'Preliminary estimate only',
  },
  {
    id: 'neptune',
    label: 'Neptune',
    distance: 'Varies by date',
    environment: 'Distant ice giant + long-duration cruise',
    risk: 80,
    transfer: 'Preliminary estimate only',
  },
  {
    id: 'earth-orbit',
    label: 'Earth orbit',
    distance: '400 km',
    environment: 'Low-orbit imaging corridor',
    risk: 8,
    transfer: '90 minutes',
  },
  {
    id: 'asteroid-planning',
    label: 'Asteroid observation planning target',
    distance: 'Not calculated',
    environment: 'Notional small-body characterization exercise',
    risk: 48,
    transfer: 'No intercept or trajectory calculated',
  },
]

export const propulsionOptions: PropulsionOption[] = [
  {
    id: 'chemical',
    label: 'Chemical',
    efficiency: 72,
    cost: 45,
    description: 'High thrust, proven, and reliable for launch and orbital insertion.',
  },
  {
    id: 'ion',
    label: 'Ion electric',
    efficiency: 84,
    cost: 66,
    description: 'Extremely efficient propulsion for long-duration interplanetary missions.',
  },
  {
    id: 'nuclear',
    label: 'Nuclear thermal',
    efficiency: 88,
    cost: 90,
    description: 'Highest energy density for deep-space travel and heavy payload delivery.',
  },
]
