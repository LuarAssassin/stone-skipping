import * as THREE from 'three';
import { shoreElevation, shorelineCurveX, shoreNormal, SUN_DIRECTION } from './sunset-env';
import { populateStoneGroup, setStoneHighlight, setStoneInspectLook } from './stone-mesh';
import { loadOptionalAsset } from './optional-asset';
import {
    forageShoreStones,
    formatStoneDimensions,
    loadStoneManifest,
    MAX_COLLECTION_SIZE,
    type ManifestStoneEntry,
    type StoneBox,
    type StoneSpec,
} from '../simulation/stones';
import { compareStoneProfiles } from '../simulation/stone-profile';
import type { Launch } from '../simulation/physics';
import type { Pose } from '../camera/rig';

const SHORE_STONE_COUNT = 52;
const FORAGE_FOV = 45;
const HERO_LIFT_SCALE = 1.56;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

interface ShoreStoneItem {
    spec: StoneSpec;
    root: THREE.Group;
    visual: THREE.Group;
    collider: THREE.Mesh;
    shadow: THREE.Mesh;
    shadowMat: THREE.MeshBasicMaterial;
    restPos: THREE.Vector3;
    restQuat: THREE.Quaternion;
    hoverAmount: number;
    inspectBlend: number;
    isTemporaryTune?: boolean;
}

export interface ShoreForagingCallbacks {
    onLoading(assets: Promise<unknown>): void;
    onEquipAndStandUp(stone: StoneSpec): void;
    onTakeAndCompare?(stone: StoneSpec): void;
    hasCompareBaseline?(): boolean;
    onEquipStay(stone: StoneSpec): void;
    onClink(mass: number): void;
    onExit(): void;
    getLaunch(): Launch;
    onLaunchChange(patch: Partial<Launch>): void;
}

/** Fixed crouching camera framing at z = 0 overlooking the natural fluvial gravel bar and twilight waterline. */
function computeForageCameraFrame() {
    const waterEdge = shorelineCurveX(0);
    const focusX = waterEdge - 0.56;
    const focusY = shoreElevation(focusX, 0) + 0.02;
    const camX = focusX - 1.02;
    const camY = Math.max(0.50, focusY + 0.94);
    return { waterEdge, focusX, focusY, camX, camY };
}

/** Shared radial soft ambient-occlusion contact shadow texture reinforcing real shadow maps right at the stone-sand crease. */
function createContactShadowTexture(): THREE.DataTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        const ny = (y + 0.5) / size * 2 - 1;
        for (let x = 0; x < size; x++) {
            const nx = (x + 0.5) / size * 2 - 1;
            const r = Math.hypot(nx, ny);
            const falloff = Math.pow(Math.max(0, 1 - r), 1.6);
            const o = (y * size + x) * 4;
            data[o] = 10;
            data[o + 1] = 8;
            data[o + 2] = 9;
            data[o + 3] = Math.round(falloff * 224);
        }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
}

/** Live 3D twilight riverbank foraging & center-stage lift-and-tune posture studio:
 *  - Seats 52 unique Blender GLB stones directly onto exact raycasted shoreMesh triangles with real sunset shadows + contact AO
 *  - Clicking any stone lifts & enlarges it (1.56x) to center-stage with a golden waterline horizon ring
 *  - Drag directly on the lifted stone to tune attack tilt & side roll, wheel/controls for elevation & spin, or flip 360° */
