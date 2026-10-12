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
  description: string
  missionPurpose: string
  destination: string
  mass: number
  power: number
  communication: string
  reliability: number
  cost: number
  accent: string
  model: SpacecraftModel
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
    model: {
      format: 'unavailable',
      sourceUrl: 'https://science.nasa.gov/3d-resources/',
      reason:
        'No downloadable NASA/JPL 3D model for Lunar Pathfinder could be verified in the official NASA 3D Resources catalog.',
    },
  },
]

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
