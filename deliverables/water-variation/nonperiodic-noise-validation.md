# Nonperiodic sheet breakup repair

This change replaces the two periodic sine waves with a sine-free lattice hash, smooth 2D value noise, low-amplitude domain warp and two frequency bands. Hole discard and edge strands consume the same field. It changes the spatial noise method, not seed numbers, temperature mapping, sheet geometry, node mappings or gameplay physics. No time input or per-frame resampling is introduced.

Changed source: src/rendering/breakup-noise.ts (CPU/GLSL references), src/rendering/sheets.ts (shader integration), tests/water-variation.test.ts (actual hole mask reference, correlation/repeatability/nonperiodicity and channel isolation checks). CPU reference and GPU implement the same method; floating point results are not claimed bit-identical.

Validation: targeted water-variation/effects/sheets suite 15/15 passed; typecheck and production build passed (existing bundle-size warning). Full slow physics suite intentionally not rerun. Actual browser WebGL render at physical snapshot seed 271, T=0, time .375, visual seed 0/7: 12 programs LINK_STATUS=true and no shader errors; one live sheet. No shader linkage inferred from build alone.

Regenerated diversity.json uses the new field, not the removed sine formula. T0: one seed-independent mask (208/1152 holes). Default/high: 16/16 unique hole masks, 210–303/1152 holes. Surface and sheet temperature changes leave holePhase/holeScale unchanged. Same-snapshot replay and RAF grouping checks pass.

Two same-camera seed 0/7 screenshots were actually read from /tmp/breakup-seed0.png and /tmp/breakup-seed7.png. Sheets are visible and have differing connected breakup silhouettes. Their projected size and translucency limit reliable assessment of mesh-hole reduction; no quantitative visual improvement is claimed and there is no matched pre-change image.

Final state: localhost:5173 running, visual seed 0, physical snapshot seed 271 T=0, time .3749999999999931, paused, default overview/near-shore camera restored. dist removed. Workspace has no .git repository; source-level unified shader diff was emitted during verification instead of claiming git status/diff.
