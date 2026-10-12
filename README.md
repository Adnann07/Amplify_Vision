# React + TypeScript + Vite

## Spacecraft assembly prototype

Use **Build / Edit** to add or remove solar panels, an antenna, an engine, and a science instrument, or change their types. The attached assembly updates in the 3D viewer. Payload, propellant, module choices, destination, and propulsion feed live mass, power, delta-v, communication, science, cost, and design warnings.

Spacecraft appear assembled by default. Use **Disassemble** in the viewer to spread the installed parts apart for inspection; **Assemble** restores their normal positions.

These are intentionally lightweight planning estimates, not flight dynamics. Solar panels provide 500, 1,000, or 1,500 W by size. Payload increases mass and science score, propellant and engine selection determine estimated delta-v, and installed modules affect mass and mission cost.

The home screen offers **Mission Mode** and **Freeplay Mode**. Mission Mode contains 27 playable, data-driven campaign missions across training, Earth observation, communications, astronomy, lunar exploration, planetary science, asteroid investigation, and deep-space technology. Campaign missions use the existing spacecraft builder, instrument types, supported destinations, launch vehicles, deterministic launch outcomes, mission requirements, and campaign scoring; they do not simulate new orbital or surface science mechanics. Catalogue templates and their sequential unlock prerequisites live in `src/data/campaign.ts`, with engineering thresholds in `src/data/missionGoals.ts`. The original `first-flight` and `lunar-survey` IDs and saved results are retained. A completed mission unlocks the following flight; the campaign access code can still unlock all missions without marking objectives complete.

The spacecraft registry keeps spacecraft separate from launch vehicles and orbital infrastructure. The original Voyager, Cassini, Europa Clipper, and ISS models are preserved; compatible catalog additions include Perseverance, OSIRIS-REx, JWST, Parker Solar Probe, Juno, Roman, Ingenuity, Landsat 8, and DSCOVR. The builder's spacecraft dropdown contains only presets with verified model files, and campaign exercises select their recommended spacecraft. The NASA-3D-Resources README describes its assets as free and without copyright and links to NASA usage guidance. The heavy launch-vehicle option uses NASA's SLS Block 1 STL model; payload capacity and cost remain game-balancing values. Added preset mass, power, reliability, and cost values are rounded gameplay abstractions, not flight specifications. Webb/Roman L2 operations, Parker solar passes and thermal loads, Juno orbit insertion and radiation, Ingenuity flight, rover landing and surface operations, sample return, asteroid orbit insertion, Lucy encounter sequencing, Landsat image performance, and DSCOVR L1 operations are not independently simulated. Each new mission briefing links its NASA mission reference and identifies relevant simulation limits.

The flight-program catalogue renders every mission in a responsive card list and includes search, category, and difficulty filters. Locked flights remain visible with the specific previous mission needed to unlock them. Search and filters only affect the current view; clearing them restores the full catalogue. Asteroid intercepts, spacecraft-specific space-weather effects, and lander/surface-operation mechanics are not simulated. Real-Time Events offers explicitly labeled Earth-observation, space-weather readiness, and notional asteroid-characterization design exercises using only the existing engineering workflow.

Freeplay retains the spacecraft, component, destination, propulsion, telemetry, and sustainability controls. Its optional reference objective does not impose campaign requirements. Players can go straight to launch vehicle selection without testing a design; payload and configured spending-target warnings remain advisory.

## JPL Horizons planetary planner

The builder includes a date-based heliocentric planetary map backed by the official [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) (`https://ssd.jpl.nasa.gov/api/horizons.api`). It requests planet-center vectors with `CENTER=@sun`, `EPHEM_TYPE=VECTORS`, `TIME_TYPE=UT`, the ecliptic J2000 reference plane, `OUT_UNITS=AU-D`, and vector table 2. The selected input date is interpreted at 00:00 UT; Horizons supplies the vector timestamp in TDB. The map compresses radial distance logarithmically for readability and explicitly is not to scale.

