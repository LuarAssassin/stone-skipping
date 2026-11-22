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
import { formatStoneDimensions, StoneBox, type StoneSpec } from '../simulation/stones';
import { createStonePreviewStage } from '../rendering/stone-mesh';
import { mountStoneDrawer } from '../ui/stone-drawer';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function boot() {
    mountUI();
    const world = createWorld();
    const { scene, camera, renderer } = world;
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

    // Handheld 3D Stone Preview Stage (bottom-left)
    const stageCanvas = document.querySelector<HTMLCanvasElement>('#stone-stage')!;
    const stonePreview = createStonePreviewStage(stageCanvas);

    function syncHandPanel() {
        const stone = stoneBox.equipped;
        document.querySelector('#hand-stone-name')!.textContent = stone.name;
        const rarityEl = document.querySelector<HTMLElement>('#hand-stone-rarity')!;
        rarityEl.textContent = stoneBox.isUsingEphemeral ? `${stone.rarityLabel} · 试投` : stone.rarityLabel;
        rarityEl.className = `rarity-tag rarity-${stone.rarity}`;
        document.querySelector('#hand-stone-dims')!.textContent = formatStoneDimensions(stone);
        document.querySelector('#hand-tilt')!.textContent = `${Math.round(parameters.tilt)}°`;
        document.querySelector('#hand-roll')!.textContent = `${Math.round(parameters.roll ?? 0)}°`;
        document.querySelector('#hand-elev')!.textContent = `${Math.round(parameters.elevation)}°`;
        const spinBtn = document.querySelector<HTMLButtonElement>('#hand-spin-dir')!;
        spinBtn.textContent = parameters.spin < 0 ? '↺ 逆旋' : '↻ 顺旋';
    }

    function applyEquippedStone(stone: StoneSpec) {
        stonePreview.setStone(stone);
        world.setStoneMesh(stone);
        syncHandPanel();
    }

    const stoneDrawer = mountStoneDrawer(stoneBox, {
        onEquip(stone) {
            applyEquippedStone(stone);
        },
    });
    applyEquippedStone(stoneBox.equipped);

    document.querySelector<HTMLButtonElement>('#open-stones')!.onclick = () => {
        if (stoneDrawer.isOpen()) stoneDrawer.close();
        else stoneDrawer.open();
    };
    document.querySelector<HTMLButtonElement>('#hand-spin-dir')!.onclick = () => {
        parameters.spin = parameters.spin === 0 ? 18 : -parameters.spin;
        syncControls();
        syncHandPanel();
    };

    // Direct 3D drag on the handheld stone preview canvas adjusts tilt (pitch) & roll (bank)
    let stageDrag: { pointerId: number; x: number; y: number; tilt: number; roll: number } | undefined;
    stageCanvas.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        stageDrag = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            tilt: parameters.tilt,
            roll: parameters.roll ?? 0,
        };
        stageCanvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    stageCanvas.addEventListener('pointermove', event => {
        if (!stageDrag || stageDrag.pointerId !== event.pointerId) return;
        const dx = event.clientX - stageDrag.x;
        const dy = event.clientY - stageDrag.y;
        parameters.tilt = Math.round(clamp(stageDrag.tilt - dy * 0.35, 0, 50));
        parameters.roll = Math.round(clamp(stageDrag.roll + dx * 0.42, -35, 35));
        syncControls();
        syncHandPanel();
    });
    const endStageDrag = (event: PointerEvent) => {
        if (!stageDrag || stageDrag.pointerId !== event.pointerId) return;
        if (stageCanvas.hasPointerCapture(event.pointerId)) stageCanvas.releasePointerCapture(event.pointerId);
        stageDrag = undefined;
    };
    stageCanvas.addEventListener('pointerup', endStageDrag);
    stageCanvas.addEventListener('pointercancel', endStageDrag);

    // Keep hand panel chips synced whenever Lab sliders change
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
        for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.dock-group [data-view]'))) {
            btn.classList.toggle('active', btn.dataset.view === rig.view);
        }
        for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.dock-group [data-rate]'))) {
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

    function triggerLongThrow() {
        Object.assign(parameters, longLaunch);
        launch.temperature = 0;
        syncControls();
        syncHandPanel();
        rig.view = 'course';
        viewSelect.value = 'course';
        start();
    }

    longButton.onclick = triggerLongThrow;
    document.querySelector<HTMLButtonElement>('#quick-long')!.onclick = triggerLongThrow;
    document.querySelector<HTMLButtonElement>('#quick-throw')!.onclick = () => start();
    document.querySelector<HTMLButtonElement>('#quick-replay')!.onclick = () => start(true);
    document.querySelector<HTMLButtonElement>('#result-replay')!.onclick = () => start(true);
    document.querySelector<HTMLButtonElement>('#result-bullet')!.onclick = () => {
        if (!session.snapshot) return;
        start(true);
        session.mode = 'bullet';
        playbackSelect.value = 'bullet';
        syncQuickHud();
    };

    for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.dock-group [data-view]'))) {
        btn.onclick = () => {
            const view = btn.dataset.view as ViewMode;
            rig.view = view;
            viewSelect.value = view;
            syncQuickHud();
        };
    }
    for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.dock-group [data-rate]'))) {
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
        if (stoneDrawer.isOpen()) return;
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
        if (stoneDrawer.isOpen() || mouseMode.checked) return;
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

    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input'))) {
        if (/sheet|breakup/i.test(input.id)) {
            input.disabled = true;
            input.title = '连续水面基线暂不启用旧版空中水花模型';
        }
    }

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

    let resultShownForThrow = false;
    let lastFinishedDuration: number | undefined;
    let heardContacts = 0;
    let heardSink = false;

    function start(replay = false, target: Launch = parameters, effectiveTemperature = launch.temperature) {
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
        review.side = false;
        session.diagnosticContact = undefined;
        if (replay) {
            if (!session.replay()) return;
        } else {
            lastFinishedDuration = undefined;
            const equipped = stoneBox.equipped;
            session.start(target, effectiveTemperature, launch.visual, equipped);
            stoneDrawer.consumeEphemeralAfterThrow();
            playbackSelect.value = 'normal';
        }
        const lastThrow = session.snapshot!;
        const activeStone = session.sim.stone;
        world.setStoneMesh(activeStone);
        world.setStoneWet(false);
        stonePreview.setStone(activeStone);
        syncHandPanel();
        document.querySelector<HTMLTextAreaElement>('#snapshot')!.value = JSON.stringify(session.snapshot, null, 2);
        document.querySelector('#launch-summary')!.textContent = `本次 seed ${lastThrow.seed} · T=${lastThrow.temperature.toFixed(2)} · ${activeStone.name}\n目标 → 实际出手\n` + fields.map(([key, label, , , , unit]) => `${label} ${(lastThrow.target[key] ?? 0).toFixed(3)} → ${(lastThrow.sampled[key] ?? 0).toFixed(3)} ${unit}`).join('\n');
        feedback.reset();
        const estimatedSimSeconds = lastFinishedDuration ?? Math.max(1.4, Math.min(4.5, lastThrow.sampled.speed * 0.165));
        rig.beginThrow(session.sim.p, session.mode === 'bullet', lastThrow.sampled.direction, camera.aspect, estimatedSimSeconds);
        audio.unlock();
        audio.updatePlaybackState(session.mode, false);
        audio.playThrow(lastThrow.sampled.speed);
        if (import.meta.env.DEV) review.frames = [];
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
            if (stoneDrawer.isOpen()) {
                stoneDrawer.close();
                return;
            }
            cancelGesture();
            return;
        }
        if (event.code === 'Tab') {
            if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
            event.preventDefault();
            setLabOpen(!document.body.classList.contains('lab-open'));
            return;
        }
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, summary')) return;
        if (event.code === 'KeyF') {
            event.preventDefault();
            if (stoneDrawer.isOpen()) stoneDrawer.close();
            else stoneDrawer.open();
            return;
        }
        if (stoneDrawer.isOpen()) return;
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
        } else if (/^Digit[1-8]$/.test(event.code)) {
            const slot = Number(event.code.slice(5)) - 1;
            const picked = stoneBox.stones[slot];
            if (picked) {
                stoneBox.equipSaved(picked.id);
                applyEquippedStone(stoneBox.equipped);
            }
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelGesture();
            session.paused = true;
            syncQuickHud();
        }
    });

    const review = {
        session, rig, world, feedback, side: false,
        inspect(time: number, single = true) {
            session.diagnosticContact = single ? 0 : undefined;
            session.replay();
            session.advance(time);
            session.paused = true;
            this.side = true;
            this.render();
        },
        sideCamera() {
            const contact = session.sim.contacts[0];
            if (!contact) return;
            const point = [contact.point.x, 0, contact.point.z];
            camera.position.set(point[0] + .09, .115, point[2] + .48);
            camera.lookAt(point[0] + .09, .018, point[2]);
            camera.fov = 38;
            camera.updateProjectionMatrix();
        },
        errors: [] as string[],
        frames: [] as { raf: number; cpu: number }[],
        variant(seed: number) {
            if (!session.snapshot) return;
            const time = session.visualTime;
            session.replay({ ...session.snapshot, visual: { ...(session.snapshot.visual ?? { surface: .35, sheet: .8, breakup: 1.1 }), seed } });
            session.advance(time);
            session.paused = true;
            document.querySelector<HTMLTextAreaElement>('#snapshot')!.value = JSON.stringify(session.snapshot, null, 2);
            document.querySelector('#launch-summary')!.textContent = `physical seed ${session.snapshot!.seed} · T=${session.snapshot!.temperature} · visual ${seed} · ${session.effects.visual.surface}/${session.effects.visual.sheet}/${session.effects.visual.breakup}`;
            this.render();
        },
        programs() {
            const gl = renderer.getContext();
            return renderer.info.programs?.map(program => ({ name: program.name, linked: gl.getProgramParameter(program.program, gl.LINK_STATUS) }));
        },
        render() {
            feedback.update(session, false);
            world.waterField.setTime(session.presentationTime);
            world.sunset.update(session.presentationTime);
            rig.update(camera, session.sim.p, session.presentationTime, session.mode === 'bullet', 1, true, session.sim.contacts);
            if (this.side) this.sideCamera();
            world.post.render(session.presentationTime);
        },
    };
    if (import.meta.env.DEV) {
        Object.assign(window, {
            waterReview: Object.assign(review, {
                surfaceOnly(enabled: boolean) {
                    world.waterField.mesh.material.uniforms.surfaceInspection.value = enabled ? 1 : 0;
                    world.post.setBypass(enabled);
                    bounceMarkers.setEnabled(!enabled);
                },
                calibrationBed(enabled: boolean) {
                    world.setCalibrationBed(enabled);
                },
            }),
        });
        renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
            review.errors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
            if (review.errors.length > 32) review.errors.shift();
        };
    }

    // Reproducible reference views for visual review, available only in development.
    let isReferenceMode = false;
    if (import.meta.env.DEV) {
        const query = new URLSearchParams(location.search), time = Number(query.get('reference'));
        if (query.has('reference') && Number.isFinite(time) && time >= 0 && time <= 6) {
            isReferenceMode = true;
            document.body.classList.add('reference-mode');
            bounceMarkers.setEnabled(false);
            session.start(query.has('long') ? longLaunch : parameters, 0);
            session.replay({ ...session.snapshot!, seed: 271 });
            if (query.has('grouped')) {
                const groups = [.003, .031, .007];
                let i = 0;
                while (session.visualTime < time - 1e-8) {
                    session.advance(Math.min(groups[i++ % groups.length], time - session.visualTime));
                    feedback.update(session, false);
                }
            } else session.advance(time);
            session.paused = true;
            review.side = true;
            world.spray.mesh.visible = query.get('spray') !== 'off';
            if (query.get('sheet') === 'off') world.spray.sheets.visible = false;
            review.sideCamera = () => {
                const c = query.has('long') ? session.sim.contacts.at(-1) : session.sim.contacts[0];
                if (!c) return;
                camera.position.set(c.point.x + .3, .32, c.point.z + 1.6);
                camera.lookAt(c.point.x + .3, .045, c.point.z);
                camera.fov = 48;
                camera.updateProjectionMatrix();
            };
        }
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('audit')) {
        review.render();
        const g = world.waterField.solver.grid, data = world.waterField.solver.read(renderer);
        let peak = 0, farPeak = 0, finite = true, hash = 2166136261;
        for (const byte of new Uint8Array(data.buffer)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
        for (let i = 0; i < data.length; i += 4) {
            const h = data[i];
            finite = finite && Number.isFinite(h);
            peak = Math.max(peak, Math.abs(h));
            if ((i / 4 % g.width + .5) * g.dx > 16) farPeak = Math.max(farPeak, Math.abs(h));
        }
        const node = document.createElement('script');
        node.type = 'application/json';
        node.id = 'water-audit';
        node.textContent = JSON.stringify({ grid: g, hash, peak, farPeak, finite, glError: renderer.getContext().getError(), programs: review.programs(), errors: review.errors, skips: session.sim.skips, position: session.sim.p.toArray(), ribbons: session.spray.ribbons.length, drops: session.spray.drops.length });
        document.body.append(node);
    }

    syncQuickHud();
    syncHandPanel();

    let previous = performance.now();
    let ambientTime = 0;
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
        gestureHud.classList.toggle('charging', Boolean(preview));
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
        world.setStoneWet(sim.contacts.length > 0);
        const envTime = isReferenceMode ? session.presentationTime : ambientTime;
        world.waterField.setTime(envTime);
        world.sunset.update(envTime);
        rig.update(camera, sim.p, session.presentationTime, session.mode === 'bullet', elapsed, paused, sim.contacts);
        if (import.meta.env.DEV && review.side) review.sideCamera();
        updateTelemetry(session, visibleDrops);

        if (!isReferenceMode) {
            stonePreview.render(parameters.tilt, parameters.roll ?? 0, parameters.spin, elapsed);
        }

        const rect = canvas.getBoundingClientRect();
        bounceMarkers.update(sim.contacts, camera, rect.width, rect.height, session.visualTime);

        audio.updatePlaybackState(session.mode, paused || document.hidden);
        if (!paused && !session.mouseMode && !isReferenceMode) {
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

        if (sim.ended && !resultShownForThrow && !session.mouseMode && !isReferenceMode && session.snapshot) {
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
        if (import.meta.env.DEV) {
            review.frames.push({ raf, cpu: performance.now() - cpuStart });
            if (review.frames.length > 600) review.frames.shift();
            if (new URLSearchParams(location.search).has('benchmark') && session.sim.ended) {
                let node = document.querySelector<HTMLScriptElement>('#water-performance');
                if (!node) {
                    node = document.createElement('script');
                    node.type = 'application/json';
                    node.id = 'water-performance';
                    document.body.append(node);
                    const values = review.frames.map(f => f.raf).sort((a, b) => a - b);
                    node.textContent = JSON.stringify({ frames: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, p95: values[Math.floor(values.length * .95)], max: values.at(-1), skips: session.sim.skips, distance: Math.hypot(session.sim.p.x, session.sim.p.z) });
                }
            }
        }
    }
    requestAnimationFrame(frame);
}
