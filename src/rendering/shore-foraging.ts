import * as THREE from 'three';
import { shoreElevation, shorelineCurveX, shoreNormal } from './sunset-env';
import { populateStoneGroup, setStoneHighlight } from './stone-mesh';
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

const SHORE_STONE_COUNT = 34;
const WALK_Z_LIMIT = 2.85;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

interface ShoreStoneItem {
    spec: StoneSpec;
    root: THREE.Group;
    visual: THREE.Group;
    collider: THREE.Mesh;
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

/** Live 3D twilight riverbank foraging:
 *  - Scatters up to 34 strictly unique Blender GLB stones naturally clustered along the wet gravel shore
 *  - Movable crouching camera (drag / WASD / wheel zoom)
 *  - True 3D Raycaster hover highlight & click-to-levitate 360° close-up inspection */
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
        new THREE.RingGeometry(0.052, 0.062, 36),
        new THREE.MeshBasicMaterial({
            color: 0xffcf86,
            transparent: true,
            opacity: 0.72,
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

    // Mount minimal cinematic Forage HUD inside #app
    const hud = document.createElement('div');
    hud.id = 'forage-hud';
    hud.className = 'forage-hud';
    hud.innerHTML = `
      <div class="forage-top-bar">
        <div class="forage-banner">
          <span class="pill-dot"></span>
          <span>暮色浅滩寻石 · 拖动/WASD 沿岸移动 · 滚轮俯身拉近 · 点击石子端详</span>
        </div>
        <div class="forage-top-actions">
          <span class="career-pill" id="forage-career">累计 0 跳</span>
          <button id="forage-walk-more" class="glass-pill" type="button">往前再走走</button>
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
          <span class="inspect-tip">按住拖动 360° 翻转看薄厚</span>
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

    // Crouching movable camera state along the wet riverbank
    let walkZ = 0;
    let walkX = 0;
    let zoom = 1.0;
    let targetWalkZ = 0;
    let targetWalkX = 0;
    let targetZoom = 1.0;
    let cursorNdcX = 0;
    let cursorNdcY = 0;

    // 360° in-hand inspection rotation state
    let inspectYaw = 0.5;
    let inspectPitch = 0.42;
    const inspectEuler = new THREE.Euler();
    const inspectQuat = new THREE.Quaternion();

    const keysDown = new Set<string>();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const camForward = new THREE.Vector3();
    const camUp = new THREE.Vector3();
    const goalInspectPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();

    const captionEl = hud.querySelector<HTMLElement>('#forage-caption')!;
    const msgEl = hud.querySelector<HTMLElement>('#forage-msg')!;
    const collectBtn = hud.querySelector<HTMLButtonElement>('#forage-collect')!;

    function setMsg(text: string) {
        msgEl.textContent = text;
    }

    function disposeItems() {
        for (const item of items) {
            rootGroup.remove(item.root);
            item.collider.geometry.dispose();
            item.visual.traverse(obj => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
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
        const specs = forageShoreStones(
            box.careerSkips,
            seed,
            SHORE_STONE_COUNT,
            catalog,
            avoidPrevious ? lastBatchManifestIds : undefined
        );
        lastBatchManifestIds = new Set(
            specs.map(s => (s.variant !== undefined ? `${s.archetypeId}_${String(s.variant).padStart(2, '0')}` : s.id))
        );
        const placed: { x: number; z: number }[] = [];

        // Deterministic PRNG for spatial scatter along the natural shoreline cove
        let rngState = (seed ^ 0x51f23a9b) >>> 0;
        const rand = () => {
            rngState = (rngState + 0x6d2b79f5) >>> 0;
            let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
            t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // Organic fluvial gravel-bar cluster centers along the wet-to-damp shoreline
        const clusters = Array.from({ length: 6 }, (_, idx) => {
            const baseZ = -2.5 + idx * 1.0 + (rand() - 0.5) * 0.45;
            return {
                z: clamp(baseZ, -2.8, 2.8),
                inland: 0.24 + rand() * 0.78,
            };
        });

        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            let px = -1.2;
            let pz = 0;
            // Fluvial clustering + non-overlapping spacing (0.145 m) so every crouching frame holds 10–14 distinct stones
            for (let attempt = 0; attempt < 60; attempt++) {
                const useCluster = attempt < 40 && rand() < 0.72;
                let candidateZ: number;
                let inlandOffset: number;
                if (useCluster) {
                    const c = clusters[Math.floor(rand() * clusters.length)];
                    const angle = rand() * Math.PI * 2;
                    const radius = 0.14 + Math.sqrt(rand()) * 0.46;
                    candidateZ = clamp(c.z + Math.cos(angle) * radius, -3.05, 3.05);
                    inlandOffset = clamp(c.inland + Math.sin(angle) * radius * 0.68, 0.16, 1.32);
                } else {
                    candidateZ = (rand() - 0.5) * 6.1;
                    // Bias gently toward the damp water edge where flat stones wash ashore
                    inlandOffset = 0.16 + Math.pow(rand(), 1.18) * 1.18;
                }
                const waterEdge = shorelineCurveX(candidateZ);
                const candidateX = waterEdge - inlandOffset;
                const minDist = attempt < 45 ? 0.145 : 0.115;
                if (placed.every(p => Math.hypot(p.x - candidateX, p.z - candidateZ) >= minDist)) {
                    px = candidateX;
                    pz = candidateZ;
                    break;
                }
            }
            placed.push({ x: px, z: pz });

            const py = shoreElevation(px, pz);
            const normal = shoreNormal(px, pz);
            // Seat stone naturally on the gravel surface, gently nestled 20% of its thickness
            const restPos = new THREE.Vector3(px, py + spec.h * 0.78, pz);
            const alignSlope = new THREE.Quaternion().setFromUnitVectors(upAxis, normal);
            const randomYaw = new THREE.Quaternion().setFromAxisAngle(upAxis, rand() * Math.PI * 2);
            const restQuat = alignSlope.multiply(randomYaw);

            const root = new THREE.Group();
            root.position.copy(restPos);
            root.quaternion.copy(restQuat);

            const visual = new THREE.Group();
            populateStoneGroup(visual, spec);
            root.add(visual);

            const hitRadius = Math.max(spec.a, spec.b) * 1.24 + 0.015;
            const collider = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 10, 8), colliderMat);
            collider.userData.shoreIndex = i;
            root.add(collider);

            rootGroup.add(root);
            items.push({
                spec,
                root,
                visual,
                collider,
                restPos,
                restQuat,
                hoverAmount: 0,
                inspectBlend: 0,
            });
        }
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
        const nextHover = hits.length > 0 ? items[hits[0].object.userData.shoreIndex as number] : undefined;
        if (nextHover !== hovered) {
            if (hovered) setStoneHighlight(hovered.visual, false);
            hovered = nextHover;
            if (hovered) setStoneHighlight(hovered.visual, true);
            canvas.style.cursor = hovered ? 'pointer' : 'grab';
            setMsg('');
            syncCaption();
        }
    }

    // Pointer interaction on the main canvas while Forage Mode is active (capture phase to isolate from throw gesture)
    let dragState:
        | { pointerId: number; kind: 'pan' | 'rotate'; startX: number; startY: number; lastX: number; lastY: number; moved: number }
        | undefined;

    canvas.addEventListener('pointerdown', event => {
        if (!active) return;
        event.stopImmediatePropagation();
        if (!event.isPrimary) return;
        const kind = inspected && event.button === 0 ? 'rotate' : 'pan';
        dragState = {
            pointerId: event.pointerId,
            kind,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            moved: 0,
        };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = 'grabbing';
        event.preventDefault();
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

            if (dragState.kind === 'rotate') {
                inspectYaw += dx * 0.011;
                inspectPitch = clamp(inspectPitch + dy * 0.011, -1.45, 1.45);
            } else {
                // Dragging empty shore glides smoothly along the riverbank
                targetWalkZ = clamp(targetWalkZ - dx * 0.0042 * targetZoom, -WALK_Z_LIMIT, WALK_Z_LIMIT);
                targetWalkX = clamp(targetWalkX - dy * 0.0024 * targetZoom, -0.45, 0.45);
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
        const prevKind = dragState.kind;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        dragState = undefined;

        if (wasClick) {
            if (prevKind === 'pan') {
                updateRaycast(event.clientX, event.clientY);
                if (hovered) {
                    inspected = hovered;
                    setStoneHighlight(inspected.visual, false);
                    hovered = undefined;
                    hoverRing.visible = false;
                    inspectYaw = 0.45;
                    inspectPitch = 0.38;
                    setMsg('');
                    callbacks.onClink(inspected.spec.mass);
                    syncCaption();
                }
            } else if (prevKind === 'rotate' && inspected) {
                // Clicking empty space away from center while inspecting puts the stone back gently
                const boxRect = canvas.getBoundingClientRect();
                const cx = (event.clientX - boxRect.left) / boxRect.width - 0.5;
                const cy = (event.clientY - boxRect.top) / boxRect.height - 0.5;
                if (Math.hypot(cx, cy) > 0.22) {
                    putBackInspected();
                }
            }
        }
        canvas.style.cursor = inspected ? 'grab' : (hovered ? 'pointer' : 'grab');
    };
    canvas.addEventListener('pointerup', endDrag, true);
    canvas.addEventListener('pointercancel', endDrag, true);

    canvas.addEventListener('wheel', event => {
        if (!active) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        targetZoom = clamp(targetZoom + (event.deltaY > 0 ? 0.08 : -0.08), 0.56, 1.38);
    }, { capture: true, passive: false });

    canvas.addEventListener('contextmenu', event => {
        if (active) event.preventDefault();
    });

    window.addEventListener('keydown', event => {
        if (!active) return;
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            keysDown.add(event.code);
            event.preventDefault();
        }
    });
    window.addEventListener('keyup', event => {
        keysDown.delete(event.code);
    });

    function putBackInspected() {
        if (!inspected) return;
        inspected = undefined;
        setMsg('');
        syncCaption();
        canvas.style.cursor = 'grab';
    }

    // Wire minimal HUD buttons
    hud.querySelector<HTMLButtonElement>('#forage-return')!.onclick = () => {
        close();
        callbacks.onExit();
    };
    hud.querySelector<HTMLButtonElement>('#forage-walk-more')!.onclick = () => {
        forageSeed = Math.floor(Math.random() * 0xffffffff);
        targetWalkZ = clamp((Math.random() - 0.5) * 1.6, -2.2, 2.2);
        targetWalkX = 0;
        populateShore(forageSeed, true);
        setMsg('沿着暮色岸边往前走了一段，地面露出新一批不重样的天然河石');
    };
    hud.querySelector<HTMLButtonElement>('#forage-putback')!.onclick = putBackInspected;
    hud.querySelector<HTMLButtonElement>('#forage-take')!.onclick = () => {
        if (!inspected) return;
        const picked = inspected.spec;
        if (box.stones.some(s => s.id === picked.id)) {
            box.equipSaved(picked.id);
        } else {
            box.equipEphemeral(picked);
            // Remove the taken stone from the shore ground
            const taken = inspected;
            rootGroup.remove(taken.root);
            items = items.filter(i => i !== taken);
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
        if (items.length < 6) {
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
        canvas.style.cursor = 'grab';
        setMsg('');
        void ensureManifestAndPopulate();
    }

    function close() {
        if (!active) return;
        active = false;
        inspected = undefined;
        if (hovered) {
            setStoneHighlight(hovered.visual, false);
            hovered = undefined;
        }
        hoverRing.visible = false;
        keysDown.clear();
        dragState = undefined;
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
            if (match) {
                rootGroup.remove(match.root);
                items = items.filter(it => it !== match);
            }
        },
        /** Compute smooth crouching riverbank camera pose & animate stone hover/levitation. */
        update(dt: number): Pose {
            // Keyboard stroll along riverbank (when not inspecting)
            if (!inspected) {
                const walkSpeed = 1.65 * dt;
                if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) targetWalkZ = clamp(targetWalkZ - walkSpeed, -WALK_Z_LIMIT, WALK_Z_LIMIT);
                if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) targetWalkZ = clamp(targetWalkZ + walkSpeed, -WALK_Z_LIMIT, WALK_Z_LIMIT);
                if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) targetWalkX = clamp(targetWalkX + walkSpeed * 0.55, -0.45, 0.45);
                if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) targetWalkX = clamp(targetWalkX - walkSpeed * 0.55, -0.45, 0.45);
            }

            const smooth = 1 - Math.exp(-Math.max(0, dt) * 8);
            walkZ += (targetWalkZ - walkZ) * smooth;
            walkX += (targetWalkX - walkX) * smooth;
            zoom += (targetZoom - zoom) * smooth;

            const waterEdge = shorelineCurveX(walkZ);
            const focusX = waterEdge - 0.68 + walkX * 0.65;
            const focusY = shoreElevation(focusX, walkZ) + 0.03;
            const camX = focusX - (1.02 * zoom);
            const camY = Math.max(0.32, focusY + 0.64 * zoom);
            const camZ = walkZ + 0.14 * zoom;

            // Gentle alive gaze parallax
            const parallaxZ = inspected ? 0 : cursorNdcX * 0.06;
            const parallaxY = inspected ? 0 : cursorNdcY * 0.035;

            const goalPose: Pose = {
                position: new THREE.Vector3(camX, camY, camZ),
                target: new THREE.Vector3(focusX + 0.12, focusY + parallaxY, walkZ + parallaxZ),
                fov: inspected ? 36 : 44,
            };

            // Animate each stone smoothly between its gravel resting pose, hover lift, and 360° levitation inspection
            camera.getWorldDirection(camForward);
            camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
            const animAlpha = 1 - Math.exp(-Math.max(0, dt) * 11);

            for (const item of items) {
                const isInspected = item === inspected;
                const isHovered = item === hovered && !inspected;
                item.hoverAmount += ((isHovered ? 1 : 0) - item.hoverAmount) * animAlpha;
                item.inspectBlend += ((isInspected ? 1 : 0) - item.inspectBlend) * animAlpha;

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
                    item.root.position.y += item.hoverAmount * 0.011;
                    item.root.quaternion.copy(item.restQuat);
                }
            }

            if (hovered && !inspected) {
                hoverRing.visible = true;
                const rScale = Math.max(hovered.spec.a, hovered.spec.b) / 0.042;
                hoverRing.scale.set(rScale, rScale, 1);
                hoverRing.position.set(hovered.restPos.x, shoreElevation(hovered.restPos.x, hovered.restPos.z) + 0.008, hovered.restPos.z);
                const normal = shoreNormal(hovered.restPos.x, hovered.restPos.z);
                hoverRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            } else {
                hoverRing.visible = false;
            }

            return goalPose;
        },
        rootGroup,
    };
}