Selecting a planetary body in Freeplay can update the actual game destination. Jupiter now has its own planetary-center destination for Jupiter-system planning. Europa can still use Jupiter’s planetary position as a clearly labeled proxy; that does not calculate Europa’s position or replace its mission requirements. Campaign missions can inspect positions but retain their prescribed destination. The chosen UTC date and available matching-date planetary vectors are captured in each launch record. Ephemeris availability never changes deterministic launch outcomes, campaign objectives, scores, or progression, and the game remains playable if Horizons is unavailable.

Browser and in-memory caches use date- and query-specific keys and a 30-day freshness window. When a refresh fails, matching-date cached data can still be used and its source is labeled; missing data is reported without blocking gameplay. A preliminary Earth-to-planet Hohmann estimate is shown only when matching-date vectors are available. It assumes circular, coplanar heliocentric orbits and instantaneous planetary radii; it excludes planet departure/arrival, inclination, gravity assists, vehicle constraints, and trajectory optimization. It is an educational comparison, **not** a launch window, flight plan, “optimal” date, or game launch requirement. Moon and Earth-orbit gameplay targets do not use this interplanetary estimator.

Planetary ephemerides are provided by NASA’s Jet Propulsion Laboratory Solar System Dynamics group. NASA/JPL are not affiliated with, do not endorse, and are not responsible for this game.

The browser calls a same-origin `/api/horizons` route to avoid cross-origin restrictions on JPL’s API. Vite proxies that route during `npm run dev`; production uses the included Node server, which serves `dist` and forwards only validated planetary target/date requests to JPL. For a production run, use `npm run build` followed by `npm start` (or set `PORT` to the hosting platform’s assigned port). Static-only hosting must provide an equivalent same-origin serverless proxy; direct browser calls to Horizons are blocked by CORS.

In Mission Mode, **Test Mission** shows the live mission requirements. A design can still proceed to launch vehicle selection after testing even when requirements are unmet. The launch screen displays risk and configuration warnings, but does not block a launch attempt because of mission requirements, payload capacity, or budget.

The launch-vehicle screen offers Small, Medium, and NASA SLS Block 1 with real-time 3D previews that match the launch sequence. The SLS option loads NASA's original Block 1 STL mesh through Three.js `STLLoader`; Small and Medium use detailed generic 3D vehicle assemblies, not specific real-world rockets. The displayed payload capacities (1,500 / 5,000 / 15,000 kg) and launch costs ($60M / $100M / $180M) are simplified game-balancing values, not real-world rocket specifications. Values are centralized in `src/data/launchVehicles.ts` for later replacement. Available payload is calculated from the live configured launch mass, and launch cost is added to spacecraft and other mission costs before checking the configured and mission-specific budget limits. The selected vehicle and cost are retained in the mission results.

The **Sustainability choices** panel exposes reusable/disposable propulsion, modular/integrated architecture, spare-parts policy, and an Earth-orbit end-of-life strategy. Their mass and cost deltas feed telemetry and mission checks; reliability and resource efficiency update live, with a qualitative sustainability assessment in mission results.

## Mission Control operations

After a successful launch sequence deploys the selected spacecraft, **Enter Mission Control** opens a persistent operations workspace with the selected model, recorded spacecraft build, mission objective, launch vehicle, and an elapsed simulation clock. Its Overview, Telemetry, Commands, Observation Console, Science Data, Events, and Mission Settings tabs use one saved session; the URL supports browser back/forward, and the mission overview offers a resume action without discarding operations progress.

