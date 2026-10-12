export interface MissionBriefing {
  id: string
  level: number
  title: string
  missionName: string
  difficulty: 'Easy' | 'Moderate' | 'Challenging'
  scenario: string
  dialogueStages: string[]
  objectives: string[]
  avatarPath: string
  sourceUrl: string
  sourceLabel: string
  nasaImageQuery: string
}

export const earthObservationBriefing: MissionBriefing = {
  id: 'earth-observation',
  level: 1,
  title: 'Mission 01: First Flight',
  missionName: 'Eyes on Earth',
  difficulty: 'Easy',
  scenario: 'A small science payload must be placed in low Earth orbit to image our planet and send observations back to mission control.',
  dialogueStages: [
    'Welcome, Engineer. Your first assignment is to put an Earth-imaging spacecraft into low orbit.',
    'For this flight, focus on the mission objective, the available budget, and whether your chosen rocket can carry the spacecraft. Other telemetry is available for review, but these are the first trade-offs to learn.',
  ],
  objectives: [
    'Primary objective: deploy an imaging spacecraft in low Earth orbit.',
    'Equip the spacecraft with a survey camera for the imaging objective.',
    'Keep the spacecraft within the mission mass limit.',
    'Keep spacecraft and launch costs within the mission budget.',
    'Choose a launch vehicle whose payload capacity can carry your spacecraft.',
  ],
  avatarPath: '/models/advanced-crew-escape-suit.glb',
  sourceUrl: 'https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/',
  sourceLabel: 'NASA 3D Resources — Advanced Crew Escape Suit',
  nasaImageQuery: 'NASA Earth observation satellite',
}

export const lunarSurveyBriefing: MissionBriefing = {
  id: 'lunar-survey',
  level: 2,
  title: 'Mission 02: Lunar Survey',
  missionName: 'Lunar Reconnaissance',
  difficulty: 'Moderate',
  scenario: 'A compact spacecraft must reach lunar orbit with enough power, propulsion, communications, and instruments to support a terrain survey.',
  dialogueStages: [
    'Your next assignment is a lunar survey. The spacecraft must carry two science instruments and retain enough propulsion and communications capability for the mission profile.',
    'Review the mass and cost trade-offs carefully. Reaching orbit is only the launch milestone; the recorded spacecraft design must also satisfy this mission’s requirements.',
  ],
  objectives: [
    'Primary objective: deliver a survey-ready spacecraft for lunar reconnaissance.',
    'Provide at least 500 W, 2.0 km/s Delta-V, and 60% communication capability.',
    'Carry at least two science instruments and remain within the $3,000M mission budget.',
    'A successful launch alone does not complete the lunar survey objective.',
  ],
  avatarPath: '/models/advanced-crew-escape-suit.glb',
  sourceUrl: 'https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/',
  sourceLabel: 'NASA 3D Resources — Advanced Crew Escape Suit',
  nasaImageQuery: 'Lunar Reconnaissance Orbiter Moon',
}
