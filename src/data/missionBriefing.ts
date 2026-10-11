export interface MissionBriefing {
  id: string
  title: string
  missionName: string
  difficulty: 'Easy' | 'Moderate' | 'Challenging'
  dialogueStages: string[]
  objectives: string[]
  avatarPath: string
  sourceUrl: string
  sourceLabel: string
}

export const earthObservationBriefing: MissionBriefing = {
  id: 'earth-observation',
  title: 'Mission Director',
  missionName: 'Eyes on Earth',
  difficulty: 'Moderate',
  dialogueStages: [
    'Welcome, Engineer. Your first assignment is an Earth observation mission.',
    'You have limited budget, launch mass, and power. Design a spacecraft capable of completing the mission while making smart engineering decisions.',
  ],
  objectives: [
    'Observe Earth',
    'Stay within the 5,000 kg mass limit',
    'Meet the required power',
    'Stay within budget',
  ],
  avatarPath: '/models/advanced-crew-escape-suit.glb',
  sourceUrl: 'https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/',
  sourceLabel: 'NASA 3D Resources — Advanced Crew Escape Suit',
}
