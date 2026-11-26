import * as THREE from 'three';
import { shoreElevation, shorelineCurveX, shoreNormal } from './sunset-env';
import { populateStoneGroup, setStoneHighlight, setStoneInspectLook } from './stone-mesh';
import {
    forageShoreStones,
    formatStoneDimensions,
    loadStoneManifest,
    MAX_COLLECTION_SIZE,
    type ManifestStoneEntry,
    type StoneBox,
    type StoneSpec,
} from '../simulation/stones';
import type { Pose } from '../camera/rig';

const SHORE_STONE_COUNT = 52;
const FORAGE_FOV = 45;
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
}

export interface ShoreForagingCallbacks {
    onEquipAndStandUp(stone: StoneSpec): void;
    onEquipStay(stone: StoneSpec): void;
    onClink(mass: number): void;
    onExit(): void;
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

/** Shared radial soft ambient-occlusion contact shadow texture so every stone sits grounded into the gravel bed. */
function createContactShadowTexture(): THREE.DataTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        const ny = (y + 0.5) / size * 2 - 1;
        for (let x = 0; x < size; x++) {
            const nx = (x + 0.5) / size * 2 - 1;
            const r = Math.hypot(nx, ny);
            const falloff = Math.pow(Math.max(0, 1 - r), 1.85);
            const o = (y * size + x) * 4;
            data[o] = 16;
            data[o + 1] = 14;
            data[o + 2] = 15;
            data[o + 3] = Math.round(falloff * 188);
        }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.needsUpdate = true;
    return tex;
}

/** Live 3D twilight riverbank foraging (Direction A — natural geological gravel bar):
 *  - Mixes 52 strictly unique Blender GLB hero stones seamlessly into a 2,800-pebble real gravel bed
 *  - Natural fluvial bar clustering, half-buried embedding, stream-imbricated tilts, waterline wetness & contact AO
 *  - Pure mouse direct picking (no WASD / no panning): hover to preview, click to lift & 360° inspect */
