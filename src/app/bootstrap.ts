import * as THREE from 'three';
import { commitRecord, updateTelemetry } from '../ui/telemetry';
import { type Launch } from '../simulation/physics';
import { Session, type ReplayMode } from './session';
import { CameraRig, type ViewMode } from '../camera/rig';
import { mountCameraPanel } from '../ui/camera-panel';
import { PullThrowGesture } from '../input/pull-gesture';
import { parseSnapshot } from '../simulation/launch-randomness';
import { mountLaunchPanel } from '../ui/launch-panel';
import { createFeedback } from '../rendering/feedback';
import { createWorld } from '../rendering/world';
import { mountUI } from '../ui/panel';
import { createBounceMarkers } from '../ui/bounce-markers';
import { CinemaAudioEngine } from '../audio/engine';
import { StoneBox, type StoneSpec } from '../simulation/stones';
import { createShoreForaging } from '../rendering/shore-foraging';
import { setupDevReview } from './dev-review';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const SHORE_ORIGIN = new THREE.Vector3(0, 0.24, 0);

export function boot() {
    mountUI();
    const world = createWorld();
    const { camera, renderer } = world;
    const feedback = createFeedback(world);
    const bounceMarkers = createBounceMarkers();
    const audio = new CinemaAudioEngine();
    const stoneBox = new StoneBox(true);
    const session = new Session();
    const rig = new CameraRig();
    mountCameraPanel(rig, session);
    const launch = mountLaunchPanel();
    const { parameters, fields, syncControls } = launch;
    const longLaunch: Launch = { speed: 24, elevation: 2, tilt: 10, roll: 0, spin: 36.7, direction: 0 };
    const longButton = document.createElement('button');
    longButton.textContent = '长投练习 · 无扰动';
    longButton.id = 'long-throw';
    longButton.type = 'button';
    document.querySelector('.actions')!.append(longButton);

    const viewSelect = document.querySelector<HTMLSelectElement>('#view')!;
    const playbackSelect = document.querySelector<HTMLSelectElement>('#playback')!;
    const pauseButton = document.querySelector<HTMLButtonElement>('#pause')!;
    const quickPauseButton = document.querySelector<HTMLButtonElement>('#quick-pause')!;
    const resultToast = document.querySelector<HTMLElement>('#result-toast')!;
    const gestureHud = document.querySelector<HTMLElement>('#gesture-hud')!;
    const labToggle = document.querySelector<HTMLButtonElement>('#lab-toggle')!;
    const audioToggle = document.querySelector<HTMLButtonElement>('#audio-toggle')!;
    const audioIcon = document.querySelector<HTMLElement>('#audio-icon')!;
    const audioLabel = document.querySelector<HTMLElement>('#audio-label')!;
    const wristCursorEl = document.querySelector<HTMLElement>('#wrist-cursor')!;

    function syncHandPanel() {
        const stone = stoneBox.equipped;
        document.querySelector('#hand-stone-name')!.textContent = stone.name;
        const rarityEl = document.querySelector<HTMLElement>('#hand-stone-rarity')!;
        rarityEl.textContent = stoneBox.isUsingEphemeral ? `${stone.rarityLabel} · 试投` : stone.rarityLabel;
        rarityEl.className = `rarity-tag rarity-${stone.rarity}`;
        document.querySelector('#hand-tilt')!.textContent = `${Math.round(parameters.tilt)}°`;
        document.querySelector('#hand-roll')!.textContent = `${Math.round(parameters.roll ?? 0)}°`;
        document.querySelector('#hand-elev')!.textContent = `${Math.round(parameters.elevation)}°`;
        const spinBtn = document.querySelector<HTMLButtonElement>('#hand-spin-dir')!;
        spinBtn.textContent = parameters.spin < 0 ? '↺ 逆旋' : '↻ 顺旋';
    }

    function applyEquippedStone(stone: StoneSpec) {
        world.setStoneMesh(stone);
        syncHandPanel();
    }

    const shoreForaging = createShoreForaging(world.scene, world.sunset.shoreMesh, camera, renderer.domElement, stoneBox, {
        onEquipAndStandUp(stone) {
            applyEquippedStone(stone);
            rig.beginThrow(SHORE_ORIGIN, false, parameters.direction, camera.aspect);
        },
        onEquipStay(stone) {
            applyEquippedStone(stone);
        },
        onClink(mass) {
            audio.unlock();
            audio.playStoneClink(mass);
        },
        onExit() {
            syncHandPanel();
        },
        getLaunch() {
            return parameters;
        },
        onLaunchChange(patch) {
            Object.assign(parameters, patch);
            syncControls();
            syncHandPanel();
        },
    });
    world.hideFromTransmission(shoreForaging.rootGroup);
    applyEquippedStone(stoneBox.equipped);

    document.querySelector<HTMLButtonElement>('#open-stones')!.onclick = () => {
        if (shoreForaging.isOpen()) shoreForaging.close();
        else {
            cancelGesture();
            setLabOpen(false);
            shoreForaging.open();
        }
    };
    document.querySelector<HTMLButtonElement>('#open-tune')!.onclick = () => {
        cancelGesture();
        setLabOpen(false);
        shoreForaging.openTuneCurrent(stoneBox.equipped);
    };
    document.querySelector<HTMLButtonElement>('#hand-spin-dir')!.onclick = () => {
        parameters.spin = parameters.spin === 0 ? 18 : -parameters.spin;
        syncControls();
        syncHandPanel();
    };

    document.querySelector('#controls')!.addEventListener('input', syncHandPanel);
    document.querySelector('#posture')!.addEventListener('input', syncHandPanel);

    function syncAudioButton() {
        const muted = audio.isMuted;
        audioToggle.classList.toggle('muted', muted);
        audioIcon.textContent = muted ? '🔇' : '🔊';
        audioLabel.textContent = muted ? '静音' : '声音';
    }
    syncAudioButton();
    audioToggle.onclick = () => {
        audio.toggleMute();
        syncAudioButton();
    };
    const unlockAudioOnce = () => audio.unlock();
    window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
    window.addEventListener('keydown', unlockAudioOnce, { passive: true });

    function syncQuickHud() {
        for (const btn of document.querySelectorAll<HTMLButtonElement>('.dock-group [data-view]')) {
            btn.classList.toggle('active', btn.dataset.view === rig.view);
        }
        for (const btn of document.querySelectorAll<HTMLButtonElement>('.dock-group [data-rate]')) {
            btn.classList.toggle('active', btn.dataset.rate === session.mode);
        }
        const label = session.paused ? '继续' : '暂停';
        pauseButton.textContent = label;
        quickPauseButton.textContent = label;
    }

    function setLabOpen(open: boolean) {
        document.body.classList.toggle('lab-open', open);
        labToggle.classList.toggle('active', open);
    }

    labToggle.onclick = () => setLabOpen(!document.body.classList.contains('lab-open'));
    document.querySelector<HTMLButtonElement>('#lab-close')!.onclick = () => setLabOpen(false);

    // Long-throw practice uses T=0 for this throw only, without locking user's global temperature to 0
    function triggerLongThrow() {
        Object.assign(parameters, longLaunch);
        syncControls();
        syncHandPanel();
        rig.view = 'course';
        viewSelect.value = 'course';
        start(false, longLaunch, 0);
    }

    longButton.onclick = triggerLongThrow;
    document.querySelector<HTMLButtonElement>('#quick-long')!.onclick = triggerLongThrow;
    document.querySelector<HTMLButtonElement>('#quick-throw')!.onclick = () => start();
    document.querySelector<HTMLButtonElement>('#quick-replay')!.onclick = () => start(true);
    document.querySelector<HTMLButtonElement>('#result-replay')!.onclick = () => start(true);
    document.querySelector<HTMLButtonElement>('#result-bullet')!.onclick = () => {
        if (!session.snapshot) return;
        start(true, parameters, launch.temperature, 'bullet');
    };

    for (const btn of document.querySelectorAll<HTMLButtonElement>('.dock-group [data-view]')) {
        btn.onclick = () => {
            const view = btn.dataset.view as ViewMode;
            rig.view = view;
            viewSelect.value = view;
            syncQuickHud();
        };
    }
    for (const btn of document.querySelectorAll<HTMLButtonElement>('.dock-group [data-rate]')) {
        btn.onclick = () => {
            const mode = btn.dataset.rate as ReplayMode;
            session.mode = mode;
            playbackSelect.value = mode;
            syncQuickHud();
        };
    }
    viewSelect.addEventListener('change', syncQuickHud);
    playbackSelect.addEventListener('change', syncQuickHud);

    const gesture = new PullThrowGesture();
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', '湖面投掷区域');
    const mouseLabel = document.createElement('label');
    mouseLabel.className = 'mouse-water-toggle';
    mouseLabel.innerHTML = '<input type="checkbox" id="mouse-water"> 鼠标拨水验证 · 拖动连续水面';
    document.querySelector('.actions')!.after(mouseLabel);
    const mouseMode = mouseLabel.querySelector<HTMLInputElement>('input')!;
    mouseMode.onchange = () => {
        cancelGesture();
        session.replay();
        session.mouseMode = mouseMode.checked;
        session.mouse = undefined;
        session.waterGeneration++;
        session.waterTicks = [];
        resultToast.classList.remove('visible', 'new-best');
        bounceMarkers.setEnabled(!mouseMode.checked);
        gestureHud.style.display = mouseMode.checked ? 'none' : '';
    };
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    for (const kind of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) canvas.addEventListener(kind, event => {
        if (!mouseMode.checked) return;
        event.stopImmediatePropagation();
        const pointer = event as PointerEvent;
        if (kind === 'pointerup' || kind === 'pointercancel') { session.mouse = undefined; return; }
        if (kind === 'pointermove' && !pointer.buttons) return;
        const box = canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((pointer.clientX - box.left) / box.width * 2 - 1, 1 - (pointer.clientY - box.top) / box.height * 2), camera);
        const point = ray.ray.intersectPlane(plane, new THREE.Vector3());
        if (point) {
            session.mouse = { x: point.x, z: point.z, y: 0, radius: .22, depth: .075 };
            session.paused = false;
            syncQuickHud();
            canvas.setPointerCapture(pointer.pointerId);
        }
    }, true);

    function cancelGesture() {
        const pointerId = gesture.pointerId;
        gesture.cancel();
        if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) {
            canvas.releasePointerCapture(pointerId);
        }
        world.aimGuide.hide();
        gestureHud.classList.remove('charging', 'in-sweet');
        document.querySelector<HTMLProgressElement>('#power')!.value = 0;
        document.querySelector('#aim')!.textContent = '滚轮调攻角 · A/D 侧倾 · W/S 抛角 · Q/E 切旋 · Esc 取消';
        document.querySelector<HTMLElement>('#aim-arrow')!.style.transform = 'rotate(0deg)';
    }
    const pointerInput = (event: PointerEvent) => ({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp > 0 ? event.timeStamp : performance.now(),
    });
    canvas.addEventListener('pointerdown', event => {
        if (shoreForaging.isOpen()) return;
        if (gesture.pointerId !== undefined) {
            if (event.pointerId !== gesture.pointerId) cancelGesture();
            return;
        }
        if (!event.isPrimary || event.button !== 0) return;
        if (gesture.begin(pointerInput(event), canvas.getBoundingClientRect(), parameters)) {
            canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
        }
    });
    canvas.addEventListener('pointermove', event => gesture.move(pointerInput(event)));
    canvas.addEventListener('pointerup', event => {
        const active = gesture.pointerId === event.pointerId;
        const released = gesture.release(pointerInput(event));
        if (active) cancelGesture();
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (released) {
            Object.assign(parameters, released.target);
            syncControls();
            syncHandPanel();
            start(false, released.target, launch.temperature * released.temperatureScale);
        }
    });
    canvas.addEventListener('pointercancel', cancelGesture);
    canvas.addEventListener('lostpointercapture', event => { if (gesture.pointerId === event.pointerId) cancelGesture(); });
    window.addEventListener('blur', cancelGesture);

    // Mouse wheel on the lake quickly tunes stone pitch (tilt), or Shift+wheel tunes side bank (roll)
    canvas.addEventListener('wheel', event => {
        if (shoreForaging.isOpen() || mouseMode.checked) return;
        event.preventDefault();
        const step = event.deltaY < 0 ? 1 : -1;
        if (event.shiftKey) {
            parameters.roll = clamp((parameters.roll ?? 0) + step * 2, -35, 35);
        } else {
            parameters.tilt = clamp(parameters.tilt + step, 0, 50);
        }
        syncControls();
        syncHandPanel();
    }, { passive: false });

    function resizeView() {
        cancelGesture();
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width || innerWidth);
        const height = Math.max(1, rect.height || innerHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        world.post.setSize(width, height);
    }
    window.addEventListener('resize', resizeView);
    resizeView();

    const dev = setupDevReview({
        session, rig, world, feedback,
        setMarkersEnabled: enabled => bounceMarkers.setEnabled(enabled),
        parameters, longLaunch,
    });

    let resultShownForThrow = false;
    let lastFinishedDuration: number | undefined;
    let heardContacts = 0;
    let heardSink = false;

    function start(
        replay = false,
        target: Launch = parameters,
        effectiveTemperature = launch.temperature,
        overrideMode?: ReplayMode
    ) {
        cancelGesture();
        mouseMode.checked = false;
        gestureHud.style.display = '';
        bounceMarkers.setEnabled(true);
        resultToast.classList.remove('visible', 'new-best');
        resultShownForThrow = false;
        heardContacts = 0;
        heardSink = false;
        session.mouseMode = false;
        session.mouse = undefined;
        dev.review.side = false;
        session.diagnosticContact = undefined;
        if (replay) {
            if (!session.replay()) return;
        } else {
            lastFinishedDuration = undefined;
            const equipped = stoneBox.equipped;
            session.start(target, effectiveTemperature, launch.visual, equipped);
            shoreForaging.consumeEphemeralAfterThrow();
            playbackSelect.value = 'normal';
        }
        if (overrideMode) {
            session.mode = overrideMode;
            playbackSelect.value = overrideMode;
        }
        const lastThrow = session.snapshot!;
        const activeStone = session.sim.stone;
        world.setStoneMesh(activeStone);
        world.setStoneWet(false);
        syncHandPanel();
        document.querySelector<HTMLTextAreaElement>('#snapshot')!.value = JSON.stringify(session.snapshot, null, 2);
        document.querySelector('#launch-summary')!.textContent = `本次 seed ${lastThrow.seed} · T=${lastThrow.temperature.toFixed(2)} · ${activeStone.name}\n目标 → 实际出手\n` + fields.map(([key, label, , , , unit]) => `${label} ${(lastThrow.target[key] ?? 0).toFixed(3)} → ${(lastThrow.sampled[key] ?? 0).toFixed(3)} ${unit}`).join('\n');
        feedback.reset();
        const estimatedSimSeconds = lastFinishedDuration ?? Math.max(1.4, Math.min(4.5, lastThrow.sampled.speed * 0.165));
        rig.beginThrow(session.sim.p, session.mode === 'bullet', lastThrow.sampled.direction, camera.aspect, estimatedSimSeconds);
        audio.unlock();
        audio.updatePlaybackState(session.mode, false);
        audio.playThrow(lastThrow.sampled.speed, activeStone.mass);
        dev.resetFrames();
        syncQuickHud();
    }

    document.querySelector<HTMLButtonElement>('#throw')!.onclick = () => start();
    document.querySelector<HTMLButtonElement>('#replay')!.onclick = () => start(true);
    document.querySelector<HTMLButtonElement>('#copy-snapshot')!.onclick = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(session.snapshot, null, 2));
            document.querySelector('#snapshot-message')!.textContent = '已复制';
        } catch {
            document.querySelector('#snapshot-message')!.textContent = '请在文本框中全选复制';
        }
    };
    document.querySelector<HTMLButtonElement>('#load-snapshot')!.onclick = () => {
        try {
            session.snapshot = parseSnapshot(document.querySelector<HTMLTextAreaElement>('#snapshot')!.value);
            start(true);
            document.querySelector('#snapshot-message')!.textContent = '已载入';
        } catch {
            document.querySelector('#snapshot-message')!.textContent = '无效或不匹配的快照';
        }
    };
    function toggle() {
        session.paused = !session.paused;
        syncQuickHud();
    }
    pauseButton.onclick = toggle;
    quickPauseButton.onclick = toggle;
    document.querySelector<HTMLButtonElement>('#step')!.onclick = () => {
        session.paused = true;
        session.advance(1 / 120);
        syncQuickHud();
    };
    window.addEventListener('keydown', event => {
        if (event.code === 'Escape') {
            if (shoreForaging.isOpen()) {
                if (shoreForaging.isInspecting()) shoreForaging.putBackInspected();
                else shoreForaging.close();
                return;
            }
            cancelGesture();
            return;
        }
        if (event.code === 'Tab') {
            if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
            event.preventDefault();
            if (shoreForaging.isOpen()) shoreForaging.close();
            setLabOpen(!document.body.classList.contains('lab-open'));
            return;
        }
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, summary')) return;
        if (event.code === 'KeyF') {
            event.preventDefault();
            if (shoreForaging.isOpen()) shoreForaging.close();
            else {
                cancelGesture();
                setLabOpen(false);
                shoreForaging.open();
            }
            return;
        }
        if (/^Digit[1-8]$/.test(event.code)) {
            const slot = Number(event.code.slice(5)) - 1;
            const picked = stoneBox.stones[slot];
            if (picked) {
                stoneBox.equipSaved(picked.id);
                audio.unlock();
                audio.playStoneClink(picked.mass);
                applyEquippedStone(stoneBox.equipped);
                if (shoreForaging.isOpen()) shoreForaging.close();
            }
            return;
        }
        if (shoreForaging.isOpen()) return;
        if (event.code === 'Space') {
            event.preventDefault();
            toggle();
        } else if (event.code === 'KeyR') {
            start();
        } else if (event.code === 'KeyM') {
            audio.toggleMute();
            syncAudioButton();
        } else if (event.code === 'KeyW') {
            parameters.elevation = clamp(parameters.elevation + 1, -12, 20);
            syncControls(); syncHandPanel();
        } else if (event.code === 'KeyS') {
            parameters.elevation = clamp(parameters.elevation - 1, -12, 20);
            syncControls(); syncHandPanel();
        } else if (event.code === 'KeyA') {
            parameters.roll = clamp((parameters.roll ?? 0) - 2, -35, 35);
            syncControls(); syncHandPanel();
        } else if (event.code === 'KeyD') {
            parameters.roll = clamp((parameters.roll ?? 0) + 2, -35, 35);
            syncControls(); syncHandPanel();
        } else if (event.code === 'KeyQ') {
            parameters.spin = -Math.max(12, Math.abs(parameters.spin || 18));
            syncControls(); syncHandPanel();
        } else if (event.code === 'KeyE') {
            parameters.spin = Math.max(12, Math.abs(parameters.spin || 18));
            syncControls(); syncHandPanel();
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelGesture();
            session.paused = true;
            syncQuickHud();
        }
    });

    syncQuickHud();
    syncHandPanel();

    let previous = performance.now();
    let ambientTime = 0;
    let wasAiming = false;

    function frame(now: number) {
        const cpuStart = performance.now();
        requestAnimationFrame(frame);
        const raf = now - previous;
        const elapsed = Math.min(raf / 1000, .1);
        previous = now;
        ambientTime += elapsed;
        session.tick(elapsed);
        const { sim, paused } = session;
        const preview = gesture.preview(now);
        const isAiming = Boolean(preview);
        gestureHud.classList.toggle('charging', isAiming);
        gestureHud.classList.toggle('in-sweet', Boolean(preview && preview.sweetQuality > 0.45));
        if (preview) {
            document.querySelector<HTMLProgressElement>('#power')!.value = preview.power;
            wristCursorEl.style.left = `${(preview.wristCursor * 100).toFixed(1)}%`;
            const spinText = `${preview.target.spin < 0 ? '逆' : '顺'}${Math.abs(preview.target.spin).toFixed(0)}r/s`;
            document.querySelector('#aim')!.textContent = `${Math.round(preview.power * 100)}% · ${preview.target.speed.toFixed(1)} m/s · 方向 ${preview.target.direction.toFixed(0)}° · ${spinText}`;
            document.querySelector<HTMLElement>('#aim-arrow')!.style.transform = `rotate(${preview.target.direction}deg)`;
            world.aimGuide.update(preview.target, stoneBox.equipped, preview.sweetQuality);
            if (resultShownForThrow) resultToast.classList.remove('visible');
        } else {
            world.aimGuide.hide();
        }

        const visibleDrops = feedback.update(session, document.querySelector<HTMLInputElement>('#helpers')!.checked);
        // Hide the active lakeside throwing stone & halo while crouching on the beach so nothing floats in the sky
        const foragingNow = shoreForaging.isOpen();
        if (foragingNow) {
            world.stone.visible = false;
            world.halo.visible = false;
        } else {
            world.stone.visible = true;
        }
        world.setStoneWet(sim.contacts.length > 0);
        const envTime = dev.isReferenceMode ? session.presentationTime : ambientTime;
        world.waterField.setTime(envTime);
        world.sunset.update(envTime);

        // Camera orchestration: 3D riverbank foraging vs aiming at shore vs throwing/replay
        if (foragingNow) {
            const foragePose = shoreForaging.update(elapsed);
            rig.updateToPose(camera, foragePose, elapsed);
        } else {
            const aimAtShore = isAiming && (sim.ended || sim.p.x > 2.5);
            if (aimAtShore && !wasAiming) {
                rig.beginThrow(SHORE_ORIGIN, false, preview!.target.direction, camera.aspect);
            }
            wasAiming = aimAtShore;
            if (aimAtShore) {
                rig.update(camera, SHORE_ORIGIN, session.presentationTime, false, elapsed, false, []);
            } else {
                rig.update(camera, sim.p, session.presentationTime, session.mode === 'bullet', elapsed, paused, sim.contacts);
            }
        }
        dev.applySideCamera(camera);
        updateTelemetry(session, visibleDrops);

        const rect = canvas.getBoundingClientRect();
        bounceMarkers.update(sim.contacts, camera, rect.width, rect.height, session.visualTime);

        audio.updatePlaybackState(session.mode, paused || document.hidden);
        if (!paused && !session.mouseMode && !dev.isReferenceMode) {
            while (heardContacts < sim.contacts.length) {
                const idx = heardContacts++;
                const contact = sim.contacts[idx];
                const isFinalPlunge = sim.submerged && idx === sim.contacts.length - 1;
                if (!isFinalPlunge) {
                    audio.playSkip(contact, idx, camera, sim.stone.mass);
                }
            }
            if (sim.submerged && !heardSink) {
                heardSink = true;
                audio.playSink(sim.p, sim.v, sim.skips, camera, sim.stone.mass);
            }
        }

        if (sim.ended && !resultShownForThrow && !session.mouseMode && !dev.isReferenceMode && session.snapshot) {
            resultShownForThrow = true;
            lastFinishedDuration = sim.time;
            rig.setBulletSpanFromDuration(sim.time);
            const distance = Math.hypot(sim.p.x, sim.p.z);
            stoneBox.recordResult(sim.stone.id, sim.skips, distance);
            const isNewBest = commitRecord(sim.skips, distance);
            document.querySelector('#result-tag')!.textContent = sim.skips > 0 ? `${sim.stone.name} · ${sim.reason}` : `${sim.stone.name} · 未起跳落水`;
            document.querySelector('#result-stats')!.textContent = `${sim.skips} 跳 · ${distance.toFixed(1)} m`;
            resultToast.classList.toggle('new-best', isNewBest);
            resultToast.classList.add('visible');
        }

        world.post.render(envTime);
        dev.recordFrame(raf, performance.now() - cpuStart);
    }
    requestAnimationFrame(frame);
}
