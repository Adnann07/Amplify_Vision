export interface SpaceWeatherScenario {
  title: string
  briefing: string
  sourceTime: string | null
  decisions: { id: string; label: string; feedback: string }[]
  simulationNotice: string
}

export function createSpaceWeatherScenario(input: {
  alertMessage: string | null
  alertTime: string | null
  latestKp: number | null
}): SpaceWeatherScenario {
  const elevated = input.latestKp !== null && input.latestKp >= 5
  const hasAlert = Boolean(input.alertMessage)
  return {
    title: 'Space-weather operations review',
    briefing: [
      hasAlert ? 'A NOAA alert is available for review.' : 'No current NOAA alert is available in the retrieved feed.',
      input.latestKp === null
        ? 'A recent planetary K-index measurement is unavailable.'
        : `The latest retrieved planetary K-index is ${input.latestKp} on the 0–9 scale${elevated ? ', an elevated index' : ''}.`,
      'Decide what evidence and response are appropriate without inferring spacecraft-specific effects.',
    ].join(' '),
    sourceTime: input.alertTime,
    simulationNotice: 'Educational decision exercise only. NOAA observations and forecasts do not establish an effect on any particular spacecraft; no spacecraft impact or mission penalty is simulated.',
    decisions: [
      {
        id: 'verify',
        label: 'Review NOAA details and seek spacecraft-specific evidence before changing operations',
        feedback: 'Good evidence discipline: a public alert or K-index measurement alone cannot establish a spacecraft-specific effect.',
      },
      {
        id: 'monitor',
        label: 'Continue routine monitoring and re-evaluate as verified information changes',
        feedback: 'A proportionate approach. Keep measured observations, forecasts, and mission-specific telemetry distinct.',
      },
      {
        id: 'precaution',
        label: 'Plan a reversible precaution, but wait for mission-specific evidence before applying it',
        feedback: 'A reversible contingency can be planned, while avoiding an unsupported claim that the spacecraft is affected.',
      },
    ],
  }
}
