# 水体分层扰动与早触响应

## 最终统一复核 · 2026-11-15

公开源码已通过PR #3合并至main：`f4c739f532571940331695ad67e6a39709bd4f11`，44个公开文件；研究文档、实际对照图和性能数据留在本地。

独立Designer对最终两张细节图的实图复核：等距规则网孔已不明显；seed7左缘较seed0更破碎、有分叉缺口，中央滴群和下段小滴位置不同。整体纵向分布与大滴仍相似，孔边偏弱，不能据此证明默认岸后视角的一眼独特性。证据限于两张同机位细节图，不从数值独特性推导视觉验收通过。

主会话以 `WATER_VARIATION_REPORT=1 npm test` 重新执行全部 **58/58** 测试、类型检查与构建，均通过。以下早期57项及旧表保留为实施历史，当前量化以最新diversity.json为准。

末轮已移除周期sin破洞：rendering/breakup-noise.ts提供CPU/GLSL对应的平滑二维hash lattice、有限domain warp和两层频带，破洞与边缘共用稳定空间场，不含每帧随机重抽。实际mask统计同步替换同算法，不以旧公式自证新方法。CPU与GPU浮点不声称逐位相同。

最终16种子：全视觉T0为1种轮廓/掩码/滴群；默认与高温分别16种。默认左半宽44.25–70.61mm、右半宽43.64–68.27mm；这些值来自实际几何采样，不包含seed元数据哈希。节点按实际湿区/压力演化，半宽10.58–69.27mm、出生竖直喷速0.098–1.076m/s。已有节点仍冻结。数字不同不等于默认视角下已足够独特。

最终shader的6张成对阶段图和2张细节图已由主会话重新真实渲染，记录在final-capture-state.json；各帧12个GL程序均链接、错误为空。细节机位不作为默认机位可读性证据。仍不宣布真实水或去模板视觉标准通过，鸭子仍没有成功渲染；Evan由Designer实际拖水/拖球体验。


## Final corrective pass — supersedes earlier shape acceptance and metrics

Root cause confirmed: emission at `count>1` repeatedly samples approximately .012 N·s; the resulting impulse-derived strength/profile was effectively fixed. Path nodes derived their lift from sheet.height rather than current wet contact. The old default amplitude was only about .025. Updating the whole sheet also changed shared parameters of previously born geometry. Numeric 16/16 never established perceptual uniqueness.

Each node now freezes width (metres), upward/forward velocity (m/s), local variation envelope and cumulative impulse. Current contact area and velocity are used at birth; normal incidence is max(0, −v·n). Incremental force is ΔJ/Δt in N, with dt≥.25ms; F/(1000 kg/m³ × wet area) has units m²/s². A bounded empirical pressure-speed mapping uses 3m/s × sqrt(q/(9m²/s²+q)). Lift = wetFactor × (.25 incidentSpeed + .3 pressureSpeed), capped at1.65m/s (maximum ballistic head .139m); horizontal speed≤5m/s. Width = sqrt(area/π) × bounded pressure spread, capped at .13m half-width. These are empirical visual mappings, NOT a solved water-sheet fluid model or physical energy conservation claim. Physics and source/Launch baselines remain unchanged.

Sheet identity and original shared parameters remain fixed as nodes append. Node values interpolate continuously; old node objects and their trajectories stay frozen. Existing regression now checks original-node identity, ballistic point and frozen old particles after append. The real replay checks nonconstant node width and lift, T0, metadata, samephysicalinput and irregular RAF grouping. At .4s node half-width range10.58–69.27mm and birth lift .098–1.076m/s are identical across visual seeds/tiers, but vary along actual contact.

Residual shape envelope is min(.3,.3T) × sqrt(current area/.00377m²), capped by wetFactor≤1. Left/right allocation is 1±a×smoothNoise, preserving summed width before edge erosion. Independent smooth edge erosion only removes width; no seed multiplies physical lift or forward speed. T0 remains seed-independent. Edge drops now originate from the actual evolving edge geometry and finite-difference edge velocity, rather than a future rim predicted from the single threshold-birth node. This establishes edge-to-drop position continuity only: fragment holes are still procedural and are NOT a resolved mass-conserving hole-to-droplet breakup model. Arbitrary GLSL interior-hole/drop correspondence remains unsupported.

Optics: modest surface opacity coefficient .32→.5, reduced side fade; no zero-opacity cheat, bright circular outline or camera-default change. Six same-camera captures were refreshed in water-variation only; prior water-rework images untouched. Two additional **细节审阅** actual renders use height .18m / distance −2.5m / azimuth0° / target2.98m / FOV32° at .295s; these are NOT default-view acceptance evidence.

