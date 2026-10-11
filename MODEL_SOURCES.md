# Spacecraft Model Sources

NASA model pages and their linked downloads were checked before adding any model assets. All verified assets used by the viewer are stored locally under `public/models/`; the app does not guess remote file URLs or substitute one spacecraft for another.

| Spacecraft | Model Available | Format | Official Source | Status |
| --- | --- | --- | --- | --- |
| Voyager | Yes | NASA downloadable ZIP containing separate STL printable parts | [NASA 3D Resources: Voyager](https://science.nasa.gov/3d-resources/voyager/) | Downloaded; NASA component meshes are assembled into the Voyager-specific viewer model. |
| Cassini | Yes | NASA downloadable ZIP containing separate STL printable parts and an assembly reference | [NASA 3D Resources: Cassini](https://science.nasa.gov/3d-resources/cassini/) | Downloaded; NASA component meshes are assembled into the Cassini orbiter and Huygens configuration. |
| Europa Clipper | Yes | NASA downloadable ZIP containing three STL files (body, solar-array wings, stand) | [NASA Europa Clipper Scale Model, Version 2025D](https://science.nasa.gov/resource/europa-clipper-scale-model-3d-print-version-2025d/) | Downloaded; the body and wings are used, with the wing mesh separated for display assembly. |
| ISS Modules | Yes | Direct GLB download | [NASA 3D Resources: International Space Station (ISS) (A)](https://science.nasa.gov/3d-resources/international-space-station-iss-a/) | Downloaded as `public/models/iss/iss.glb`; loaded with Three.js `GLTFLoader`. |
| Lunar Pathfinder | No verified NASA/JPL model found | — | [NASA 3D Resources catalog](https://science.nasa.gov/3d-resources/) | Explicitly unavailable in the viewer; no other spacecraft is shown as a fallback. |
| Mission Director suit | Yes | Direct GLB download | [NASA 3D Resources: Advanced Crew Escape Suit](https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/) | Downloaded to `public/models/advanced-crew-escape-suit.glb` and loaded locally for the mission briefing. |

## Asset details and use

- **Voyager:** NASA's `Voyager.zip` contains spacecraft-specific STL parts including the bus, high-gain dish, boom segments, instruments, and appendages. The downloaded STL geometry is loaded with Three.js `STLLoader`. Parts are placed in an approximate assembled pose for viewing; NASA's source meshes are not presented as an engineering-accurate, ready-assembled CAD model.
- **Cassini:** NASA's `Cassini.zip` contains spacecraft-specific STL parts and an assembly reference image. The viewer uses the NASA bus, dish, boom, Huygens, and RTG geometry with an approximate assembly layout.
- **Europa Clipper:** NASA's Version 2025D page identifies the model as a printable scale model and links three STL parts. The page states that the model is dedicated to Hirai Isao and is licensed under the Creative Commons Public Domain Dedication (CC0). The viewer loads the NASA body STL and separates the wing geometry to show the spacecraft's broad solar-array layout; the printed stand is omitted.
- **ISS:** The official NASA (A) entry links an actual `.glb` file. The downloaded file is 39,708 bytes and is browser-compatible with Three.js `GLTFLoader`; its Draco-compressed meshes are decoded with the locally bundled Apache-2.0 decoder in `public/draco/`.
- **Lunar Pathfinder:** The official NASA 3D Resources catalog was searched for a NASA/JPL downloadable 3D asset, and no model entry could be verified. This project therefore displays an unavailable state for this spacecraft instead of generating or reusing another model.

NASA source pages describe the Voyager and Cassini archives as freely downloadable model resources. The model pages do not provide an asset-specific license statement for every included mesh. This project keeps their NASA source links and credits NASA; any redistribution beyond this app should be reviewed against the current NASA media usage guidance and the individual asset page. Europa Clipper's model-specific CC0 terms are recorded above.

The NASA Eyes and [NASA 3D Resources](https://science.nasa.gov/3d-resources/) pages were also consulted as mission-visualization/catalog references. The 3D viewer loads only the selected spacecraft's local model assets, and never treats a mission visualization as a downloadable model unless a real model file is linked.

The mission briefing character uses NASA's Advanced Crew Escape Suit model from its official 3D Resources page and serves the local GLB copy at `public/models/advanced-crew-escape-suit.glb`. The briefing links back to NASA for attribution and source context. The resource page provides the downloadable GLB; no asset-specific license terms were verified, so this project does not claim a separate license and points users to the source page for current usage guidance.

## Editable assembly components

The Build / Edit controls add simplified, procedural viewer geometry for panels, antennas, engines, and instruments. These interactive parts are design-prototype components, not additional NASA-sourced CAD assets. When an imported STL assembly has a matching standalone dish or solar-wing mesh, the viewer replaces it with the editable part; the ISS solar-panel material is likewise replaced by the editable panels. Lunar Pathfinder remains unavailable and does not receive a procedural substitute.