Mission Control is an explicitly illustrative deterministic model, not live NASA telemetry or a flight-dynamics simulation. The clock advances 15 simulated seconds per real second; battery capacity is modeled as 1,200 Wh, with charge updated from the launch record's power output and the modeled system/instrument load. Science observations use scheduled three-minute windows starting at MET 5 minutes and repeating every 20 minutes; communications contacts run from minute 4 up to, but not including, minute 7 of each 10-minute cycle. An observation stores 128 MB, with instrument temperature, power-saving mode, storage, and queued downlinks managed by the same state engine. The Observation Console separates simulated observations and downlinks from archived provider imagery: Landsat spacecraft can search date- and region-specific USGS Landsat Collection 2 scenes, DSCOVR can display date-specific full-disk NASA EPIC images, and supported planetary targets can show filtered NASA archive reference images. Its onboard viewport renders a date-specific global NASA GIBS MODIS Terra image on a Three.js Earth sphere; the synthetic camera subpoint follows Mission Elapsed Time and pointing/FOV controls change the rendered view. The selected GIBS date is an imagery-layer date, not a simulated-spacecraft acquisition. Orbit, attitude, and camera are illustrative and not actual flight telemetry; archived/reference imagery remains separately labeled. Mission Control completion does not declare campaign success; the existing campaign assessment remains separate.

Observation imagery uses same-origin `/api/observations/landsat`, `/api/observations/epic`, and `/api/observations/planetary` routes in Vite development and the Node production server. The server only contacts fixed USGS/NASA HTTPS endpoints, validates target/date inputs and image hosts, and caches metadata responses for 30 minutes. Landsat searches a 30-day window ending on the selected date and retains each scene's actual provider acquisition timestamp, platform/instrument, processing level, cloud percentage, and pixel size when reported. The Landsat archive's separate regional NASA GIBS MODIS reference layer remains available in the archive details; it is not a Landsat scene preview or an image captured by the simulated spacecraft. NASA Images `date_created` is shown only as a catalog-record date, not an image acquisition time. EPIC is identified as imagery from the NOAA DSCOVR spacecraft and is shown only as a full-disk Earth reference, not as a ground-target image or a live game feed. Planetary reference images are filtered to the selected body, provider text indicating an observation, and obvious artist renderings; if no suitable record is returned, no unrelated fallback image is shown. NASA imagery providers remain independent from the simulated onboard data queue and its power, storage, and downlink model.

Campaign launch outcomes remain separate from mission completion. After a successful launch, the player runs a recorded-design assessment against the selected mission’s existing engineering requirements. It does not simulate orbital mechanics or science-data collection: the primary objective is achieved only when the actual launch succeeds and every mission requirement passes. A successful animation alone never unlocks a level. A failed launch or missed design constraint produces a scored report with the measured values, recommendations, and a retry path.

Mission scoring is configured per campaign mission and totals 100 points: primary objective 40, engineering compliance 20, budget efficiency 15, resource efficiency 10, science capability 10, and one optional resource-efficiency objective 5. The Earth-imaging objective additionally requires the configured survey camera; the lunar survey uses its two-instrument requirement. Constraint values and score formulas are displayed in the performance report. Tiers are Outstanding (90–100), Strong (75–89), Partial success (60–74), and Needs improvement (below 60). Mission completion depends on the objective, not the score tier, so any achieved primary objective unlocks the next eligible mission. Best scores and the last 100 campaign attempts are saved in browser `localStorage` under `amplify-vision-campaign-progress-v1`; invalid saved data is reported and reset. Freeplay remains separate from campaign progress.

