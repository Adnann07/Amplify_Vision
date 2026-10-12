# React + TypeScript + Vite

## Spacecraft assembly prototype

Use **Build / Edit** to add or remove solar panels, an antenna, an engine, and a science instrument, or change their types. The attached assembly updates in the 3D viewer. Payload, propellant, module choices, destination, and propulsion feed live mass, power, delta-v, communication, science, cost, and design warnings.

Spacecraft appear assembled by default. Use **Disassemble** in the viewer to spread the installed parts apart for inspection; **Assemble** restores their normal positions.

These are intentionally lightweight planning estimates, not flight dynamics. Solar panels provide 500, 1,000, or 1,500 W by size. Payload increases mass and science score, propellant and engine selection determine estimated delta-v, and installed modules affect mass and mission cost.

Choose Mars Flyby, Europa Reconnaissance, Lunar Survey, or Earth Observation in **Mission selection** to see live requirements and readiness. **Test Mission** lists unmet criteria; after testing, use **Select Launch Vehicle** to compare payload capacity, remaining capacity, and cost before launching. Instrument count can be adjusted from one to four in Build / Edit.

The launch-vehicle screen offers Small, Medium, and Heavy fictional launchers. Their payload capacities (1,500 / 5,000 / 15,000 kg) and launch costs ($60M / $100M / $180M) are simplified game-balancing values, not real-world rocket specifications. Values are centralized in `src/data/launchVehicles.ts` for later replacement. Available payload is calculated from the live configured launch mass, and launch cost is added to spacecraft and other mission costs before checking the configured and mission-specific budget limits. The selected vehicle and cost are retained in the mission results.

The **Sustainability choices** panel exposes reusable/disposable propulsion, modular/integrated architecture, spare-parts policy, and an Earth-orbit end-of-life strategy. Their mass and cost deltas feed telemetry and mission checks; reliability and resource efficiency update live, with a qualitative sustainability assessment in mission results.

The mission begins with a reusable Mission Director briefing. Start Mission enters the existing Earth Observation builder and selects the Earth-orbit destination. Its 5,000 kg mass limit is evaluated alongside the other mission requirements.

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