Actual Read observations this pass: initial seed0 .295s same-camera image remains tiny and dark. Both near-view seed0/7 exit images show a readable shallow continuous sheet, but also a conspicuous regular perforated/net pattern and closely similar silhouette. Some edge/perforation and drop differences exist; **visual de-templating is NOT accepted**, and default-view legibility is NOT proven. Batch Read of the four exit/return saved images was unavailable in that tool path; do not claim all six were inspected. No 16/16 result is used as a visual pass. Remaining issues: procedural hole regularity, weak normal-view surface contrast, and unproven clear seed-specific edge breakup.

Final complete validation:57/57, typecheck and build pass; pre-existing >500kB bundle warning remains. diversity.json is regenerated from actual sheet vertices, hole masks and particle arrays; the aggregate signature no longer includes hole seed/phase metadata. Additional nodeWidthRange/nodeLiftRange derive directly from born nodes. Default particle-energy proxy max7.595e−6; T2 max9.549e−6 versus T0 6.510e−6 (~1.47×), not joules. Previous detailed metric tables below are historical and superseded by this section and the new JSON. No delegation/herdr, physics changes or new architecture.


Reference read first: WATER_REFERENCE_REVISIT.md. Evan interaction evidence belongs to Designer; duck has source evidence only, not a successful visual experience. Neither reference validates splash breakup.

## Plan recorded before implementation

Keep physics and sampleThrow unchanged. Keep 512×256 / 120 Hz water. Store each velocity jump's first time moment relative to the field step; subtract that moment from the next height integration and from the substep reconstruction. Thus a source at s contributes Δv·(t−s), not Δv·(t−stepStart). Geometry and normals consume the same reconstructed height. No pre-contact response, no impulse multiplier.

Optional validated v1 visual metadata stores a uint32 visual seed and independent surface / sheet / breakup temperatures (0..2; defaults .35 / .8 / 1.1). New controls affect only the next throw. Legacy snapshots use a deterministic seed fallback. Addressable channel hashes isolate particle counts from sheet shape. T=0 removes seed dependence in that layer. Birth parameters and spatially correlated profiles remain fixed, attenuated by contact energy; no physics randomization.

Sheet variation targets independent left/right widths, correlated curvature and rim width, hole frequency/phase and drop parameters. A single contact remains one continuous sheet. Bounded multipliers must remain positive. Low energy contracts the variation envelope. Optical changes remove the 2.6 slope exaggeration and increase reflection/transmission capture resolution; no caustics claim.

Validation: legacy tests plus metadata rejection/preservation, phase arithmetic, 16 actual output profiles, T0/default/high comparisons, deterministic replay and RAF grouping. Save evidence in deliverables/water-variation. Report unsupported visual/performance checks honestly.

## Module ownership

`src/simulation/visual-variation.ts` owns the pure visual snapshot schema, validation, defaults and addressable seed/hash helpers. Visual snapshot metadata is a Session/domain protocol consumed by rendering/effects, not a renderer-owned type imported by simulation. The former `src/rendering/water-variation.ts` is deleted without a compatibility re-export. Session, snapshot validation, effects and tests import the domain module; physics, source behavior and sampleThrow algorithms are unchanged.

## Implemented method and bounds

- `HeightField.moment` stores Σ(applied float32 velocity jump × source offset) in float64. At display time α after the field boundary, hDisplay=h+vα−moment. At the next full step hNext=h+vNext·dt−decay·moment; the moment then clears. Single-source test verifies Δh=Δv·(t−birth), including the damped next boundary. Already elapsed substep sources add only their elapsed contribution. This is causal first-order reconstruction, not an extra water solver or a full high-order time integrator. Read time is monotonic/current, not historical random access.
- The first contact source uses the actual refined `contact.time`; later incremental impulses remain right-endpoint samples at the fixed physics clock. Session still samples effects every .25ms, independent of RAF. Laplacian propagation remains 120Hz; reconstruction does not invent subgrid propagation. No impulse strength increase.
- Each new throw's visual uint32 comes from a dedicated hash channel of the physical seed and a session throw serial (no extra physical PRNG draws). Consecutive throws with an injected constant physical seed still receive different visual identities. Replays never increment the serial. Explicit visual.seed may replace it in the same physical v1 JSON; sampleThrow is unchanged.
- Surface T controls only a smooth, contact-channel-isolated source-kernel radius perturbation: ≤±1%×T, further reduced by sqrt(source strength/.03). No unrelated background wave or white noise is injected. Source position, angle, strength and event time are unchanged. Drop kernels use a separate channel.
- Sheet T controls a frozen correlated profile amplitude a=.12×T×sqrt(normalized impulse), hence a≤.24. Width profile and left/right asymmetry each remain in [1−a,1+a]; actual path lift varies by ≤a/2 laterally, preserving its centerline. Profile noise uses smooth interpolation across arc coordinates, not independent node jitter. New contact-path nodes retain the original profile/seed while their causal envelope follows wet contact.
- Breakup T controls independent per-sheet hole phase (≤πT√energy), hole frequency [1−.18T√energy,1+.18T√energy], and edge-drop density/delay/size. Positive frequency bound is .64..1.36. Drop parameter deviation uses separate addressed channels; particle velocity/size random ranges contract around their causal baseline as energy falls. A 2.5% minimum detail factor preserves tiny-drop distinction without creating a sheet at zero impulse. All born particle trajectories remain frozen.
- Per-sheet GPU attributes carry phase and correlation scale; fragments no longer all evaluate the identical UV pattern. One sheet per contact is retained. All visual temperatures zero produces seed-independent sources, sheets, holes and particles.
- Geometry and optics consume the same phase-reconstructed height; removed gradient×2.6 and unrelated animated micro-normal. Central differences use actual X/Z grid spacing. Reflection/transmission targets are 1024² rather than 512²; existing absorption/Fresnel and scene-object reflection/transmission remain. The lakebed now has stable low-contrast sediment structure to make continuous refraction less featureless. No new lighting/camera mode, caustics or ray tracing. Refraction is still a screen-space approximation, not Evan's analytic scene intersection.

