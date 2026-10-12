import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { createSpaceWeatherHandler, createSpaceWeatherService } from './server/space-weather.mjs'
import { createMissionControlHandler } from './server/mission-control.mjs'
import { createObservationImageryHandler } from './server/observation-imagery.mjs'
import { createRealTimeEventsHandler, createRealTimeEventsService } from './server/real-time-events.mjs'

const spaceWeatherService = createSpaceWeatherService()
const missionControlHandler = createMissionControlHandler({
  getSpaceWeatherSummary: (options?: { force?: boolean }) => spaceWeatherService.getSummary(options),
})
const observationImageryHandler = createObservationImageryHandler()
const spaceWeatherHandler = createSpaceWeatherHandler({ service: spaceWeatherService })
const realTimeEventsHandler = createRealTimeEventsHandler({
  service: createRealTimeEventsService({ spaceWeatherService }),
})

function missionControlApi(): Plugin {
  return {
    name: 'mission-control-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (new URL(request.url ?? '/', 'http://vite.local').pathname !== '/api/mission-control/chat') {
          next()
          return
        }
        void missionControlHandler(request, response)
      })
    },
  }
}

function spaceWeatherApi(): Plugin {
  return {
    name: 'space-weather-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!new URL(request.url ?? '/', 'http://vite.local').pathname.startsWith('/api/space-weather/')) {
          next()
          return
        }
        void spaceWeatherHandler(request, response)
      })
    },
  }
}

function realTimeEventsApi(): Plugin {
  return {
    name: 'real-time-events-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!new URL(request.url ?? '/', 'http://vite.local').pathname.startsWith('/api/real-time-events')) {
          next()
          return
        }
        void realTimeEventsHandler(request, response)
      })
    },
  }
}

function observationImageryApi(): Plugin {
  return {
    name: 'observation-imagery-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!new URL(request.url ?? '/', 'http://vite.local').pathname.startsWith('/api/observations/')) {
          next()
          return
        }
        void observationImageryHandler(request, response)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), missionControlApi(), spaceWeatherApi(), realTimeEventsApi(), observationImageryApi()],
  server: {
    proxy: {
      '/api/horizons': {
        target: 'https://ssd.jpl.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => {
          const request = new URL(path, 'http://vite.local')
          const date = request.searchParams.get('date') ?? ''
          const stopDate = new Date(`${date}T00:00:00Z`)
          stopDate.setUTCDate(stopDate.getUTCDate() + 1)
          const parameters = new URLSearchParams({
            format: 'json',
            COMMAND: request.searchParams.get('target') ?? '',
            CENTER: '@sun',
            MAKE_EPHEM: 'YES',
            EPHEM_TYPE: 'VECTORS',
            START_TIME: `'${date} 00:00'`,
            STOP_TIME: `'${stopDate.toISOString().slice(0, 10)} 00:00'`,
            TIME_TYPE: 'UT',
            STEP_SIZE: "'1 d'",
            REF_PLANE: 'ECLIPTIC',
            OUT_UNITS: 'AU-D',
            VEC_TABLE: '2',
            CSV_FORMAT: 'YES',
          })
          return `/api/horizons.api?${parameters.toString()}`
        },
      },
    },
  },
})