Mission briefings request optional, mission-specific reference imagery from NASA’s public [Images and Video Library](https://images.nasa.gov/) search API (`images-api.nasa.gov/search`). The app validates image URLs and response fields, caches imagery in browser storage for 24 hours, and shows a non-blocking fallback if the API or image is unavailable. NASA creator/center metadata is displayed beside each image. Images are informational only and never affect gameplay, scoring, or progression. See NASA’s [API documentation](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf).

The briefing character uses NASA's downloadable Advanced Crew Escape Suit GLB from the [official NASA 3D Resources page](https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/). NASA attribution and asset format are documented in [MODEL_SOURCES.md](./MODEL_SOURCES.md).

## NASA Mission Control assistant

The optional Mission Control chat answers general questions with Groq and discovers live NASA Earthdata tools from the official Streamable HTTP MCP endpoint (`https://cmr.earthdata.nasa.gov/mcp/v1`). Dataset questions use the tools currently advertised by NASA's server; lookup results and their validated NASA/DOI source links are returned separately from general AI explanations. Earthdata discovery is not trajectory or spacecraft-performance analysis, and the assistant cannot change or launch a game design.

For local development, copy `.env.example` to `.env` and set `GROQ_API_KEY` there. `.env` is git-ignored and the unprefixed key is used only by the Node/Vite server, never by browser code. Run `npm run dev`; the chat API is served by Vite's same-origin middleware. Production uses the existing Node server (`npm run build` then `npm start`) and requires `GROQ_API_KEY` in the hosting environment's private secret settings. No hosting provider is configured in this repository, so production secrets must be added to whichever provider deploys the Node server. Static-only hosting is not sufficient for the private Groq key or this API; deploy the Node server or an equivalent server-side route.

The backend queries Groq's authenticated models endpoint and prefers `openai/gpt-oss-20b` when available, falling back only to documented tool-capable models present in the account. NASA tool names and schemas are discovered at runtime. Conversations are not persisted; request size, concurrency, tool iterations, and per-client request rates are bounded.

## NOAA Space Weather

The Space Weather dashboard is available throughout the game beside Mission Control. Its same-origin Node service retrieves three fixed NOAA Space Weather Prediction Center feeds:

- `GET /api/space-weather/alerts` — NOAA alert records with `product_id`, `issue_datetime`, and the published message.
- `GET /api/space-weather/k-index` — planetary K-index records with `time_tag`, `Kp`, `a_running`, and `station_count`.
- `GET /api/space-weather/forecast` — the `SWPC-Forecast` product, including its `issued` time, `units`, and dated `data` measurements for `ap` and `f107`.
- `GET /api/space-weather/summary` — a partial-success summary of all three feeds.
- `GET /api/space-weather/status` — each feed's last successful retrieval, current cache state, and latest error.

Select **Refresh feeds** to request fresh upstream data with `/api/space-weather/summary?refresh=1`. Otherwise the server applies per-feed in-memory caching, coalesces concurrent requests, times out slow calls, validates known record shapes and units, limits response sizes, and returns clearly marked stale cached data for up to 24 hours if refresh fails. NOAA access requires no NASA or other API key. The server only contacts the three fixed HTTPS NOAA endpoints; clients cannot supply upstream URLs.

The dashboard shows expandable alert messages, measured planetary Kp values on a 0–9 dimensionless scale, and the forecast product's Ap (nT) and F10.7 (sfu) values with its issue time. It labels observations separately from forecasts and shows each feed's live, cached, stale, or unavailable state. NOAA SWPC endpoints were live-checked during development: alerts returned an array of `{product_id, issue_datetime, message}` records; planetary K-index returned an array of `{time_tag, Kp, a_running, station_count}` records; and the 45-day forecast returned an object with `type`, `issued`, `product`, `metadata`, `units`, and a `data` array of `{time, metric, value}` records. The observed forecast units were Ap `nT` and F10.7 `sfu`. These endpoint checks are separate from automated tests, which use fixtures and do not require NOAA availability.

The existing Mission Control assistant retrieves these NOAA feeds server-side only when a user asks about current space weather. It receives bounded results with per-feed status and timestamps, and answers include the corresponding official NOAA sources. If a feed is stale or unavailable, that state is included rather than presented as live data. NASA Earthdata MCP discovery and Groq chat behavior remain in place.

The optional readiness exercise uses the currently retrieved alert and Kp values as context, is deterministic, makes no spacecraft-specific impact claims, and does not add a separate game score or change campaign progression. Alerts do not prove a particular vehicle is affected; Kp is not a radiation dose or damage measurement. Ap and F10.7 in the NOAA 45-day product are forecasts, not observations.

Attribution: [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/), including the [alerts feed](https://services.swpc.noaa.gov/products/alerts.json), [planetary K-index feed](https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json), and [45-day forecast feed](https://services.swpc.noaa.gov/json/45-day-forecast.json). NASA imagery, JPL Horizons, and NASA Earthdata integrations are independent and do not require NOAA configuration.

## Real-Time Events

The **Live Events** board turns validated provider records into optional, deterministic design exercises in the existing campaign workflow. It uses three fixed upstream sources; no API key or user-supplied URL is accepted:

- NOAA SWPC alerts: `https://services.swpc.noaa.gov/products/alerts.json`. Only recent, recognized, non-cancelled alerts can create a space-weather readiness exercise. Alert text is context only; the game does not model spacecraft-specific space-weather effects.
- NASA EONET v3: `https://eonet.gsfc.nasa.gov/api/v3/events`. The service requests open events from the recent 30-day window and retains supported storm, wildfire, volcano, flood, drought, and sea/lake-ice categories with usable geometry. An event's reported geometry does not prove spacecraft access, image coverage, or sensor capability.
- NASA/JPL SBDB Close-Approach Data API: `https://ssd-api.jpl.nasa.gov/cad.api`. The service requests Earth asteroid close approaches (`kind=a`) within 0.05 au over the next 45 days, including full object names and available diameter data. It maps positional rows using the API's `fields` array. Distance is in au, relative velocity in km/s, diameter and its 1-sigma uncertainty in km, and distance bounds are the API's 3-sigma minimum/maximum. The provider's close-approach calendar time is TDB, so it is displayed and preserved as TDB rather than converted or mislabeled as UTC. A close approach is not an intercept opportunity.

Same-origin routes are available in both Vite development and the production Node server: `GET /api/real-time-events`, `GET /api/real-time-events/status`, `POST /api/real-time-events/refresh`, and `GET /api/real-time-events/:provider/:providerEventId` to verify an eligible record before creating an exercise. Optional list filters are `category`, `provider`, `search`, and a bounded `limit` (1–500). Providers are fetched independently, concurrent requests are coalesced, responses are schema-checked and size-limited, and fixed HTTPS hosts, timeouts, status, and errors are enforced. The Node service keeps an in-memory provider cache and refreshes hourly while it is running; the board also checks on entry, when it becomes visible, and on manual refresh. If a provider fails, its last good server cache can be returned as stale for up to seven days. A separate browser `localStorage` cache keeps the last board response accessible across reloads/offline periods; stale data is labeled and is not represented as live.

Selecting an eligible live event creates a deterministic mission ID and an immutable snapshot of the provider, event identity, timestamp/time scale, measurements, source fields, official link, and simulation limitations. The snapshot is saved under the existing `amplify-vision-campaign-progress-v1` campaign key alongside (not instead of) the original completed missions, best scores, and attempts. Older version-1 saves are migrated in memory with an empty event-mission list; malformed event snapshots and only their dependent event progress are discarded with a warning. Event exercises use the existing mission briefing, spacecraft builder, launch vehicle, launch outcome, operations, scoring, and results flow. Launch success alone does not complete an objective.

Live-data facts are kept separate from simulated assessment: EONET exercises use existing Earth-observation requirements; NOAA exercises use existing Earth-orbit engineering constraints; JPL exercises are labeled notional small-body characterization and use an explicit planning-only destination. This game does not calculate asteroid orbits/intercepts, launch windows, Earth-event image coverage, or spacecraft-specific weather impacts. Manual refresh, filtering, and exercise creation do not grant campaign access-code unlocks or bypass the normal scoring/progression checks. Automated tests use fixture data; live provider checks are separate and do not run as part of the test suite.

Official references: [NASA EONET API v3 documentation](https://eonet.gsfc.nasa.gov/docs/v3), [NASA/JPL SBDB CAD API documentation](https://ssd-api.jpl.nasa.gov/doc/cad.html), and the NOAA alert source above.

Verified spacecraft model sources, formats, and availability are documented in [MODEL_SOURCES.md](./MODEL_SOURCES.md). Assembly editing is disabled when an official model is unavailable; the viewer never substitutes another mission's model.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
