# Bounded surface-readability correction

## Finding: partial optical improvement; stone contact still FAILS visual acceptance

The solver is connected: actual vertex heights and metre-derived surface slopes are active. This correction changes only rendering/lighting and a DEV inspection hook, not solver, coupling, launch, dimensions, metadata or the known mean-volume approximation. No airborne splash, overturning sheet or droplets are implemented by this heightfield.

- Removed the legacy blanket `specularLight*.12`. Direct sun now uses a normalized Blinn microfacet distribution (exponent 420), dielectric Fresnel F0=.0204 and geometric masking; its artistic radiance coefficient .5 is not a calibrated solar irradiance. Environment Fresnel remains .0204, real scene reflection/refraction remains enabled. This is still an approximate optical model, not a complete physically based renderer.
- Static sun moved to (.58,.34,-.74), consistently in water shading, sky and scene light, so the retained follow view samples a reflected highlight. Added smooth static cloud features; no animation of sky/colors or amplification of state normals/heights. ACES tone mapping avoids hard clipping of that highlight.
- Calibration bed remains visible: tile edge/alternate tones .78/.9 rather than .3/.78; tile pitch doubled from .25m to .5m. Caustic modulation now spans .85–1.3 rather than .32–4.2. This reduces bed dominance without hiding it.
- DEV-only `waterReview.surfaceOnly(true)` substitutes a uniform transmitted term, removing bed/refraction/underwater caustic modulation from the water's output while retaining actual surface height, normals, reflection and direct glints. `false` restores default. It is an isolation view, not a production material or evidence of airborne water. Reflection may still include submerged scene objects near a source; no claim of perfect path isolation.

## Actual image reading (1024×768)

- Early contact .300s: small horizontal notches at roughly x175–210/y430–455 interrupt the left edge of the broad sun reflection, also present in `surface-only-early-contact.png`. This is a slight source-local improvement, not an obvious splash or clearly readable complete wavefront. **Not a stone pass.**
- Last contact .72675s: tiny uneven glint near x190–210/y430, but no compelling crest at the stone. **Still too weak.** The large vertical light stripe is the static sun reflection, NOT a wave or splash.
- Final sink 2.04325s: fine, closely spaced ridges cross the reflection around x190–300/y320–355, also visible with the bed term removed. Local surface propagation can be seen independent of underwater effects, but the default still has faint bed modulation and does not read as forceful sinking splash.
- Post sink 2.54325s: residual fine ridges near the top of the glint; weaker and no airborne feature. Not evidence of a completed splash system.
- Continuous mouse: large curved crest from left edge through x280/y470–540 and reflection breaks are clearly visible in default and isolated views. This uses the existing explicit mouse proxy (.22m radius/.075m depth); it is NOT a substitute for the retained real stone launch.

The remaining limit is small local stone slopes/short resolved wavefronts against a broad reflection and transmitted bed at this scale/view, not a disconnected solver. The grid spacing is ~31mm versus an ~80×60mm stone; this rendering-only pass does not resolve that numerical/scale limitation or change its source. Faint ridges and a measurable height maximum do not establish convincing splash readability. Stop rather than escalate source gain or add decorative rings/splash pieces.

## Evidence and reproduction

`before-*` and `after-*` are real sidebar screenshots with the same retained snapshot, exact time, camera position/quaternion/FOV and viewport per case. JSON includes full snapshot, GPU byte hash/peak, linked programs and GL status. All five before/after GPU hashes are identical; this is proof of unchanged simulated state, NOT aesthetic success. Original `coherent-water-baseline` files were not modified.

The whole screenshots have a UI-only difference: before retained the follow dropdown label; after a reload it initially displayed overview despite the explicitly locked follow camera. Camera geometry is identical; do not claim byte-identical screenshots or UI. Final inspection restores the correct follow control. Mouse capture is deterministic sustained input through the same existing session mouse path, not a CDP drag gesture test.

Reproduce via `node tools/capture-surface-readability.mjs before` on the original optics and `... after` on corrected optics. The script locks tick/camera during collection; reload afterwards to restore normal interaction. It must not be used to overwrite old baseline evidence. `surface-only-*` captures isolate the corrected material. Test/build and actual compiled-shader audit results are in `validation.txt` and `shader-audit.json`.

## Attribution and boundaries

Evan Wallace's MIT WebGL Water numerical techniques are adapted in the existing solver/caustics; Three.js Water supplies planar reflection infrastructure. The optical port is **PARTIAL**, not a faithful full Evan raytraced pool reproduction. Sky/bed are original procedural references. See `THIRD_PARTY_NOTICES.md` and `public/third-party/evanw-water/`. No physics/provider/architecture changes, no git/push/publication.