## Actual acceptance results

`WATER_VARIATION_REPORT=1 npm test`: **57/57**, original52 unchanged +5 new cases; typecheck and build pass. Logs and generated JSON are in `deliverables/water-variation/`. Build retains its >500kB chunk warning (about625kB JS). A DEV-only `waterReview.variant(seed)` replays the current complete physical snapshot to its paused time with another visual identity; `programs()` reports actual GL link status. These hooks are not exported on production window.

First contact of physical seed271 / physicalT0: .2603662719726561s; registration .2605s. First nonzero reconstructed h and normal appear at registration, **.133728ms simulated after contact**, or **2.67456ms wall-equivalent at .05×**. Actual RAF still adds display latency: this is a numerical-state result, not a pixel detection or a perceptual threshold. The 0–50ms report samples every .25ms through real Session.tick at both playback rates. Before contact every field height is zero and there are no sources. At the former next field boundary (.266667s), the old ordering would wait roughly6.30ms simulated /126ms at .05× for this particular contact (worst phase8.33ms/167ms).

16 consecutive visual seeds0..15, same actual physical Launch/T0, fixed .4s:

| temperatures | distinct shape / hole-mask / drop-group outputs | half-width left / right | discarded hole samples /1152 | particles retained | Σ size³·speed² proxy |
|---|---|---|---|---|---|
| all0 | 1/1/1;15 repeats | 68.284 /68.284mm |216 |126 |7.475e−6 |
| .35/.8/1.1 |16/16/16;0 repeats |65.493–71.045 /66.565–69.923mm |203–232 |125–126 |7.353–8.542e−6 |
| all2 |16/16/16;0 repeats |61.409–75.290 /64.022–72.417mm |209–225 |125–127 |7.916–10.487e−6 |

These are actual sampled sheetPoint vertices, shader-equivalent hole masks and frozen particle arrays, not counts of random branches. The proxy is not joules or fluid mass conservation. High tier maximum is1.403× the zero-detail proxy, not unbounded energy amplification. Tested positive transverse ordering across sampled widths, finite outputs, unchanged physics at every .25ms tick through .7s; same complete snapshot and irregular RAF groups give identical water/sheet/drop state and source logs through1.2s including returns. Adding100 particle hash requests does not alter a sheet profile.

Actual sidebar browser:12/12 compiled programs link, no shader errors. 100 normal frames: main-thread mean5.21/P95 9ms; RAF mean18.14/P95 37ms. 100 bullet frames: CPU1.54/P95 2ms; RAF17.12/P95 40ms. Small local sample, not GPU time, stable60fps or real-phone evidence. Timer query unavailable. Raw samples in browser-validation.json.

## Images and remaining limits

Six actual same-camera/same-light captures compare visual0/7 at .270s contact, .295s after exit and .375s first returns. Every image labels physical seed, visual seed and temperatures. Existing adjustable fixed camera settings are .65m high/.2m behind/18°/target2.9m/FOV32°, to inspect detail without adding a camera mode; normal app default remains2.1m/2.4m. Gallery: `deliverables/water-variation/index.html`. This turn's Read images were available: inspected initial default frame, near exit and return. Thin sheet remains faint and surface contrast low; numeric uniqueness does not prove an obvious visual difference at normal scale. Do not claim every screenshot was personally visually inspected. Current still needs a stronger but physically consistent optical reference/close-up inspection, and local contact resolution remains~3.13cm (stone~2.6cells). No local patch refinement was added. No volume breakup or caustics; no duck visual experience claim. Previous water-rework before/after and reference research documents are untouched.

No physics/launch sampler/baseline changes, provider changes, delegation, git commit or remote push. No parallel writer. Clean up generated dist; keep5173 and a paused default-camera example. UI visual sliders only affect the next throw, JSON metadata is validated and preserved; old v1 without visual metadata uses deterministic seed fallback plus defaults.
