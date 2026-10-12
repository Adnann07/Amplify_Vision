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
    'Keep the spacecraft within the mission mass limit.',
    'Keep spacecraft and launch costs within the mission budget.',
    'Choose a launch vehicle whose payload capacity can carry your spacecraft.',
  ],
  avatarPath: '/models/advanced-crew-escape-suit.glb',
  sourceUrl: 'https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/',
  sourceLabel: 'NASA 3D Resources — Advanced Crew Escape Suit',
}
