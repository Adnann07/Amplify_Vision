# React + TypeScript + Vite

## Spacecraft assembly prototype

Use **Build / Edit** to add or remove solar panels, an antenna, an engine, and a science instrument, or change their types. The attached assembly updates in the 3D viewer. Payload, propellant, module choices, destination, and propulsion feed live mass, power, delta-v, communication, science, cost, and design warnings.

Spacecraft appear assembled by default. Use **Disassemble** in the viewer to spread the installed parts apart for inspection; **Assemble** restores their normal positions.

These are intentionally lightweight planning estimates, not flight dynamics. Solar panels provide 500, 1,000, or 1,500 W by size. Payload increases mass and science score, propellant and engine selection determine estimated delta-v, and installed modules affect mass and mission cost.

The home screen offers **Mission Mode** and **Freeplay Mode**. Mission Mode opens the Level 1 campaign selection and the introductory Earth-orbit briefing before entering the existing spacecraft builder. Campaign mission definitions live in `src/data/campaign.ts`; the roadmap displays later levels as in development rather than presenting them as playable.

Freeplay retains the spacecraft, component, destination, propulsion, telemetry, and sustainability controls. Its optional reference objective does not impose campaign requirements. Players can go straight to launch vehicle selection without testing a design; payload and configured spending-target warnings remain advisory.

In Mission Mode, **Test Mission** shows the live mission requirements. A design can still proceed to launch vehicle selection after testing even when requirements are unmet. The launch screen displays risk and configuration warnings, but does not block a launch attempt because of mission requirements, payload capacity, or budget.

The launch-vehicle screen offers Small, Medium, and Heavy fictional launchers with real-time 3D previews that match the launch sequence. The Heavy Launcher uses the locally stored, optimized NASA SLS model; Small and Medium use detailed generic 3D vehicle assemblies, not specific real-world rockets. Their payload capacities (1,500 / 5,000 / 15,000 kg) and launch costs ($60M / $100M / $180M) are simplified game-balancing values, not real-world rocket specifications. Values are centralized in `src/data/launchVehicles.ts` for later replacement. Available payload is calculated from the live configured launch mass, and launch cost is added to spacecraft and other mission costs before checking the configured and mission-specific budget limits. The selected vehicle and cost are retained in the mission results.

The **Sustainability choices** panel exposes reusable/disposable propulsion, modular/integrated architecture, spare-parts policy, and an Earth-orbit end-of-life strategy. Their mass and cost deltas feed telemetry and mission checks; reliability and resource efficiency update live, with a qualitative sustainability assessment in mission results.

The introductory mission uses the existing Earth Observation requirements and launch assessment. Its briefing explains the primary objective, $2,600M budget, 5,000 kg spacecraft limit, and launch-vehicle payload capacity. Mission requirements and the deterministic launch outcome are derived from the actual spacecraft configuration and selected vehicle. A successful launch does not mark the mission complete; the current simulator does not model orbital operations or science-data collection, and campaign completion persistence is not implemented.

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