export function createShoreForaging(
    scene: THREE.Scene,
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
            opacity: 0.65,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
    );
    hoverRing.visible = false;
    rootGroup.add(hoverRing);

    const colliderMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
    });

    const shadowGeom = new THREE.PlaneGeometry(1, 1);
    const shadowTex = createContactShadowTexture();

    // Mount minimal cinematic Forage HUD inside #app
    const hud = document.createElement('div');
    hud.id = 'forage-hud';
    hud.className = 'forage-hud';
    hud.innerHTML = `
      <div class="forage-top-bar">
        <div class="forage-banner">
          <span class="pill-dot"></span>
          <span id="forage-banner-text">暮色浅滩寻石 · 鼠标直接点选河石 · 抬起后 360° 翻转看薄厚</span>
        </div>
        <div class="forage-top-actions">
          <span class="career-pill" id="forage-career">累计 0 跳</span>
          <button id="forage-walk-more" class="glass-pill" type="button">换一片浅滩</button>
          <button id="forage-return" class="glass-pill active" type="button">回到湖面 <kbd>F</kbd></button>
        </div>
      </div>

      <div id="forage-caption" class="forage-caption">
        <div class="forage-cap-head">
          <strong id="forage-stone-name"></strong>
          <span id="forage-stone-rarity" class="rarity-tag"></span>
          <span id="forage-stone-dims" class="forage-dims"></span>
        </div>
        <p id="forage-stone-feel" class="forage-feel"></p>
        <div id="forage-inspect-actions" class="forage-inspect-actions">
          <span class="inspect-tip">按住拖动 360° 翻转看薄厚 · 右键或点空白处放回</span>
          <div class="inspect-btns">
            <button id="forage-take" class="dock-btn primary" type="button">拿去投</button>
            <button id="forage-collect" class="dock-btn" type="button">收入石匣</button>
            <button id="forage-putback" class="dock-btn" type="button">放回岸滩</button>
          </div>
        </div>
        <p id="forage-msg" class="forage-msg"></p>
      </div>

      <div class="forage-pocket" aria-label="随身石匣">
        <div class="forage-pocket-head">
          <span>随身石匣</span>
          <small id="forage-pocket-count">1 / ${MAX_COLLECTION_SIZE}</small>
        </div>
        <div id="forage-pocket-list" class="forage-pocket-list"></div>
      </div>
    `;
    document.querySelector('#app')!.append(hud);

    let active = false;
    let catalog: ManifestStoneEntry[] = [];
    let manifestLoaded = false;
    let items: ShoreStoneItem[] = [];
    let hovered: ShoreStoneItem | undefined;
    let inspected: ShoreStoneItem | undefined;
    let forageSeed = Math.floor(Math.random() * 0xffffffff);
    let lastBatchManifestIds = new Set<string>();

    let cursorNdcX = 0;
    let cursorNdcY = 0;

    // 360° in-hand inspection rotation state
    let inspectYaw = 0.5;
    let inspectPitch = 0.42;
    const inspectEuler = new THREE.Euler();
    const inspectQuat = new THREE.Quaternion();

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const upAxis = new THREE.Vector3(0, 1, 0);
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

    function setMsg(text: string) {
        msgEl.textContent = text;
    }

    function syncBannerCount() {
        bannerTextEl.textContent = `暮色浅滩寻石 · 砾石滩藏有 ${items.length} 块可拾河石 · 鼠标直点 360° 端详`;
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
    }

    function populateShore(seed: number, avoidPrevious = false) {
        disposeItems();
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

        // Deterministic PRNG for organic fluvial gravel-bar deposition
        let rngState = (seed ^ 0x51f23a9b) >>> 0;
        const rand = () => {
            rngState = (rngState + 0x6d2b79f5) >>> 0;
            let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
            t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const randSigned = () => (rand() + rand() - 1); // triangular distribution peaked at 0

        const safeAspect = clamp(camera.aspect || 1.6, 0.70, 1.82);
        const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(FORAGE_FOV * 0.5));
        const halfZFar = 1.84 * tanHalfFov * safeAspect * 0.90;
        const halfZNear = 1.04 * tanHalfFov * safeAspect * 0.86;

        // 5 natural meandering fluvial pebble-bar lobes along the curved damp shoreline (breaks artificial box silhouette!)
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

        // Place larger stones first so smaller flats & wafers naturally settle around cobble shoulders
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
                    // Fluvial gravel-bar cluster along damp shoreline (organic pockets, never a uniform grid)
                    const lobe = lobes[Math.floor(rand() * lobes.length)];
                    candidateZ = lobe.z + randSigned() * lobe.spreadZ;
                    inlandOffset = lobe.inland + randSigned() * lobe.spreadX;
                } else if (mode < 0.86) {
                    // Wet waterline wash band (including a few stones half-awash right at the shallow edge)
                    inlandOffset = -0.04 + Math.pow(rand(), 1.3) * 0.34;
                    candidateZ = (rand() * 2 - 1) * halfZFar * 1.04;
                } else {
                    // Sparse upper-bank stragglers fading softly into the dry foreground gravel
                    const t = 0.45 + rand() * 0.55;
                    inlandOffset = 0.06 + t * 0.96;
                    const maxZ = halfZFar + (halfZNear - halfZFar) * t;
                    candidateZ = (rand() * 2 - 1) * maxZ * 0.96;
                }

                // Soft viewport framing envelope (no sharp rectangular cutoff, yet every stone stays reachable)
                inlandOffset = clamp(inlandOffset, -0.05, 1.02);
                const tNorm = clamp((inlandOffset + 0.05) / 1.07, 0, 1);
                const maxZ = halfZFar + (halfZNear - halfZFar) * tNorm;
                candidateZ = clamp(candidateZ, -maxZ * 1.03, maxZ * 1.03);

                const candidateX = shorelineCurveX(candidateZ) - inlandOffset;

                // Allow occasional realistic edge imbrication (a thin flat slightly leaning against a neighbor's rim)
                let ok = true;
                let bestLift = 0;
                const desiredGap = attempt < 45 ? 0.016 : attempt < 80 ? 0.006 : -0.006;
                for (const p of placed) {
                    const d = Math.hypot(p.x - candidateX, p.z - candidateZ);
                    const minSep = p.r + radius + desiredGap;
                    if (d < minSep) {
                        // Permit gentle shoulder overlap only for a thin stone kissing a thicker rock's outer edge
                        const canLean = isThin && p.h > spec.h * 1.35 && d >= (p.r + radius * 0.68) && bestLift === 0;
                        if (canLean) {
                            bestLift = Math.min(0.007, p.h * 0.35);
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
            const py = shoreElevation(px, pz);
            const normal = shoreNormal(px, pz);

            // Real geological embedding: thick cobbles sink 40–55% into gravel; thin flats nestle 26–44%
            const isBulky = spec.h > 0.011;
            const exposeRatio = isBulky
                ? (0.44 + rand() * 0.16)
                : (0.56 + rand() * 0.18);
            const restPos = new THREE.Vector3(px, py + spec.h * exposeRatio + leanLift, pz);

            // Natural fluvial imbrication: stones tilt gently 4°–16° instead of lying flat like coins on a table
            const alignSlope = new THREE.Quaternion().setFromUnitVectors(upAxis, normal);
            const yawRad = rand() * Math.PI * 2;
            const randomYaw = new THREE.Quaternion().setFromAxisAngle(upAxis, yawRad);
            const cantMax = isBulky ? 0.24 : 0.20;
            // Subtle downstream/shoreward bias + organic random cant
            cantEuler.set(
                (rand() - 0.5) * cantMax * 1.4,
                0,
                (rand() - 0.38) * cantMax * 1.4 + (leanLift > 0 ? 0.14 : 0)
            );
            cantQuat.setFromEuler(cantEuler);
            const restQuat = alignSlope.multiply(randomYaw).multiply(cantQuat);

            // Waterline wetness coupling: stones near/in the shallow water edge look authentically dark & damp
            const shoreWetness = 1 - THREE.MathUtils.smoothstep(py, -0.01, 0.095);

            const root = new THREE.Group();
            root.position.copy(restPos);
            root.quaternion.copy(restQuat);

            const visual = new THREE.Group();
            populateStoneGroup(visual, spec, undefined, { shoreWetness });
            root.add(visual);

            const hitRadius = Math.max(spec.a, spec.b) * 1.12 + 0.009;
            const collider = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 10, 8), colliderMat);
            root.add(collider);

            // Soft contact AO shadow seated right on the gravel surface beneath each stone (aligned to stone yaw)
            const shadowMat = new THREE.MeshBasicMaterial({
                map: shadowTex,
                transparent: true,
                depthWrite: false,
                opacity: isBulky ? 0.80 : 0.68,
            });
            const shadow = new THREE.Mesh(shadowGeom, shadowMat);
            shadow.position.set(px, py + 0.0025, pz);
            shadow.quaternion.setFromUnitVectors(zAxis, normal);
            shadow.rotateOnAxis(zAxis, yawRad);
            shadow.scale.set(spec.a * 2.55, spec.b * 2.55, 1);

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

    function syncCaption() {
        const target = inspected ?? hovered;
        if (!target) {
            captionEl.classList.remove('visible', 'inspecting');
            return;
        }
        const s = target.spec;
        hud.querySelector('#forage-stone-name')!.textContent = s.name;
        const rarityEl = hud.querySelector<HTMLElement>('#forage-stone-rarity')!;
        rarityEl.textContent = s.rarityLabel;
        rarityEl.className = `rarity-tag rarity-${s.rarity}`;
        hud.querySelector('#forage-stone-dims')!.textContent = formatStoneDimensions(s);
        hud.querySelector('#forage-stone-feel')!.textContent = s.feel;
        captionEl.classList.add('visible');
        captionEl.classList.toggle('inspecting', Boolean(inspected));

        if (inspected) {
            const alreadySaved = box.stones.some(saved => saved.id === s.id);
            collectBtn.disabled = alreadySaved;
            collectBtn.textContent = alreadySaved ? '已在石匣中' : '收入石匣';
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

    // Pure mouse interaction (capture phase isolates foraging from lake pull-to-throw)
    let rotateDrag:
        | { pointerId: number; lastX: number; lastY: number; moved: number }
        | undefined;

    canvas.addEventListener('pointerdown', event => {
        if (!active) return;
        event.stopImmediatePropagation();
        if (!event.isPrimary) return;

        // Right-click while inspecting puts the stone back immediately
        if (event.button === 2) {
            if (inspected) putBackInspected();
            event.preventDefault();
            return;
        }
        if (event.button !== 0) return;

        if (inspected) {
            rotateDrag = {
                pointerId: event.pointerId,
                lastX: event.clientX,
                lastY: event.clientY,
                moved: 0,
            };
            canvas.setPointerCapture(event.pointerId);
            canvas.style.cursor = 'grabbing';
            event.preventDefault();
            return;
        }

        // Clicking directly on any visible stone lifts it into 360° hand inspection
        updateRaycast(event.clientX, event.clientY);
        if (hovered) {
            inspected = hovered;
            setStoneHighlight(inspected.visual, false);
            setStoneInspectLook(inspected.visual, true);
            hovered = undefined;
            hoverRing.visible = false;
            inspectYaw = 0.45;
            inspectPitch = 0.38;
            setMsg('');
            callbacks.onClink(inspected.spec.mass);
            syncCaption();
            canvas.style.cursor = 'grab';
            event.preventDefault();
        }
    }, true);

    canvas.addEventListener('pointermove', event => {
        if (!active) return;
        event.stopImmediatePropagation();
        if (rotateDrag && rotateDrag.pointerId === event.pointerId) {
            const dx = event.clientX - rotateDrag.lastX;
            const dy = event.clientY - rotateDrag.lastY;
            rotateDrag.lastX = event.clientX;
            rotateDrag.lastY = event.clientY;
            rotateDrag.moved += Math.hypot(dx, dy);
            inspectYaw += dx * 0.011;
            inspectPitch = clamp(inspectPitch + dy * 0.011, -1.45, 1.45);
            return;
        }
        updateRaycast(event.clientX, event.clientY);
    }, true);

    const endRotate = (event: PointerEvent) => {
        if (!active) return;
        event.stopImmediatePropagation();
        if (!rotateDrag || rotateDrag.pointerId !== event.pointerId) return;
        const wasClick = rotateDrag.moved < 7;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        rotateDrag = undefined;

        if (wasClick && inspected) {
            const boxRect = canvas.getBoundingClientRect();
            const cx = (event.clientX - boxRect.left) / boxRect.width - 0.5;
            const cy = (event.clientY - boxRect.top) / boxRect.height - 0.5;
            if (Math.hypot(cx, cy) > 0.20) {
                putBackInspected();
                return;
            }
        }
        canvas.style.cursor = inspected ? 'grab' : (hovered ? 'pointer' : 'default');
    };
    canvas.addEventListener('pointerup', endRotate, true);
    canvas.addEventListener('pointercancel', endRotate, true);

    // Swallow wheel while foraging so accidental scroll doesn't alter background launch tilt/roll
    canvas.addEventListener('wheel', event => {
        if (!active) return;
        event.stopImmediatePropagation();
        event.preventDefault();
    }, { capture: true, passive: false });

    canvas.addEventListener('contextmenu', event => {
        if (active) event.preventDefault();
    });

    function putBackInspected() {
        if (!inspected) return;
        setStoneInspectLook(inspected.visual, false);
        inspected = undefined;
        setMsg('');
        syncCaption();
        canvas.style.cursor = 'default';
    }

    // Wire minimal HUD buttons
    hud.querySelector<HTMLButtonElement>('#forage-return')!.onclick = () => {
        close();
        callbacks.onExit();
    };
    hud.querySelector<HTMLButtonElement>('#forage-walk-more')!.onclick = () => {
        forageSeed = Math.floor(Math.random() * 0xffffffff);
        populateShore(forageSeed, true);
        setMsg('沿着砾石浅滩换了一处，露出新一批不重样的天然河石');
    };
    hud.querySelector<HTMLButtonElement>('#forage-putback')!.onclick = putBackInspected;
    hud.querySelector<HTMLButtonElement>('#forage-take')!.onclick = () => {
        if (!inspected) return;
        const picked = inspected.spec;
        setStoneInspectLook(inspected.visual, false);
        if (box.stones.some(s => s.id === picked.id)) {
            box.equipSaved(picked.id);
        } else {
            box.equipEphemeral(picked);
            removeTakenItem(inspected);
        }
        inspected = undefined;
        callbacks.onClink(picked.mass);
        close();
        callbacks.onEquipAndStandUp(box.equipped);
    };
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
        if (!manifestLoaded) {
            manifestLoaded = true;
            catalog = await loadStoneManifest();
        }
        if (items.length < 12) {
            forageSeed = Math.floor(Math.random() * 0xffffffff);
            populateShore(forageSeed);
        } else {
            renderPocket();
            syncCaption();
        }
    }

    function open() {
        if (active) return;
        active = true;
        rootGroup.visible = true;
        document.body.classList.add('forage-open');
        canvas.style.cursor = 'default';
        setMsg('');
        void ensureManifestAndPopulate();
    }

    function close() {
        if (!active) return;
        active = false;
        if (inspected) {
            setStoneInspectLook(inspected.visual, false);
            inspected = undefined;
        }
        if (hovered) {
            setStoneHighlight(hovered.visual, false);
            hovered = undefined;
        }
        hoverRing.visible = false;
        rotateDrag = undefined;
        rootGroup.visible = false;
        document.body.classList.remove('forage-open');
        captionEl.classList.remove('visible', 'inspecting');
        canvas.style.cursor = 'crosshair';
    }

    // Preload manifest quietly in the background on startup so first F press is instant!
    void loadStoneManifest().then(list => {
        catalog = list;
        manifestLoaded = true;
    });

    return {
        open,
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
        /** Compute fixed crouching riverbank camera pose & animate stone hover/levitation. */
        update(dt: number): Pose {
            const { focusX, focusY, camX, camY } = computeForageCameraFrame();

            // Subtle alive eye parallax that keeps every stone firmly within the viewport
            const parallaxZ = inspected ? 0 : cursorNdcX * 0.024;
            const parallaxY = inspected ? 0 : cursorNdcY * 0.015;

            const goalPose: Pose = {
                position: new THREE.Vector3(camX, camY, 0),
                target: new THREE.Vector3(focusX + 0.10, focusY + parallaxY, parallaxZ),
                fov: inspected ? 36 : FORAGE_FOV,
            };

            // Animate each stone smoothly between its embedded resting pose, hover lift, and 360° levitation inspection
            camera.getWorldDirection(camForward);
            camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
            const animAlpha = 1 - Math.exp(-Math.max(0, dt) * 11);

            for (const item of items) {
                const isInspected = item === inspected;
                const isHovered = item === hovered && !inspected;
                item.hoverAmount += ((isHovered ? 1 : 0) - item.hoverAmount) * animAlpha;
                item.inspectBlend += ((isInspected ? 1 : 0) - item.inspectBlend) * animAlpha;

                const baseShadow = item.spec.h > 0.011 ? 0.80 : 0.68;
                item.shadowMat.opacity = baseShadow * (1 - item.inspectBlend) * (1 - item.hoverAmount * 0.35);

                if (item.inspectBlend > 0.004) {
                    const maxR = Math.max(item.spec.a, item.spec.b, item.spec.h * 2.0, 0.03);
                    const inspectDist = clamp(maxR * 5.6, 0.21, 0.34);
                    goalInspectPos
                        .copy(camera.position)
                        .addScaledVector(camForward, inspectDist)
                        .addScaledVector(camUp, 0.016);

                    item.root.position.lerpVectors(item.restPos, goalInspectPos, item.inspectBlend);
                    inspectEuler.set(inspectPitch, inspectYaw, 0, 'YXZ');
                    inspectQuat.setFromEuler(inspectEuler);
                    tempQuat.copy(camera.quaternion).multiply(inspectQuat);
                    item.root.quaternion.slerpQuaternions(item.restQuat, tempQuat, item.inspectBlend);
                } else {
                    item.root.position.copy(item.restPos);
                    item.root.position.y += item.hoverAmount * 0.013;
                    item.root.quaternion.copy(item.restQuat);
                }
            }

            if (hovered && !inspected) {
                hoverRing.visible = true;
                const rScale = Math.max(hovered.spec.a, hovered.spec.b) / 0.042;
                hoverRing.scale.set(rScale, rScale, 1);
                hoverRing.position.set(hovered.restPos.x, shoreElevation(hovered.restPos.x, hovered.restPos.z) + 0.007, hovered.restPos.z);
                const normal = shoreNormal(hovered.restPos.x, hovered.restPos.z);
                hoverRing.quaternion.setFromUnitVectors(zAxis, normal);
            } else {
                hoverRing.visible = false;
            }

            return goalPose;
        },
        rootGroup,
    };
}
