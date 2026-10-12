# React + TypeScript + Vite

## Spacecraft assembly prototype

Use **Build / Edit** to add or remove solar panels, an antenna, an engine, and a science instrument, or change their types. The attached assembly updates in the 3D viewer. Payload, propellant, module choices, destination, and propulsion feed live mass, power, delta-v, communication, science, cost, and design warnings.

Spacecraft appear assembled by default. Use **Disassemble** in the viewer to spread the installed parts apart for inspection; **Assemble** restores their normal positions.

These are intentionally lightweight planning estimates, not flight dynamics. Solar panels provide 500, 1,000, or 1,500 W by size. Payload increases mass and science score, propellant and engine selection determine estimated delta-v, and installed modules affect mass and mission cost.

The home screen offers **Mission Mode** and **Freeplay Mode**. Mission Mode contains two playable, data-driven campaign missions: Earth observation and a lunar survey. Campaign mission definitions and unlock prerequisites live in `src/data/campaign.ts`; the lunar survey unlocks only after the first mission’s primary objective is achieved.

Freeplay retains the spacecraft, component, destination, propulsion, telemetry, and sustainability controls. Its optional reference objective does not impose campaign requirements. Players can go straight to launch vehicle selection without testing a design; payload and configured spending-target warnings remain advisory.

## JPL Horizons planetary planner

The builder includes a date-based heliocentric planetary map backed by the official [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) (`https://ssd.jpl.nasa.gov/api/horizons.api`). It requests planet-center vectors with `CENTER=@sun`, `EPHEM_TYPE=VECTORS`, `TIME_TYPE=UT`, the ecliptic J2000 reference plane, `OUT_UNITS=AU-D`, and vector table 2. The selected input date is interpreted at 00:00 UT; Horizons supplies the vector timestamp in TDB. The map compresses radial distance logarithmically for readability and explicitly is not to scale.

Selecting a planetary body in Freeplay can update the actual game destination. Jupiter maps to the existing Europa destination as a planetary-position proxy; that does not calculate Europa’s position or replace its mission requirements. Campaign missions can inspect positions but retain their prescribed destination. The chosen UTC date and available matching-date planetary vectors are captured in each launch record. Ephemeris availability never changes deterministic launch outcomes, campaign objectives, scores, or progression, and the game remains playable if Horizons is unavailable.

Browser and in-memory caches use date- and query-specific keys and a 30-day freshness window. When a refresh fails, matching-date cached data can still be used and its source is labeled; missing data is reported without blocking gameplay. A preliminary Earth-to-planet Hohmann estimate is shown only when matching-date vectors are available. It assumes circular, coplanar heliocentric orbits and instantaneous planetary radii; it excludes planet departure/arrival, inclination, gravity assists, vehicle constraints, and trajectory optimization. It is an educational comparison, **not** a launch window, flight plan, “optimal” date, or game launch requirement. Moon and Earth-orbit gameplay targets do not use this interplanetary estimator.

Planetary ephemerides are provided by NASA’s Jet Propulsion Laboratory Solar System Dynamics group. NASA/JPL are not affiliated with, do not endorse, and are not responsible for this game.

The browser calls a same-origin `/api/horizons` route to avoid cross-origin restrictions on JPL’s API. Vite proxies that route during `npm run dev`; production uses the included Node server, which serves `dist` and forwards only validated planetary target/date requests to JPL. For a production run, use `npm run build` followed by `npm start` (or set `PORT` to the hosting platform’s assigned port). Static-only hosting must provide an equivalent same-origin serverless proxy; direct browser calls to Horizons are blocked by CORS.

In Mission Mode, **Test Mission** shows the live mission requirements. A design can still proceed to launch vehicle selection after testing even when requirements are unmet. The launch screen displays risk and configuration warnings, but does not block a launch attempt because of mission requirements, payload capacity, or budget.

The launch-vehicle screen offers Small, Medium, and Heavy fictional launchers with real-time 3D previews that match the launch sequence. The Heavy Launcher uses the locally stored, optimized NASA SLS model; Small and Medium use detailed generic 3D vehicle assemblies, not specific real-world rockets. Their payload capacities (1,500 / 5,000 / 15,000 kg) and launch costs ($60M / $100M / $180M) are simplified game-balancing values, not real-world rocket specifications. Values are centralized in `src/data/launchVehicles.ts` for later replacement. Available payload is calculated from the live configured launch mass, and launch cost is added to spacecraft and other mission costs before checking the configured and mission-specific budget limits. The selected vehicle and cost are retained in the mission results.

The **Sustainability choices** panel exposes reusable/disposable propulsion, modular/integrated architecture, spare-parts policy, and an Earth-orbit end-of-life strategy. Their mass and cost deltas feed telemetry and mission checks; reliability and resource efficiency update live, with a qualitative sustainability assessment in mission results.

Campaign launch outcomes remain separate from mission completion. After a successful launch, the player runs a recorded-design assessment against the selected mission’s existing engineering requirements. It does not simulate orbital mechanics or science-data collection: the primary objective is achieved only when the actual launch succeeds and every mission requirement passes. A successful animation alone never unlocks a level. A failed launch or missed design constraint produces a scored report with the measured values, recommendations, and a retry path.

Mission scoring is configured per campaign mission and totals 100 points: primary objective 40, engineering compliance 20, budget efficiency 15, resource efficiency 10, science capability 10, and one optional resource-efficiency objective 5. The Earth-imaging objective additionally requires the configured survey camera; the lunar survey uses its two-instrument requirement. Constraint values and score formulas are displayed in the performance report. Tiers are Outstanding (90–100), Strong (75–89), Partial success (60–74), and Needs improvement (below 60). Mission completion depends on the objective, not the score tier, so any achieved primary objective unlocks the next eligible mission. Best scores and the last 100 campaign attempts are saved in browser `localStorage` under `amplify-vision-campaign-progress-v1`; invalid saved data is reported and reset. Freeplay remains separate from campaign progress.

Mission briefings request optional, mission-specific reference imagery from NASA’s public [Images and Video Library](https://images.nasa.gov/) search API (`images-api.nasa.gov/search`). The app validates image URLs and response fields, caches imagery in browser storage for 24 hours, and shows a non-blocking fallback if the API or image is unavailable. NASA creator/center metadata is displayed beside each image. Images are informational only and never affect gameplay, scoring, or progression. See NASA’s [API documentation](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf).

The briefing character uses NASA's downloadable Advanced Crew Escape Suit GLB from the [official NASA 3D Resources page](https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/). NASA attribution and asset format are documented in [MODEL_SOURCES.md](./MODEL_SOURCES.md).

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
