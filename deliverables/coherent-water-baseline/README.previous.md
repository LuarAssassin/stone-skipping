# Coherent water baseline evidence

## Review entry

Open `index.html` for the retained side-by-side contact sheet. These are actual screenshots of the default game and the SAME `CoherentWater` solver, not a separate demo or replacement scene. Every main image has a JSON state with exact visual/physics time, full launch snapshot, contacts, camera pose, whole-GPU-state byte hash and 128×64 downsampled height grid. These sampled grids are not full-resolution restorable GPU snapshots; the replay comparison checks all RGBA float values directly on GPU readback.

## Inputs and matched times

- `mouse-0100`, `mouse-drag-0200`, `mouse-overlap-0300`, `mouse-release-0600`: actual CDP pointer press, drag, release and re-press through the explicit toggle, at 0.1/0.2/0.3/0.6 s. Overlap means two sequentially excited wavefields coexist/interfere; only one pointer source is active at a time, not a multipointer-fluid claim. The simulation tick was held during controlled pointer dispatch, then advanced to known times; real handlers and solver were used.
- `stone-0266`, `stone-0300`, `stone-0570`, `stone-0635`, `stone-0800`, `stone-1990`, `stone-2500`, `stone-4000`: actual Throw button snapshot, seed **2735818023**, T=1, replayed at those exact visual times with the default overview camera. All use the same physical launch; early skip peak displacement at .3 s is 1.489 mm, not zero. Five skips; physics finishes at **2.043062500000245 s**. The 1.99 s frame is still sinking, not yet simulation-ended.
- `last-contact`: same snapshot at **0.72675 s**, 15 ms after actual final contact starts; close follow view. `final-sink`: **2.04325 s**, actual y≈-0.300014 m/ended=true. `post-sink`: **2.54325 s**, physics time unchanged, water peak decreases from **2.698 mm to 1.636 mm** (RMS .1558 to .1348 mm). This measures actual relaxation after scoring/physics end.
- `gesture-stone`: separate actual 0.7 s hold/drag/release throw gesture; own snapshot retained, not falsely matched to the button launch above.
- `calibration-bed.png`: untouched/self-authored procedural checker bed before disturbance. No copied tile/sky photographs.

`capture-index.json` is machine-readable for the primary matched-time series. The three additional close views have their own exact JSON. `tools/capture-coherent.mjs` reproduces actual input/capture flow; a fresh throw gets its own seed/snapshot.

## GPU measurements

`gpu-verification.json`, reproduced by `tools/coherent-browser-check.js` inside the real renderer:

- Rotating a .3 m × .105 m source by 90° swaps measured GPU second moments: .01874355 / .00309152 m² → .00309152 / .01874355 m². CPU equation versus GPU source+propagation maximum error **1.745e-8 m**.
- Seed271/T0 complete physical throw (four skips, end 1.9891875 s), then post-sink relaxation: normal, slow and bullet with irregular RAF groups each produce **480 water ticks at visual 4 s**, identical source commands and **0 maximum difference across all GPU state channels**. This is a separate fixed benchmark, not the five-skip captured random launch.
- Reset readback is exactly zero; repeated clearing/stepping keeps textures=10 and geometries=7 across the measured window (whole-renderer counters, including temporary verification solver). No growth in that bounded check; not an unlimited-duration memory claim.
- Linked programs all true, shader error list empty, **GL error 0**. Target source validation prevents zero/NaN shape uploads.

## Tests and timing

`npm-test.log`: **75 tests; 65 pass, 0 fail, 10 skipped**, no cancelled/todo. The 10 skips explicitly identify retired CPU/airborne renderer integration, not physical tests. New live-path tests cover projected extents/depth, source uniforms/invalid commands, real sink/after-sink clocks, normal/slow/bullet replay, generation reset/once-only drain and target reuse. Typecheck/build succeed; Vite reports the existing >500 kB bundle warning. Logs retained.

`cpu-raf-running.json`: 152 real after-sink running frames over ~3 seconds: CPU submission p50 **1 ms**, p95 **2 ms**, mean **1.296 ms**; RAF p50 **17 ms**, p95 **61 ms**, max **75 ms**. `cpu-raf.json` is a separate mixed paused/capture sample, explicitly labelled. **No GPU milliseconds claimed:** no timer query used. This brief run shows noticeable RAF tails and is not a full-throw performance qualification.

## Read-image observations and remaining gaps

Actual mouse-overlap, default stone-skip, final-sink and post-sink images were read by the model. Mouse waves visibly bend the checker bed and produce overlapping bright caustic bands on one coherent surface. Real-size stone disturbances exist but remain faint at default overview distance; the calibration checker dominates the composition and the stone is very small. Follow view helps but is not a dramatic splash. The final sink produces a subtle broad disturbance/relaxation, not an overturning collapse. Grid-direction anisotropy, one-texel-scale source aliasing, reflective boundaries, approximate screen-space refraction/double images and noisy/overbright mouse caustics remain. Independent visual review is still required; no Evan-demo visual parity or airborne-fluid quality is claimed.

The server is left at port 5173 on the default solver with a real stone disturbance paused at .85 s, in the existing usable follow camera. Throw, pause, replay and camera controls remain available. No remote push/commit/provider change.

Upstream attribution: `../../THIRD_PARTY_NOTICES.md`. Full Evan MIT text/reference shaders: `../../public/third-party/evanw-water/`. Method/equations/stability: `../../docs/COHERENT_WATER_BASELINE.md`. The upstream water repo explicitly has MIT source headers but no LICENSE file; full Evan MIT wording was fetched from his lightgl.js LICENSE and that provenance is disclosed, not invented as a water-repo file.