export function createShoreForaging(
    scene: THREE.Scene,
    shoreMesh: THREE.Mesh,
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    box: StoneBox,
    callbacks: ShoreForagingCallbacks
) {
    const rootGroup = new THREE.Group();
    rootGroup.visible = false;
    scene.add(rootGroup);

    // Subtle warm golden focus ring seated on gravel beneath the hovered stone
    const hoverRing = new THREE.Mesh(
        new THREE.RingGeometry(0.050, 0.059, 36),
        new THREE.MeshBasicMaterial({
            color: 0xffcf86,
            transparent: true,
            opacity: 0.68,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
    );
    hoverRing.visible = false;
    rootGroup.add(hoverRing);

    // Delicate hairline horizontal waterline ring around the lifted stone so tilt & roll read cleanly without visual clutter
    const postureRingMat = new THREE.MeshBasicMaterial({
        color: 0xffd596,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const postureRing = new THREE.Mesh(new THREE.RingGeometry(0.062, 0.0636, 72), postureRingMat);
    postureRing.rotation.x = -Math.PI / 2;
    postureRing.visible = false;
    rootGroup.add(postureRing);

    const colliderMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
    });

    const shadowGeom = new THREE.PlaneGeometry(1, 1);
    const shadowTex = createContactShadowTexture();
    const downRay = new THREE.Raycaster();
    const downOrigin = new THREE.Vector3();
    const downDir = new THREE.Vector3(0, -1, 0);
    // Horizontal shadow cast direction away from the low golden sunset
    const sunShadowDirX = -SUN_DIRECTION.x;
    const sunShadowDirZ = -SUN_DIRECTION.z;
    const sunShadowLen = Math.hypot(sunShadowDirX, sunShadowDirZ) || 1;
    const sunCastX = sunShadowDirX / sunShadowLen;
    const sunCastZ = sunShadowDirZ / sunShadowLen;

    // Mount minimalist cinematic Forage & Posture-Tuning HUD inside #app
    const hud = document.createElement('div');
    hud.id = 'forage-hud';
    hud.className = 'forage-hud';
    hud.innerHTML = `
      <div class="forage-top-bar">
        <div class="forage-banner">
          <span class="pill-dot"></span>
          <span id="forage-banner-text">浅滩寻石</span>
        </div>
        <div class="forage-top-actions">
          <span class="career-pill" id="forage-career">累计 0 跳</span>
          <button id="forage-walk-more" class="glass-pill" type="button">换一片</button>
          <button id="forage-return" class="glass-pill active" type="button">回湖面 <kbd>F</kbd></button>
        </div>
      </div>

      <div id="forage-caption" class="forage-caption">
        <div class="forage-cap-head">
          <strong id="forage-stone-name"></strong>
          <span id="forage-stone-rarity" class="rarity-tag"></span>
          <span id="forage-stone-style" class="forage-style-tag"></span>
          <span id="forage-stone-dims" class="forage-dims"></span>
          <div class="tune-mode-seg" role="group" aria-label="交互模式">
            <button id="mode-tune" class="seg active" type="button">调姿</button>
            <button id="mode-flip" class="seg" type="button">360°</button>
          </div>
        </div>
        <div id="forage-traits" class="forage-traits" aria-label="手感维度对比"></div>
        <p id="forage-stone-guide" class="forage-guide"></p>
        <p id="forage-stone-feel" class="forage-feel"></p>
        <div id="forage-inspect-actions" class="forage-inspect-actions">
          <div class="tune-grid">
            <label class="tune-cell">
              <span>攻角 <b id="tune-tilt-val">6°</b></span>
              <input id="tune-tilt" type="range" min="0" max="50" step="1" value="6">
            </label>
            <label class="tune-cell">
              <span>侧倾 <b id="tune-roll-val">0°</b></span>
              <input id="tune-roll" type="range" min="-35" max="35" step="1" value="0">
            </label>
            <label class="tune-cell">
              <span>抛角 <b id="tune-elev-val">2°</b></span>
              <input id="tune-elev" type="range" min="-12" max="20" step="1" value="2">
            </label>
            <button id="tune-spin" class="tune-spin-btn" type="button" title="切换顺/逆自旋方向 (Q/E)">↻ 顺旋</button>
          </div>
          <div class="inspect-btns">
            <button id="forage-take" class="forage-action primary" type="button">拿去投 <kbd>↵</kbd></button>
            <button id="forage-compare" class="forage-action compare hidden" type="button" title="用上一次手动投掷的相同力度立刻试投这块石子">同力试投</button>
            <button id="forage-collect" class="forage-action" type="button">收入石匣</button>
            <button id="forage-putback" class="forage-action ghost" type="button">放回</button>
          </div>
        </div>
        <p id="forage-msg" class="forage-msg"></p>
      </div>

      <div class="forage-pocket" aria-label="随身石匣">
        <div class="forage-pocket-head">
          <span>石匣</span>
          <small id="forage-pocket-count">1 / ${MAX_COLLECTION_SIZE}</small>
        </div>
        <div id="forage-pocket-list" class="forage-pocket-list"></div>
      </div>
    `;
    document.querySelector('#app')!.append(hud);

    let active = false;
    let catalog: ManifestStoneEntry[] = [];
    const manifestReady = loadOptionalAsset(loadStoneManifest()).then(list => {
        catalog = list ?? [];
    });
    let items: ShoreStoneItem[] = [];
    let hovered: ShoreStoneItem | undefined;
    let inspected: ShoreStoneItem | undefined;
    let forageSeed = Math.floor(Math.random() * 0xffffffff);
    let lastBatchManifestIds = new Set<string>();
    let inspectMode: 'tune' | 'flip' = 'tune';
    let closeAfterPutBack = false;

    let cursorNdcX = 0;
    let cursorNdcY = 0;

    // 360° free-flip inspection rotation state & subtle live spin preview angle
    let inspectYaw = 0.45;
    let inspectPitch = 0.36;
    let spinPreviewAngle = 0;
    const inspectEuler = new THREE.Euler();
    const inspectQuat = new THREE.Quaternion();
    const spinQuat = new THREE.Quaternion();
    const poseRollQuat = new THREE.Quaternion();
    const poseTiltQuat = new THREE.Quaternion();
    const poseYawQuat = new THREE.Quaternion();

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3(1, 0, 0);
    const zAxis = new THREE.Vector3(0, 0, 1);
    const camForward = new THREE.Vector3();
    const camUp = new THREE.Vector3();
    const goalInspectPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const cantEuler = new THREE.Euler();
    const cantQuat = new THREE.Quaternion();

    const captionEl = hud.querySelector<HTMLElement>('#forage-caption')!;
    const msgEl = hud.querySelector<HTMLElement>('#forage-msg')!;
    const bannerTextEl = hud.querySelector<HTMLElement>('#forage-banner-text')!;
    const collectBtn = hud.querySelector<HTMLButtonElement>('#forage-collect')!;
    const putbackBtn = hud.querySelector<HTMLButtonElement>('#forage-putback')!;
    const modeTuneBtn = hud.querySelector<HTMLButtonElement>('#mode-tune')!;
    const modeFlipBtn = hud.querySelector<HTMLButtonElement>('#mode-flip')!;
    const tuneTiltInput = hud.querySelector<HTMLInputElement>('#tune-tilt')!;
    const tuneRollInput = hud.querySelector<HTMLInputElement>('#tune-roll')!;
    const tuneElevInput = hud.querySelector<HTMLInputElement>('#tune-elev')!;
    const tuneSpinBtn = hud.querySelector<HTMLButtonElement>('#tune-spin')!;

    function setMsg(text: string) {
        msgEl.textContent = text;
    }

    function syncBannerCount() {
        const shoreCount = items.filter(it => !it.isTemporaryTune).length;
        bannerTextEl.textContent = `浅滩寻石 · ${shoreCount} 块`;
    }

    function syncTuneReadout() {
        const p = callbacks.getLaunch();
        const tilt = Math.round(p.tilt);
        const roll = Math.round(p.roll ?? 0);
        const elev = Math.round(p.elevation);
        tuneTiltInput.value = String(tilt);
        tuneRollInput.value = String(roll);
        tuneElevInput.value = String(elev);
        hud.querySelector('#tune-tilt-val')!.textContent = `${tilt}°`;
        hud.querySelector('#tune-roll-val')!.textContent = `${roll > 0 ? `+${roll}` : roll}°`;
        hud.querySelector('#tune-elev-val')!.textContent = `${elev > 0 ? `+${elev}` : elev}°`;
        tuneSpinBtn.textContent = p.spin < 0 ? '↺ 逆旋' : '↻ 顺旋';
    }

    function setInspectMode(mode: 'tune' | 'flip') {
        inspectMode = mode;
        modeTuneBtn.classList.toggle('active', mode === 'tune');
        modeFlipBtn.classList.toggle('active', mode === 'flip');
    }

    /** Sample the EXACT rendered triangle height & normal on shoreMesh so stones sit with 0.0 mm gap. */
    function sampleRenderedShore(px: number, pz: number): { y: number; normal: THREE.Vector3 } {
        shoreMesh.updateMatrixWorld(true);
        downOrigin.set(px, 3.0, pz);
        downRay.set(downOrigin, downDir);
        const hits = downRay.intersectObject(shoreMesh, false);
        if (hits.length > 0) {
            const hit = hits[0];
            const normal = hit.face
                ? hit.face.normal.clone().transformDirection(shoreMesh.matrixWorld).normalize()
                : shoreNormal(px, pz);
            return { y: hit.point.y, normal };
        }
        return { y: shoreElevation(px, pz), normal: shoreNormal(px, pz) };
    }

    function disposeItems() {
        for (const item of items) {
            rootGroup.remove(item.root);
            rootGroup.remove(item.shadow);
            item.shadowMat.dispose();
            item.collider.geometry.dispose();
            item.visual.traverse(obj => {
                if (obj instanceof THREE.Mesh) {
                    if (!obj.userData.sharedGeometry) obj.geometry.dispose();
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    for (const m of mats) m?.dispose();
                }
            });
        }
        items = [];
        hovered = undefined;
        inspected = undefined;
        hoverRing.visible = false;
        postureRing.visible = false;
    }

    function populateShore(seed: number, avoidPrevious = false) {
        disposeItems();
        const stoneLoads: Promise<void>[] = [];
        const targetCount = catalog.length > 0 ? Math.min(SHORE_STONE_COUNT, catalog.length) : 28;
        const specs = forageShoreStones(
            box.careerSkips,
            seed,
            targetCount,
            catalog,
            avoidPrevious ? lastBatchManifestIds : undefined
        );
        lastBatchManifestIds = new Set(
            specs.map(s => (s.variant !== undefined ? `${s.archetypeId}_${String(s.variant).padStart(2, '0')}` : s.id))
        );

        const placed: { x: number; z: number; r: number; h: number }[] = [];

        let rngState = (seed ^ 0x51f23a9b) >>> 0;
        const rand = () => {
            rngState = (rngState + 0x6d2b79f5) >>> 0;
            let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
            t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const randSigned = () => (rand() + rand() - 1);

        const safeAspect = clamp(camera.aspect || 1.6, 0.70, 1.82);
        const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(FORAGE_FOV * 0.5));
        const halfZFar = 1.84 * tanHalfFov * safeAspect * 0.90;
        const halfZNear = 1.04 * tanHalfFov * safeAspect * 0.86;

        // 5 natural meandering fluvial pebble-bar lobes along the curved damp shoreline
        const lobes = Array.from({ length: 5 }, (_, idx) => {
            const frac = (idx + 0.5) / 5;
            const lobeZ = (frac * 2 - 1) * halfZFar * 0.88 + randSigned() * 0.18;
            return {
                z: lobeZ,
                inland: 0.08 + rand() * 0.52,
                spreadZ: 0.24 + rand() * 0.26,
                spreadX: 0.14 + rand() * 0.22,
            };
        });

        const order = specs.map((_, idx) => idx).sort((a, b) =>
            Math.max(specs[b].a, specs[b].b) - Math.max(specs[a].a, specs[a].b)
        );
        const placements = new Array<{ x: number; z: number; leanLift: number }>(specs.length);

        for (const i of order) {
            const spec = specs[i];
            const radius = Math.max(spec.a, spec.b);
            const isThin = spec.h < 0.008;
            let px = -1.5;
            let pz = 0;
            let leanLift = 0;
            let found = false;

            for (let attempt = 0; attempt < 110; attempt++) {
                let candidateZ: number;
                let inlandOffset: number;
                const mode = rand();

                if (mode < 0.68 && attempt < 75) {
                    const lobe = lobes[Math.floor(rand() * lobes.length)];
                    candidateZ = lobe.z + randSigned() * lobe.spreadZ;
                    inlandOffset = lobe.inland + randSigned() * lobe.spreadX;
                } else if (mode < 0.86) {
                    inlandOffset = -0.04 + Math.pow(rand(), 1.3) * 0.34;
                    candidateZ = (rand() * 2 - 1) * halfZFar * 1.04;
                } else {
                    const t = 0.45 + rand() * 0.55;
                    inlandOffset = 0.06 + t * 0.96;
                    const maxZ = halfZFar + (halfZNear - halfZFar) * t;
                    candidateZ = (rand() * 2 - 1) * maxZ * 0.96;
                }

                inlandOffset = clamp(inlandOffset, -0.05, 1.02);
                const tNorm = clamp((inlandOffset + 0.05) / 1.07, 0, 1);
                const maxZ = halfZFar + (halfZNear - halfZFar) * tNorm;
                candidateZ = clamp(candidateZ, -maxZ * 1.03, maxZ * 1.03);

                const candidateX = shorelineCurveX(candidateZ) - inlandOffset;

                let ok = true;
                let bestLift = 0;
                const desiredGap = attempt < 45 ? 0.016 : attempt < 80 ? 0.006 : -0.006;
                for (const p of placed) {
                    const d = Math.hypot(p.x - candidateX, p.z - candidateZ);
                    const minSep = p.r + radius + desiredGap;
                    if (d < minSep) {
                        const canLean = isThin && p.h > spec.h * 1.35 && d >= (p.r + radius * 0.68) && bestLift === 0;
                        if (canLean) {
                            bestLift = Math.min(0.006, p.h * 0.32);
                        } else {
                            ok = false;
                            break;
                        }
                    }
                }
                if (ok) {
                    px = candidateX;
                    pz = candidateZ;
                    leanLift = bestLift;
                    found = true;
                    break;
                }
            }
            if (!found) {
                const t = rand();
                const inlandOffset = 0.04 + t * 0.92;
                const maxZ = halfZFar + (halfZNear - halfZFar) * t;
                pz = (rand() * 2 - 1) * maxZ * 0.90;
                px = shorelineCurveX(pz) - inlandOffset;
            }
            placed.push({ x: px, z: pz, r: radius, h: spec.h });
            placements[i] = { x: px, z: pz, leanLift };
        }

        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            const { x: px, z: pz, leanLift } = placements[i];
            // Exact rendered triangle height & normal eliminate the 5–12mm analytical-vs-mesh air gap!
            const { y: py, normal } = sampleRenderedShore(px, pz);

            // Real geological embedding: thick cobbles sink 45–62% into wet sand; thin flats nestle 38–54%
            const isBulky = spec.h > 0.011;
            const exposeRatio = isBulky
                ? (0.36 + rand() * 0.16)
                : (0.44 + rand() * 0.16);
            const restPos = new THREE.Vector3(px, py + spec.h * exposeRatio + leanLift, pz);

            // Natural fluvial imbrication: gentle 3°–12° cant so bottoms never lift off the sand
            const alignSlope = new THREE.Quaternion().setFromUnitVectors(upAxis, normal);
            const yawRad = rand() * Math.PI * 2;
            const randomYaw = new THREE.Quaternion().setFromAxisAngle(upAxis, yawRad);
            const cantMax = isBulky ? 0.18 : 0.12;
            cantEuler.set(
                (rand() - 0.5) * cantMax * 1.4,
                0,
                (rand() - 0.4) * cantMax * 1.4 + (leanLift > 0 ? 0.12 : 0)
            );
            cantQuat.setFromEuler(cantEuler);
            const restQuat = alignSlope.multiply(randomYaw).multiply(cantQuat);

            const shoreWetness = 1 - THREE.MathUtils.smoothstep(py, -0.01, 0.095);

            const root = new THREE.Group();
            root.position.copy(restPos);
            root.quaternion.copy(restQuat);

            const visual = new THREE.Group();
            const loading = populateStoneGroup(visual, spec, undefined, { shoreWetness });
            if (loading) stoneLoads.push(loading);
            root.add(visual);

            const hitRadius = Math.max(spec.a, spec.b) * 1.12 + 0.009;
            const collider = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 10, 8), colliderMat);
            root.add(collider);

            // Grounded Contact AO shadow slightly shifted away from the low sunset sun to reinforce PCF soft shadows
            const shadowMat = new THREE.MeshBasicMaterial({
                map: shadowTex,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -2,
                opacity: isBulky ? 0.88 : 0.78,
            });
            const shadow = new THREE.Mesh(shadowGeom, shadowMat);
            const castShift = Math.min(0.018, spec.h * 0.85);
            const sxPos = px + sunCastX * castShift;
            const szPos = pz + sunCastZ * castShift;
            const { y: shadowY } = sampleRenderedShore(sxPos, szPos);
            shadow.position.set(sxPos, shadowY + 0.0014, szPos);
            shadow.quaternion.setFromUnitVectors(zAxis, normal);
            shadow.rotateOnAxis(zAxis, yawRad);
            shadow.scale.set(spec.a * 2.75, spec.b * 2.65, 1);

            rootGroup.add(shadow);
            rootGroup.add(root);

            const item: ShoreStoneItem = {
                spec,
                root,
                visual,
                collider,
                shadow,
                shadowMat,
                restPos,
                restQuat,
                hoverAmount: 0,
                inspectBlend: 0,
            };
            collider.userData.shoreItem = item;
            items.push(item);
        }
        syncBannerCount();
        renderPocket();
        syncCaption();
        return Promise.allSettled(stoneLoads);
    }

    function renderPocket() {
        hud.querySelector('#forage-career')!.textContent = `累计 ${box.careerSkips} 跳`;
        hud.querySelector('#forage-pocket-count')!.textContent = `${box.stones.length} / ${MAX_COLLECTION_SIZE}`;
        const list = hud.querySelector('#forage-pocket-list')!;
        list.innerHTML = box.stones.map((s, idx) => {
            const isEquipped = !box.isUsingEphemeral && box.equipped.id === s.id;
            const best = s.bestSkips ? `${s.bestSkips}跳` : '';
            return `<div class="pocket-chip rarity-${s.rarity} ${isEquipped ? 'active' : ''}">
              <button type="button" class="pocket-pick" data-pocket-equip="${s.id}" title="${formatStoneDimensions(s)}">
                <kbd>${idx + 1}</kbd>
                <span class="pocket-name">${s.name}</span>
                ${best ? `<em class="pocket-best">${best}</em>` : ''}
              </button>
              ${box.stones.length > 1 ? `<button type="button" class="pocket-drop" data-pocket-drop="${s.id}" title="放回岸边">×</button>` : ''}
            </div>`;
        }).join('');

        for (const btn of list.querySelectorAll<HTMLButtonElement>('[data-pocket-equip]')) {
            btn.onclick = () => {
                const picked = box.equipSaved(btn.dataset.pocketEquip!);
                if (picked) {
                    callbacks.onClink(picked.mass);
                    close();
                    callbacks.onEquipAndStandUp(picked);
                }
            };
        }
        for (const btn of list.querySelectorAll<HTMLButtonElement>('[data-pocket-drop]')) {
            btn.onclick = () => {
                if (box.remove(btn.dataset.pocketDrop!)) {
                    setMsg('已将藏石放回岸边');
                    callbacks.onEquipStay(box.equipped);
                    renderPocket();
                    syncCaption();
                }
            };
        }
    }

    const compareBtn = hud.querySelector<HTMLButtonElement>('#forage-compare')!;
    const traitsEl = hud.querySelector<HTMLElement>('#forage-traits')!;
    const styleTagEl = hud.querySelector<HTMLElement>('#forage-stone-style')!;
    const guideEl = hud.querySelector<HTMLElement>('#forage-stone-guide')!;

    function formatDeltaBadge(delta: number, isSameStone: boolean): string {
        if (isSameStone || Math.abs(delta) < 2) return '';
        const cls = delta > 0 ? 'up' : 'down';
        return `<em class="trait-delta ${cls}">${delta > 0 ? '+' : ''}${delta}</em>`;
    }

    function syncCaption() {
        const target = inspected ?? hovered;
        hud.classList.toggle('is-inspecting', Boolean(inspected));
        if (!target) {
            captionEl.classList.remove('visible', 'inspecting');
            return;
        }
        const s = target.spec;
        const equipped = box.equipped;
        const isSameStone = s.id === equipped.id;
        const cmp = compareStoneProfiles(s, equipped);

        hud.querySelector('#forage-stone-name')!.textContent = s.name;
        const rarityEl = hud.querySelector<HTMLElement>('#forage-stone-rarity')!;
        rarityEl.textContent = s.rarityLabel;
        rarityEl.className = `rarity-tag rarity-${s.rarity}`;
        styleTagEl.textContent = cmp.profile.styleTag;
        hud.querySelector('#forage-stone-dims')!.textContent = formatStoneDimensions(s);
        hud.querySelector('#forage-stone-feel')!.textContent = s.feel;
        guideEl.textContent = isSameStone
            ? `${cmp.profile.guide}`
            : `对比当前「${equipped.name}」 · ${cmp.profile.guide}`;

        const rows: [string, number, number][] = [
            ['起漂', cmp.profile.lift, cmp.deltaLift],
            ['耐力', cmp.profile.glide, cmp.deltaGlide],
            ['稳度', cmp.profile.stability, cmp.deltaStability],
        ];
        traitsEl.innerHTML = rows.map(([label, score, delta]) => `
          <div class="trait-item">
            <div class="trait-head">
              <span>${label}</span>
              <b>${score}${formatDeltaBadge(delta, isSameStone)}</b>
            </div>
            <div class="trait-bar"><i style="width:${score}%"></i></div>
          </div>
        `).join('');

        captionEl.classList.add('visible');
        captionEl.classList.toggle('inspecting', Boolean(inspected));

        if (inspected) {
            syncTuneReadout();
            const alreadySaved = box.stones.some(saved => saved.id === s.id);
            collectBtn.disabled = alreadySaved;
            collectBtn.textContent = alreadySaved ? '已收录' : '收入石匣';
            putbackBtn.textContent = inspected.isTemporaryTune ? '返回' : '放回';
            const canCompare = Boolean(callbacks.onTakeAndCompare && callbacks.hasCompareBaseline?.());
            compareBtn.classList.toggle('hidden', !canCompare);
        }
    }

    function updateRaycast(clientX: number, clientY: number) {
        if (!active || inspected) return;
        const boxRect = canvas.getBoundingClientRect();
        if (boxRect.width <= 0 || boxRect.height <= 0) return;
        cursorNdcX = ((clientX - boxRect.left) / boxRect.width) * 2 - 1;
        cursorNdcY = 1 - ((clientY - boxRect.top) / boxRect.height) * 2;
        ndc.set(cursorNdcX, cursorNdcY);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(items.map(it => it.collider), false);
        const nextHover = hits.length > 0 ? (hits[0].object.userData.shoreItem as ShoreStoneItem | undefined) : undefined;
        if (nextHover !== hovered) {
            if (hovered) setStoneHighlight(hovered.visual, false);
            hovered = nextHover;
            if (hovered) setStoneHighlight(hovered.visual, true);
            canvas.style.cursor = hovered ? 'pointer' : 'default';
            setMsg('');
            syncCaption();
        }
    }

    function removeTakenItem(taken: ShoreStoneItem) {
        rootGroup.remove(taken.root);
        rootGroup.remove(taken.shadow);
        taken.shadowMat.dispose();
        taken.collider.geometry.dispose();
        items = items.filter(i => i !== taken);
        syncBannerCount();
    }

    function pickUpItem(item: ShoreStoneItem) {
        inspected = item;
        setStoneHighlight(inspected.visual, false);
        setStoneInspectLook(inspected.visual, true);
        hovered = undefined;
        hoverRing.visible = false;
        setInspectMode('tune');
        inspectYaw = 0.45;
        inspectPitch = 0.36;
        setMsg('');
        callbacks.onClink(inspected.spec.mass);
        syncCaption();
        canvas.style.cursor = 'grab';
    }

    function equipInspectedAndClose(): StoneSpec | undefined {
        if (!inspected) return undefined;
        const picked = inspected.spec;
        setStoneInspectLook(inspected.visual, false);
        if (inspected.isTemporaryTune) {
            removeTakenItem(inspected);
        } else if (box.stones.some(s => s.id === picked.id)) {
            box.equipSaved(picked.id);
        } else {
            box.equipEphemeral(picked);
            removeTakenItem(inspected);
        }
        inspected = undefined;
        closeAfterPutBack = false;
        callbacks.onClink(picked.mass);
        close();
        return box.equipped;
    }

    function confirmTakeAndStandUp() {
        const equipped = equipInspectedAndClose();
        if (equipped) callbacks.onEquipAndStandUp(equipped);
    }

    function confirmTakeAndCompare() {
        const equipped = equipInspectedAndClose();
        if (equipped) {
            if (callbacks.onTakeAndCompare) callbacks.onTakeAndCompare(equipped);
            else callbacks.onEquipAndStandUp(equipped);
        }
    }

    function putBackInspected() {
        if (!inspected) return;
        const wasTemp = Boolean(inspected.isTemporaryTune);
        setStoneInspectLook(inspected.visual, false);
        if (wasTemp) {
            removeTakenItem(inspected);
        }
        inspected = undefined;
        setMsg('');
        syncCaption();
        canvas.style.cursor = 'default';
        if (wasTemp && closeAfterPutBack) {
            closeAfterPutBack = false;
            close();
            callbacks.onExit();
        }
    }

    // Pure mouse interaction (capture phase isolates foraging from lake pull-to-throw)
    let dragState:
        | { pointerId: number; lastX: number; lastY: number; moved: number; startTilt: number; startRoll: number }
        | undefined;

    canvas.addEventListener('pointerdown', event => {
        if (!active) return;
        event.stopImmediatePropagation();
        if (!event.isPrimary) return;

        if (event.button === 2) {
            if (inspected) putBackInspected();
            event.preventDefault();
            return;
        }
        if (event.button !== 0) return;

        if (inspected) {
            const p = callbacks.getLaunch();
            dragState = {
                pointerId: event.pointerId,
                lastX: event.clientX,
                lastY: event.clientY,
                moved: 0,
                startTilt: p.tilt,
                startRoll: p.roll ?? 0,
            };
            canvas.setPointerCapture(event.pointerId);
            canvas.style.cursor = 'grabbing';
            event.preventDefault();
            return;
        }

        updateRaycast(event.clientX, event.clientY);
        if (hovered) {
            closeAfterPutBack = false;
            pickUpItem(hovered);
            event.preventDefault();
        }
    }, true);

    canvas.addEventListener('pointermove', event => {
        if (!active) return;
        event.stopImmediatePropagation();
        if (dragState && dragState.pointerId === event.pointerId) {
            const dx = event.clientX - dragState.lastX;
            const dy = event.clientY - dragState.lastY;
            dragState.lastX = event.clientX;
            dragState.lastY = event.clientY;
            dragState.moved += Math.hypot(dx, dy);

            if (inspectMode === 'tune') {
                // Direct 3D posture tuning: drag up/down -> attack tilt, left/right -> side roll
                const p = callbacks.getLaunch();
                const nextTilt = clamp(p.tilt - dy * 0.20, 0, 50);
                const nextRoll = clamp((p.roll ?? 0) + dx * 0.26, -35, 35);
                callbacks.onLaunchChange({ tilt: Math.round(nextTilt), roll: Math.round(nextRoll) });
                syncTuneReadout();
            } else {
                inspectYaw += dx * 0.011;
                inspectPitch = clamp(inspectPitch + dy * 0.011, -1.45, 1.45);
            }
            return;
        }
        updateRaycast(event.clientX, event.clientY);
    }, true);

    const endDrag = (event: PointerEvent) => {
        if (!active) return;
        event.stopImmediatePropagation();
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        const wasClick = dragState.moved < 7;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        dragState = undefined;

        if (wasClick && inspected) {
            const boxRect = canvas.getBoundingClientRect();
            const cx = (event.clientX - boxRect.left) / boxRect.width - 0.5;
            const cy = (event.clientY - boxRect.top) / boxRect.height - 0.5;
            if (Math.hypot(cx, cy) > 0.24) {
                putBackInspected();
                return;
            }
        }
        canvas.style.cursor = inspected ? 'grab' : (hovered ? 'pointer' : 'default');
    };
    canvas.addEventListener('pointerup', endDrag, true);
    canvas.addEventListener('pointercancel', endDrag, true);

    // Mouse wheel while lifted tunes launch elevation (or Shift+wheel tunes roll); swallowed otherwise
    canvas.addEventListener('wheel', event => {
        if (!active) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        if (!inspected) return;
        const step = event.deltaY < 0 ? 1 : -1;
        const p = callbacks.getLaunch();
        if (event.shiftKey) {
            callbacks.onLaunchChange({ roll: Math.round(clamp((p.roll ?? 0) + step * 2, -35, 35)) });
        } else {
            callbacks.onLaunchChange({ elevation: Math.round(clamp(p.elevation + step, -12, 20)) });
        }
        syncTuneReadout();
    }, { capture: true, passive: false });

    canvas.addEventListener('contextmenu', event => {
        if (active) event.preventDefault();
    });

    // Keyboard shortcuts while a stone is lifted at center-stage
    window.addEventListener('keydown', event => {
        if (!active || !inspected) return;
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
        const p = callbacks.getLaunch();
        if (event.code === 'Enter') {
            event.preventDefault();
            confirmTakeAndStandUp();
        } else if (event.code === 'KeyW') {
            callbacks.onLaunchChange({ elevation: Math.round(clamp(p.elevation + 1, -12, 20)) });
            syncTuneReadout();
        } else if (event.code === 'KeyS') {
            callbacks.onLaunchChange({ elevation: Math.round(clamp(p.elevation - 1, -12, 20)) });
            syncTuneReadout();
        } else if (event.code === 'KeyA') {
            callbacks.onLaunchChange({ roll: Math.round(clamp((p.roll ?? 0) - 2, -35, 35)) });
            syncTuneReadout();
        } else if (event.code === 'KeyD') {
            callbacks.onLaunchChange({ roll: Math.round(clamp((p.roll ?? 0) + 2, -35, 35)) });
            syncTuneReadout();
        } else if (event.code === 'KeyQ') {
            callbacks.onLaunchChange({ spin: -Math.max(12, Math.abs(p.spin || 18)) });
            syncTuneReadout();
        } else if (event.code === 'KeyE') {
            callbacks.onLaunchChange({ spin: Math.max(12, Math.abs(p.spin || 18)) });
            syncTuneReadout();
        }
    });

    // Wire HUD posture-tuning controls & buttons
    modeTuneBtn.onclick = () => setInspectMode('tune');
    modeFlipBtn.onclick = () => setInspectMode('flip');
    tuneTiltInput.oninput = () => {
        callbacks.onLaunchChange({ tilt: Number(tuneTiltInput.value) });
        syncTuneReadout();
    };
    tuneRollInput.oninput = () => {
        callbacks.onLaunchChange({ roll: Number(tuneRollInput.value) });
        syncTuneReadout();
    };
    tuneElevInput.oninput = () => {
        callbacks.onLaunchChange({ elevation: Number(tuneElevInput.value) });
        syncTuneReadout();
    };
    tuneSpinBtn.onclick = () => {
        const p = callbacks.getLaunch();
        callbacks.onLaunchChange({ spin: p.spin === 0 ? 18 : -p.spin });
        syncTuneReadout();
    };

    hud.querySelector<HTMLButtonElement>('#forage-return')!.onclick = () => {
        close();
        callbacks.onExit();
    };
    hud.querySelector<HTMLButtonElement>('#forage-walk-more')!.onclick = () => {
        forageSeed = Math.floor(Math.random() * 0xffffffff);
        callbacks.onLoading(populateShore(forageSeed, true));
        setMsg('沿着砾石浅滩换了一处，露出新一批不重样的天然河石');
    };
    putbackBtn.onclick = putBackInspected;
    hud.querySelector<HTMLButtonElement>('#forage-take')!.onclick = confirmTakeAndStandUp;
    compareBtn.onclick = confirmTakeAndCompare;
    collectBtn.onclick = () => {
        if (!inspected) return;
        const picked = inspected.spec;
        const res = box.collect(picked);
        if (!res.ok) {
            setMsg(res.reason ?? '石匣已满');
            return;
        }
        callbacks.onClink(picked.mass);
        setMsg(`已将「${picked.name}」收入随身石匣`);
        callbacks.onEquipStay(box.equipped);
        renderPocket();
        syncCaption();
    };

    async function ensureManifestAndPopulate() {
        await manifestReady;
        if (!active || closeAfterPutBack) return;
        if (items.filter(it => !it.isTemporaryTune).length < 12) {
            forageSeed = Math.floor(Math.random() * 0xffffffff);
            await populateShore(forageSeed);
        } else {
            renderPocket();
            syncCaption();
        }
    }

    function open() {
        if (active) return;
        active = true;
        closeAfterPutBack = false;
        rootGroup.visible = true;
        document.body.classList.add('forage-open');
        canvas.style.cursor = 'default';
        setMsg('');
        callbacks.onLoading(ensureManifestAndPopulate());
    }

    /** Open the lifted center-stage posture-tuning view directly for the currently equipped stone. */
    function openTuneCurrent(stone: StoneSpec) {
        if (!active) {
            active = true;
            rootGroup.visible = true;
            document.body.classList.add('forage-open');
            setMsg('');
        }
        closeAfterPutBack = true;
        // Remove any previous temporary tune item
        for (const old of items.filter(it => it.isTemporaryTune)) removeTakenItem(old);

        const { focusX, focusY } = computeForageCameraFrame();
        const restPos = new THREE.Vector3(focusX, focusY + 0.04, 0);
        const restQuat = new THREE.Quaternion();

        const root = new THREE.Group();
        root.position.copy(restPos);
        const visual = new THREE.Group();
        populateStoneGroup(visual, stone);
        root.add(visual);
        const collider = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), colliderMat);
        root.add(collider);

        const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0, depthWrite: false });
        const shadow = new THREE.Mesh(shadowGeom, shadowMat);
        shadow.visible = false;
        rootGroup.add(root);
        rootGroup.add(shadow);

        const tempItem: ShoreStoneItem = {
            spec: stone,
            root,
            visual,
            collider,
            shadow,
            shadowMat,
            restPos,
            restQuat,
            hoverAmount: 0,
            inspectBlend: 0,
            isTemporaryTune: true,
        };
        collider.userData.shoreItem = tempItem;
        items.push(tempItem);
        pickUpItem(tempItem);
    }

    function close() {
        if (!active) return;
        active = false;
        closeAfterPutBack = false;
        if (inspected) {
            const wasTemp = Boolean(inspected.isTemporaryTune);
            setStoneInspectLook(inspected.visual, false);
            if (wasTemp) removeTakenItem(inspected);
            inspected = undefined;
        }
        if (hovered) {
            setStoneHighlight(hovered.visual, false);
            hovered = undefined;
        }
        hoverRing.visible = false;
        postureRing.visible = false;
        dragState = undefined;
        rootGroup.visible = false;
        document.body.classList.remove('forage-open');
        hud.classList.remove('is-inspecting');
        captionEl.classList.remove('visible', 'inspecting');
        canvas.style.cursor = 'crosshair';
    }

    return {
        open,
        openTuneCurrent,
        close,
        isOpen: () => active,
        isInspecting: () => Boolean(inspected),
        putBackInspected,
        refreshPocket: renderPocket,
        consumeEphemeralAfterThrow() {
            if (!box.ephemeral) return;
            const thrownId = box.ephemeral.id;
            const match = items.find(it => it.spec.id === thrownId);
            if (match) removeTakenItem(match);
        },
        /** Compute fixed crouching riverbank camera pose & animate lift-and-enlarge posture tuning. */
        update(dt: number): Pose {
            const { focusX, focusY, camX, camY } = computeForageCameraFrame();

            const parallaxZ = inspected ? 0 : cursorNdcX * 0.024;
            const parallaxY = inspected ? 0 : cursorNdcY * 0.015;

            const goalPose: Pose = {
                position: new THREE.Vector3(camX, camY, 0),
                target: new THREE.Vector3(focusX + 0.10, focusY + parallaxY, parallaxZ),
                fov: inspected ? 34 : FORAGE_FOV,
            };

            camera.getWorldDirection(camForward);
            camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
            const animAlpha = 1 - Math.exp(-Math.max(0, dt) * 10);
            const launchParams = callbacks.getLaunch();
            spinPreviewAngle += Math.sign(launchParams.spin || 0) * Math.min(Math.abs(launchParams.spin) * 0.055, 1.35) * dt;

            let activeRingBlend = 0;

            for (const item of items) {
                const isInspected = item === inspected;
                const isHovered = item === hovered && !inspected;
                item.hoverAmount += ((isHovered ? 1 : 0) - item.hoverAmount) * animAlpha;
                item.inspectBlend += ((isInspected ? 1 : 0) - item.inspectBlend) * animAlpha;

                const baseShadow = item.spec.h > 0.011 ? 0.88 : 0.78;
                item.shadowMat.opacity = item.isTemporaryTune
                    ? 0
                    : baseShadow * (1 - item.inspectBlend) * (1 - item.hoverAmount * 0.45);

                // Smoothly lift UP and enlarge (1.0 -> 1.56x) when picked up to center-stage!
                const scale = 1 + (HERO_LIFT_SCALE - 1) * item.inspectBlend;
                item.root.scale.setScalar(scale);

                if (item.inspectBlend > 0.004) {
                    const maxR = Math.max(item.spec.a, item.spec.b, item.spec.h * 2.0, 0.032);
                    const inspectDist = clamp(maxR * 6.8, 0.26, 0.42);
                    goalInspectPos
                        .copy(camera.position)
                        .addScaledVector(camForward, inspectDist)
                        .addScaledVector(camUp, 0.052);

                    // Graceful upward arc while lifting off the shore
                    item.root.position.lerpVectors(item.restPos, goalInspectPos, item.inspectBlend);
                    item.root.position.y += Math.sin(item.inspectBlend * Math.PI) * 0.045;

                    if (inspectMode === 'tune') {
                        // World-horizontal posture display so user directly sees attack tilt & side roll vs water plane!
                        poseYawQuat.setFromAxisAngle(upAxis, -0.32); // subtle 3/4 view angle to read both tilt & roll clearly
                        poseTiltQuat.setFromAxisAngle(zAxis, THREE.MathUtils.degToRad(launchParams.tilt));
                        poseRollQuat.setFromAxisAngle(xAxis, THREE.MathUtils.degToRad(launchParams.roll ?? 0));
                        spinQuat.setFromAxisAngle(upAxis, spinPreviewAngle);
                        tempQuat.copy(poseYawQuat).multiply(poseTiltQuat).multiply(poseRollQuat).multiply(spinQuat);
                        item.root.quaternion.slerpQuaternions(item.restQuat, tempQuat, item.inspectBlend);

                        activeRingBlend = item.inspectBlend;
                        postureRing.position.copy(item.root.position);
                        postureRing.position.y -= item.spec.h * scale + 0.010;
                        const ringScale = Math.min((maxR * scale) / 0.058, 1.12);
                        postureRing.scale.set(ringScale, ringScale, 1);
                    } else {
                        inspectEuler.set(inspectPitch, inspectYaw, 0, 'YXZ');
                        inspectQuat.setFromEuler(inspectEuler);
                        tempQuat.copy(camera.quaternion).multiply(inspectQuat);
                        item.root.quaternion.slerpQuaternions(item.restQuat, tempQuat, item.inspectBlend);
                    }
                } else {
                    item.root.position.copy(item.restPos);
                    item.root.position.y += item.hoverAmount * 0.014;
                    item.root.quaternion.copy(item.restQuat);
                }
            }

            if (activeRingBlend > 0.05) {
                postureRing.visible = true;
                postureRingMat.opacity = 0.34 * activeRingBlend;
            } else {
                postureRing.visible = false;
            }

            if (hovered && !inspected) {
                hoverRing.visible = true;
                const rScale = Math.max(hovered.spec.a, hovered.spec.b) / 0.042;
                hoverRing.scale.set(rScale, rScale, 1);
                const { y: ringY, normal } = sampleRenderedShore(hovered.restPos.x, hovered.restPos.z);
                hoverRing.position.set(hovered.restPos.x, ringY + 0.004, hovered.restPos.z);
                hoverRing.quaternion.setFromUnitVectors(zAxis, normal);
            } else {
                hoverRing.visible = false;
            }

            return goalPose;
        },
        rootGroup,
    };
}
