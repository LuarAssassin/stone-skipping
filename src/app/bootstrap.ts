import * as THREE from 'three';
import { commitRecord, updateTelemetry, type BestRecord } from '../ui/telemetry';
import { type Launch } from '../simulation/physics';
import { Session, PLAYBACK_RATE } from './session';
import { CameraRig, type ViewMode } from '../camera/rig';
import { mountCameraPanel } from '../ui/camera-panel';
import { PullThrowGesture, type WristRelease } from '../input/pull-gesture';
import { parseSnapshot, type ThrowSnapshot } from '../simulation/launch-randomness';
import { mountLaunchPanel } from '../ui/launch-panel';
import { createFeedback } from '../rendering/feedback';
import { createWorld } from '../rendering/world';
import {
    automaticQualities, FrameBudget, GRAPHICS_LABELS, loadAutomaticQuality, loadGraphicsMode,
    manualQuality, saveAutomaticQuality, saveGraphicsMode, type GraphicsMode, type GraphicsQuality,
} from '../rendering/graphics-quality';
import { mountUI } from '../ui/panel';
import { createBounceMarkers } from '../ui/bounce-markers';
import { CinemaAudioEngine } from '../audio/engine';
import { StoneBox, type StoneSpec } from '../simulation/stones';
import { createShoreForaging } from '../rendering/shore-foraging';
import { setupDevReview } from './dev-review';
import { getSceneTheme, loadSavedThemeId, saveThemeId, type SceneThemeId } from '../rendering/themes';
import { getWeatherPreset, loadSavedWeatherId, saveWeatherId, type WeatherId } from '../rendering/weather';
import { diagnoseThrow, type PreviousThrowBaseline } from '../simulation/throw-feedback';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const SHORE_ORIGIN = new THREE.Vector3(0, 0.24, 0);
const isTouchDevice = () =>
    typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches);

type ReplayCameraMode = 'course' | 'bullet';

export function boot() {
    mountUI();
    const compactLayout = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 520px)');
    const lakeLoading = document.querySelector<HTMLElement>('#lake-loading')!;
    const loadingLabel = document.querySelector<HTMLElement>('#lake-loading-label')!;
    const mobileGpu = isTouchDevice() && Math.min(innerWidth, innerHeight) <= 900;
    const autoQuality = () => loadAutomaticQuality(devicePixelRatio, mobileGpu);
    let graphicsMode = loadGraphicsMode();
    const world = createWorld(graphicsMode === 'auto' ? autoQuality() : manualQuality(graphicsMode), mobileGpu);
    const { camera, renderer } = world;
    const feedback = createFeedback(world);
    const bounceMarkers = createBounceMarkers();
    const audio = new CinemaAudioEngine();
    const stoneBox = new StoneBox(true);
    const session = new Session();
    const rig = new CameraRig();
    const frameBudget = new FrameBudget();
    let pendingGraphics: GraphicsQuality | undefined;
    let sampleGraphicsAfter = 0;
    const pendingAssets = new Map<Promise<unknown>, string>();
    let lakeReady = false;
    let playPendingThrow: (() => void) | undefined;

    function resetGraphicsSampling() {
        frameBudget.reset();
        sampleGraphicsAfter = performance.now() + 750;
    }

    const graphicsSelect = document.querySelector<HTMLSelectElement>('#graphics-mode')!;
    const graphicsStatus = document.querySelector<HTMLOutputElement>('#graphics-status')!;
    function syncGraphicsStatus() {
        const { tier } = world.graphicsQuality;
        graphicsStatus.value = pendingGraphics ? '下一投生效'
            : `${GRAPHICS_LABELS[tier]} · ${renderer.getPixelRatio()}×`;
    }
    graphicsSelect.value = graphicsMode;
    syncGraphicsStatus();
    graphicsSelect.onchange = () => {
        graphicsMode = graphicsSelect.value as GraphicsMode;
        saveGraphicsMode(graphicsMode);
        pendingGraphics = graphicsMode === 'auto' ? autoQuality() : manualQuality(graphicsMode);
        resetGraphicsSampling();
        syncGraphicsStatus();
    };

    function waitForAssets(assets: Promise<unknown> | undefined, label: string) {
        if (!assets || pendingAssets.has(assets)) return;
        pendingAssets.set(assets, label);
        lakeReady = false;
        lakeLoading.hidden = false;
        loadingLabel.textContent = label;
        const settle = () => {
            pendingAssets.delete(assets);
            loadingLabel.textContent = pendingAssets.values().next().value ?? '正在绘制湖面…';
        };
        void assets.then(settle, settle);
    }
    waitForAssets(world.sunset.shoreReady, '正在准备湖岸…');

    function applyPendingGraphics(resetWater: boolean) {
        if (!pendingGraphics || (!resetWater && pendingGraphics.tier !== world.graphicsQuality.tier && session.waterStrength > 0)) return;
        const next = pendingGraphics;
        pendingGraphics = undefined;
        if (world.setGraphicsQuality(next)) {
            if (graphicsMode === 'auto') saveAutomaticQuality(next, devicePixelRatio, mobileGpu);
            resetGraphicsSampling();
            waitForAssets(Promise.resolve(), '正在调整画质…');
        }
        syncGraphicsStatus();
    }

    function sampleGraphics(frameMs: number, now: number, throwing: boolean) {
        if (graphicsMode !== 'auto' || pendingGraphics || now < sampleGraphicsAfter) return;
        const direction = frameBudget.sample(frameMs, throwing, now);
        if (!direction) return;
        const steps = automaticQualities(devicePixelRatio);
        const { tier, pixelRatio } = world.graphicsQuality;
        const index = steps.findIndex(step => step.tier === tier && Math.min(devicePixelRatio, step.pixelRatio) === Math.min(devicePixelRatio, pixelRatio));
        if (index >= 0) pendingGraphics = steps[index + direction];
        if (pendingGraphics) syncGraphicsStatus();
    }

    function playThrowWhenReady(speed: number, mass: number) {
        const play = () => {
            audio.updatePlaybackState(session.mode, false);
            audio.playThrow(speed, mass);
        };
        if (lakeReady) play();
        else playPendingThrow = play;
    }
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
    const resultToast = document.querySelector<HTMLElement>('#result-toast')!;
    const resultDetailToggle = document.querySelector<HTMLButtonElement>('#result-detail-toggle')!;
    const resultReplayCourse = document.querySelector<HTMLButtonElement>('#result-replay-course')!;
    const resultReplayBullet = document.querySelector<HTMLButtonElement>('#result-replay-bullet')!;
    const resultSamePower = document.querySelector<HTMLButtonElement>('#result-same-power')!;
    const resultThrowAgain = document.querySelector<HTMLButtonElement>('#result-throw-again')!;
    const resultChangeStone = document.querySelector<HTMLButtonElement>('#result-change-stone')!;
    const resultMetrics = document.querySelector<HTMLElement>('#result-metrics')!;
    const resultCompare = document.querySelector<HTMLElement>('#result-compare')!;
    const resultCause = document.querySelector<HTMLElement>('#result-cause')!;
    const resultTip = document.querySelector<HTMLElement>('#result-tip')!;
    const handSameThrow = document.querySelector<HTMLButtonElement>('#hand-same-throw')!;
    const gestureHud = document.querySelector<HTMLElement>('#gesture-hud')!;
    const gestureTitle = document.querySelector<HTMLElement>('#gesture-title')!;
    const firstPullHint = document.querySelector<HTMLElement>('#first-pull-hint')!;
    const resultRelease = document.querySelector<HTMLElement>('#result-release')!;
    const resultReleaseLabel = document.querySelector<HTMLElement>('#result-release-label')!;
    const resultReleaseCursor = document.querySelector<HTMLElement>('#result-release-cursor')!;
    const resultBestGap = document.querySelector<HTMLElement>('#result-best-gap')!;
    let hasThrown = false;
    function setFirstPullHint(retry = false) {
        firstPullHint.textContent = retry
            ? '轻点不会投出，按住湖面下拉再松手'
            : '按住湖面向下拉，松手投出';
    }
    setFirstPullHint();

    function setResultDetails(open: boolean) {
        resultDetailToggle.setAttribute('aria-expanded', String(open));
        resultDetailToggle.textContent = open ? '收起' : '详情';
    }
    resultDetailToggle.onclick = () => setResultDetails(resultDetailToggle.getAttribute('aria-expanded') === 'false');
    function syncInputHints(touch = isTouchDevice()) {
        document.body.classList.toggle('touch-input', touch);
        labToggle.title = touch ? '切换物理实验室面板' : '切换物理实验室面板 (Tab)';
        document.querySelector<HTMLButtonElement>('#open-stones')!.title = touch ? '低头在暮色岸滩拣石头' : '低头在暮色岸滩拣石头 (F)';
        document.querySelector('#aim')!.textContent = touch
            ? '单指按住湖面向下拉蓄力 · 点「调姿」改攻角与侧倾'
            : '滚轮调攻角 · A/D 侧倾 · W/S 抛角 · Q/E 切旋 · Esc 取消';
    }
    const labToggle = document.querySelector<HTMLButtonElement>('#lab-toggle')!;
    const audioToggle = document.querySelector<HTMLButtonElement>('#audio-toggle')!;
    const audioIcon = document.querySelector<HTMLElement>('#audio-icon')!;
    const audioLabel = document.querySelector<HTMLElement>('#audio-label')!;
    const wristCursorEl = document.querySelector<HTMLElement>('#wrist-cursor')!;
    syncInputHints();

    // Theme & Weather switchers
    const themeSwitcher = document.querySelector<HTMLElement>('#theme-switcher')!;
    const themeToggle = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
    const themeLabel = document.querySelector<HTMLElement>('#theme-label')!;
    const themeActiveSwatch = document.querySelector<HTMLElement>('#theme-active-swatch')!;
    const sceneSubtitle = document.querySelector<HTMLElement>('#scene-subtitle')!;
    const themeOptions = Array.from(document.querySelectorAll<HTMLButtonElement>('.theme-option'));

    const weatherSwitcher = document.querySelector<HTMLElement>('#weather-switcher')!;
    const weatherToggle = document.querySelector<HTMLButtonElement>('#weather-toggle')!;
    const weatherLabel = document.querySelector<HTMLElement>('#weather-label')!;
    const weatherActiveIcon = document.querySelector<HTMLElement>('#weather-active-icon')!;
    const weatherOptions = Array.from(document.querySelectorAll<HTMLButtonElement>('.weather-option'));

    function setThemeMenuOpen(open: boolean) {
        themeSwitcher.classList.toggle('open', open);
        themeToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) setWeatherMenuOpen(false);
    }

    function setWeatherMenuOpen(open: boolean) {
        weatherSwitcher.classList.toggle('open', open);
        weatherToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            themeSwitcher.classList.remove('open');
            themeToggle.setAttribute('aria-expanded', 'false');
        }
    }

    function closeHeaderMenus() {
        setThemeMenuOpen(false);
        setWeatherMenuOpen(false);
    }

    function applyTheme(id: SceneThemeId, persist = true) {
        resetGraphicsSampling();
        const theme = getSceneTheme(id);
        document.documentElement.dataset.theme = theme.id;
        waitForAssets(world.applyTheme(theme), `正在准备${theme.name}…`);
        themeLabel.textContent = theme.name;
        themeActiveSwatch.className = `theme-swatch theme-swatch-${theme.id}`;
        sceneSubtitle.textContent = theme.subtitle;
        for (const btn of themeOptions) {
            const active = btn.dataset.themeId === theme.id;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-checked', active ? 'true' : 'false');
        }
        if (persist) saveThemeId(theme.id);
    }

    function applyWeather(id: WeatherId, persist = true) {
        resetGraphicsSampling();
        const preset = getWeatherPreset(id);
        world.applyWeather(preset);
        weatherLabel.textContent = preset.name;
        weatherActiveIcon.textContent = preset.icon;
        for (const btn of weatherOptions) {
            const active = btn.dataset.weatherId === preset.id;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-checked', active ? 'true' : 'false');
        }
        if (persist) saveWeatherId(preset.id);
    }

    applyTheme(loadSavedThemeId(), false);
    applyWeather(loadSavedWeatherId(), false);

    themeToggle.onclick = event => {
        event.stopPropagation();
        setThemeMenuOpen(!themeSwitcher.classList.contains('open'));
    };
    for (const btn of themeOptions) {
        btn.onclick = event => {
            event.stopPropagation();
            applyTheme(btn.dataset.themeId as SceneThemeId);
            setThemeMenuOpen(false);
        };
    }

    weatherToggle.onclick = event => {
        event.stopPropagation();
        setWeatherMenuOpen(!weatherSwitcher.classList.contains('open'));
    };
    for (const btn of weatherOptions) {
        btn.onclick = event => {
            event.stopPropagation();
            applyWeather(btn.dataset.weatherId as WeatherId);
            setWeatherMenuOpen(false);
        };
    }

    window.addEventListener('pointerdown', event => {
        if (!(event.target instanceof Node)) return;
        if (themeSwitcher.classList.contains('open') && !themeSwitcher.contains(event.target)) {
            setThemeMenuOpen(false);
        }
        if (weatherSwitcher.classList.contains('open') && !weatherSwitcher.contains(event.target)) {
            setWeatherMenuOpen(false);
        }
    });

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
        waitForAssets(world.setStoneMesh(stone), '正在准备石子…');
        syncHandPanel();
    }

    // Replay orchestration (opt-in 0.25x course/bullet replay; auto-plays once on new personal best without looping)
    let isAutoReplay = false;
    let replayCameraMode: ReplayCameraMode = 'course';
    let autoReplayTimer: number | undefined;
    let preReplayView: ViewMode = 'overview';

    // Coaching & same-power A/B comparison state
    let lastManualLaunch: Launch | undefined;
    let throwSource: { snapshot: ThrowSnapshot; release?: WristRelease; samePower: boolean } | undefined;
    let lastBaseline: PreviousThrowBaseline | undefined;
    let lastFinishedStats: BestRecord | undefined;

    function syncSameThrowButtons() {
        const hasRef = Boolean(lastManualLaunch);
        handSameThrow.classList.toggle('hidden', !hasRef);
        if (lastManualLaunch) {
            handSameThrow.title = `沿用上投力度 (${lastManualLaunch.speed.toFixed(1)} m/s) 无扰动试投当前石头/姿态`;
        }
    }

    function clearAutoReplayTimer() {
        if (autoReplayTimer !== undefined) {
            window.clearTimeout(autoReplayTimer);
            autoReplayTimer = undefined;
        }
    }

    function syncReplayButtons() {
        resultReplayCourse.classList.toggle('active', isAutoReplay && replayCameraMode === 'course');
        resultReplayBullet.classList.toggle('active', isAutoReplay && replayCameraMode === 'bullet');
    }

    function stopAutoReplay(restoreView = true) {
        clearAutoReplayTimer();
        if (isAutoReplay) {
            isAutoReplay = false;
            if (restoreView) {
                rig.view = preReplayView;
                viewSelect.value = preReplayView;
            }
            syncReplayButtons();
        }
    }

    const shoreForaging = createShoreForaging(world.scene, world.sunset.shoreMesh, camera, renderer.domElement, stoneBox, {
        onLoading(assets) {
            waitForAssets(assets, '正在准备岸边石子…');
        },
        onEquipAndStandUp(stone) {
            applyEquippedStone(stone);
            resetToShore();
        },
        onTakeAndCompare(stone) {
            applyEquippedStone(stone);
            triggerSamePowerThrow();
        },
        hasCompareBaseline() {
            return Boolean(lastManualLaunch);
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

    function openForaging() {
        stopAutoReplay(true);
        resultToast.classList.remove('visible', 'new-best');
        closeHeaderMenus();
        cancelGesture();
        setLabOpen(false);
        shoreForaging.open();
    }

    document.querySelector<HTMLButtonElement>('#open-stones')!.onclick = () => {
        if (shoreForaging.isOpen()) shoreForaging.close();
        else openForaging();
    };
    document.querySelector<HTMLButtonElement>('#open-tune')!.onclick = () => {
        stopAutoReplay(true);
        resultToast.classList.remove('visible', 'new-best');
        closeHeaderMenus();
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

    function syncLabHud() {
        pauseButton.textContent = session.paused ? '继续' : '暂停';
    }

    function setLabOpen(open: boolean) {
        document.body.classList.toggle('lab-open', open);
        labToggle.classList.toggle('active', open);
        resetGraphicsSampling();
    }

    labToggle.onclick = () => {
        closeHeaderMenus();
        setLabOpen(!document.body.classList.contains('lab-open'));
    };
    document.querySelector<HTMLButtonElement>('#lab-close')!.onclick = () => setLabOpen(false);

    // Long-throw practice lives in Lab only (uses T=0 for this throw without locking global temperature)
    function triggerLongThrow() {
        stopAutoReplay(false);
        Object.assign(parameters, longLaunch);
        syncControls();
        syncHandPanel();
        rig.view = 'course';
        viewSelect.value = 'course';
        preReplayView = 'course';
        start(false, longLaunch, 0);
    }

    longButton.onclick = triggerLongThrow;

    // Manual Lab dropdown overrides always exit auto-replay so lab inspection stays under user control
    viewSelect.addEventListener('change', () => {
        clearAutoReplayTimer();
        isAutoReplay = false;
        preReplayView = rig.view;
        syncLabHud();
    });
    playbackSelect.addEventListener('change', () => {
        clearAutoReplayTimer();
        isAutoReplay = false;
        syncLabHud();
    });

    const gesture = new PullThrowGesture();
    const canvas = renderer.domElement;
    canvas.id = 'lake-canvas';
    canvas.setAttribute('aria-label', '湖面投掷区域');
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('selectstart', event => event.preventDefault());
    const mouseLabel = document.createElement('label');
    mouseLabel.className = 'mouse-water-toggle';
    mouseLabel.innerHTML = '<input type="checkbox" id="mouse-water"> 鼠标拨水验证 · 拖动连续水面';
    document.querySelector('.actions')!.after(mouseLabel);
    const mouseMode = mouseLabel.querySelector<HTMLInputElement>('input')!;
    mouseMode.onchange = () => {
        stopAutoReplay(true);
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
            syncLabHud();
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
        gestureTitle.textContent = '在湖面向下拉蓄力 · 左右瞄准 · 松手甩出';
        document.querySelector<HTMLProgressElement>('#power')!.value = 0;
        syncInputHints(document.body.classList.contains('touch-input'));
        document.querySelector<HTMLElement>('#aim-arrow')!.style.transform = 'rotate(0deg)';
    }
    const pointerInput = (event: PointerEvent) => ({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp > 0 ? event.timeStamp : performance.now(),
    });
    canvas.addEventListener('pointerdown', event => {
        if (!lakeReady || shoreForaging.isOpen()) return;
        if (gesture.pointerId !== undefined) {
            if (event.pointerId !== gesture.pointerId) cancelGesture();
            return;
        }
        if (!event.isPrimary || event.button !== 0) return;
        if (gesture.begin(pointerInput(event), canvas.getBoundingClientRect(), parameters)) {
            syncInputHints(event.pointerType === 'touch' || isTouchDevice());
            closeHeaderMenus();
            clearAutoReplayTimer();
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
            lastManualLaunch = { ...released.target };
            syncSameThrowButtons();
            syncControls();
            syncHandPanel();
            start(false, released.target, launch.temperature * released.temperatureScale, { release: released.wristRelease });
        } else if (active && !hasThrown) {
            setFirstPullHint(true);
            firstPullHint.hidden = false;
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

    let viewWidth = 0;
    let viewHeight = 0;
    function resizeView() {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width || innerWidth));
        const height = Math.max(1, Math.round(rect.height || innerHeight));
        if (width === viewWidth && height === viewHeight) return;
        // A moving browser toolbar only changes height. Keep the ongoing pull intact.
        if (viewWidth && width !== viewWidth) cancelGesture();
        viewWidth = width;
        viewHeight = height;
        resetGraphicsSampling();
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        world.resizeGraphics(width, height);
        syncGraphicsStatus();
    }
    new ResizeObserver(resizeView).observe(canvas);
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

    function startAutoReplay() {
        if (
            !lakeReady || !session.snapshot ||
            session.mouseMode ||
            dev.isReferenceMode ||
            shoreForaging.isOpen() ||
            document.hidden ||
            gesture.pointerId !== undefined
        ) return;
        applyPendingGraphics(true);
        clearAutoReplayTimer();
        if (!isAutoReplay) {
            preReplayView = rig.view;
        }
        isAutoReplay = true;
        syncReplayButtons();
        if (!replayCurrentThrow()) return;
        setResultDetails(false);
        session.mode = 'slow';
        playbackSelect.value = 'slow';
        const useBullet = replayCameraMode === 'bullet';
        rig.view = useBullet ? 'follow' : 'course';
        viewSelect.value = rig.view;
        heardContacts = 0;
        heardSink = false;
        const lastThrow = session.snapshot!;
        const activeStone = session.sim.stone;
        waitForAssets(world.setStoneMesh(activeStone), '正在准备石子…');
        world.setStoneWet(false);
        feedback.reset();
        const simDuration = lastFinishedDuration ?? Math.max(1.4, Math.min(4.5, lastThrow.sampled.speed * 0.165));
        rig.beginThrow(session.sim.p, useBullet, lastThrow.sampled.direction, camera.aspect, simDuration, PLAYBACK_RATE.slow);
        playThrowWhenReady(lastThrow.sampled.speed, activeStone.mass);
        syncLabHud();
    }

    function replayCurrentThrow() {
        const source = throwSource?.snapshot === session.snapshot ? throwSource : undefined;
        if (!session.replay()) return false;
        throwSource = source && { ...source, snapshot: session.snapshot! };
        return true;
    }

    function start(
        replay = false,
        target: Launch = parameters,
        effectiveTemperature = launch.temperature,
        source: { release?: WristRelease; samePower?: boolean } = {}
    ) {
        applyPendingGraphics(true);
        stopAutoReplay(!replay);
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
            if (!replayCurrentThrow()) return;
        } else {
            lastFinishedDuration = undefined;
            lastFinishedStats = undefined;
            const equipped = stoneBox.equipped;
            session.start(target, effectiveTemperature, launch.visual, equipped);
            throwSource = { snapshot: session.snapshot!, release: source.release, samePower: Boolean(source.samePower) };
            shoreForaging.consumeEphemeralAfterThrow();
            playbackSelect.value = 'normal';
        }
        hasThrown = true;
        setFirstPullHint();
        firstPullHint.hidden = true;
        const lastThrow = session.snapshot!;
        const activeStone = session.sim.stone;
        waitForAssets(world.setStoneMesh(activeStone), '正在准备石子…');
        world.setStoneWet(false);
        syncHandPanel();
        document.querySelector<HTMLTextAreaElement>('#snapshot')!.value = JSON.stringify(session.snapshot, null, 2);
        document.querySelector('#launch-summary')!.textContent = `本次 seed ${lastThrow.seed} · T=${lastThrow.temperature.toFixed(2)} · ${activeStone.name}\n目标 → 实际出手\n` + fields.map(([key, label, , , , unit]) => `${label} ${(lastThrow.target[key] ?? 0).toFixed(3)} → ${(lastThrow.sampled[key] ?? 0).toFixed(3)} ${unit}`).join('\n');
        feedback.reset();
        const estimatedSimSeconds = lastFinishedDuration ?? Math.max(1.4, Math.min(4.5, lastThrow.sampled.speed * 0.165));
        const rate = PLAYBACK_RATE[session.mode];
        rig.beginThrow(session.sim.p, session.mode === 'bullet', lastThrow.sampled.direction, camera.aspect, estimatedSimSeconds, rate);
        audio.unlock();
        playThrowWhenReady(lastThrow.sampled.speed, activeStone.mass);
        dev.resetFrames();
        syncLabHud();
    }

    function resetToShore() {
        applyPendingGraphics(true);
        playPendingThrow = undefined;
        stopAutoReplay(false);
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
        session.resetToReady(parameters, stoneBox.equipped);
        playbackSelect.value = 'normal';
        rig.view = 'overview';
        viewSelect.value = 'overview';
        preReplayView = 'overview';
        waitForAssets(world.setStoneMesh(stoneBox.equipped), '正在准备石子…');
        world.setStoneWet(false);
        feedback.reset();
        rig.beginThrow(session.sim.p, false, parameters.direction, camera.aspect);
        audio.updatePlaybackState('normal', false);
        syncHandPanel();
        syncLabHud();
    }

    function triggerSamePowerThrow() {
        const ref = lastManualLaunch ?? parameters;
        const spinSign = parameters.spin < 0 ? -1 : 1;
        const compareLaunch: Launch = {
            speed: ref.speed,
            direction: ref.direction,
            elevation: parameters.elevation,
            tilt: parameters.tilt,
            roll: parameters.roll ?? 0,
            spin: spinSign * Math.abs(ref.spin || parameters.spin || 20),
        };
        Object.assign(parameters, compareLaunch);
        syncControls();
        syncHandPanel();
        start(false, compareLaunch, 0, { samePower: true });
    }

    // Result toast replay-mode switcher & quick actions
    resultReplayCourse.onclick = () => {
        replayCameraMode = 'course';
        startAutoReplay();
    };
    resultReplayBullet.onclick = () => {
        replayCameraMode = 'bullet';
        startAutoReplay();
    };
    resultSamePower.onclick = triggerSamePowerThrow;
    handSameThrow.onclick = triggerSamePowerThrow;
    resultThrowAgain.onclick = resetToShore;
    document.querySelector<HTMLButtonElement>('#replay-return')!.onclick = resetToShore;
    resultChangeStone.onclick = openForaging;

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
        syncLabHud();
    }
    pauseButton.onclick = toggle;
    document.querySelector<HTMLButtonElement>('#step')!.onclick = () => {
        session.paused = true;
        session.advance(1 / 120);
        syncLabHud();
    };
    window.addEventListener('keydown', event => {
        if (event.code === 'Escape') {
            if (themeSwitcher.classList.contains('open') || weatherSwitcher.classList.contains('open')) {
                closeHeaderMenus();
                return;
            }
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
            closeHeaderMenus();
            if (shoreForaging.isOpen()) shoreForaging.close();
            setLabOpen(!document.body.classList.contains('lab-open'));
            return;
        }
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, summary')) return;
        if (event.code === 'KeyF') {
            event.preventDefault();
            if (shoreForaging.isOpen()) shoreForaging.close();
            else openForaging();
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
        resetGraphicsSampling();
        if (document.hidden) {
            clearAutoReplayTimer();
            cancelGesture();
            session.paused = true;
            syncLabHud();
        }
    });

    syncLabHud();
    syncHandPanel();
    syncReplayButtons();

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
        if (lakeReady) session.tick(elapsed);
        const { sim, paused } = session;
        const preview = gesture.preview(now);
        const isAiming = Boolean(preview);
        const atShore = paused && !sim.ended && sim.ticks === 0 && !shoreForaging.isOpen() && !session.mouseMode && !dev.isReferenceMode;
        const inSweet = preview?.wristRelease?.timing === 'hit';
        gestureHud.classList.toggle('charging', isAiming);
        gestureHud.classList.toggle('in-sweet', inSweet);
        if (preview) {
            gestureTitle.textContent = inSweet ? '金色区命中 · 现在松手' : '向下拉蓄力 · 白点进金色区再松手';
            document.querySelector<HTMLProgressElement>('#power')!.value = preview.power;
            wristCursorEl.style.left = `${(preview.wristCursor * 100).toFixed(1)}%`;
            const spinText = `${preview.target.spin < 0 ? '逆' : '顺'}${Math.abs(preview.target.spin).toFixed(0)}r/s`;
            document.querySelector('#aim')!.textContent = `${Math.round(preview.power * 100)}% · ${preview.target.speed.toFixed(1)} m/s · 方向 ${preview.target.direction.toFixed(0)}° · ${spinText}`;
            document.querySelector<HTMLElement>('#aim-arrow')!.style.transform = `rotate(${preview.target.direction}deg)`;
            world.aimGuide.update(preview.target, stoneBox.equipped, preview.sweetQuality);
        } else if (atShore) {
            world.aimGuide.showReadyHint(parameters, stoneBox.equipped, ambientTime);
        } else {
            world.aimGuide.hide();
        }

        const visibleDrops = feedback.update(session, document.querySelector<HTMLInputElement>('#helpers')!.checked);
        // Hide the active lakeside throwing stone & halo while crouching on the beach so nothing floats in the sky
        const foragingNow = shoreForaging.isOpen();
        if (lakeReady && !document.hidden && !foragingNow && !session.mouseMode && !dev.isReferenceMode &&
            world.waterField.mesh.material.uniforms.surfaceInspection.value === 0) {
            sampleGraphics(raf, now, !paused && !sim.ended && sim.ticks > 0);
            if (!isAiming && (atShore || sim.ended)) applyPendingGraphics(false);
        } else {
            resetGraphicsSampling();
        }
        if (foragingNow) {
            world.stone.visible = false;
            world.halo.visible = false;
        } else {
            world.stone.visible = true;
        }
        world.setStoneWet(sim.contacts.length > 0);
        const envTime = dev.isReferenceMode ? session.presentationTime : ambientTime;
        world.updateEnvironment(envTime);

        const useBulletCam = session.mode === 'bullet' || (isAutoReplay && replayCameraMode === 'bullet');

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
                rig.update(camera, sim.p, session.presentationTime, useBulletCam, elapsed, paused, sim.contacts);
            }
        }
        dev.applySideCamera(camera);
        updateTelemetry(
            session,
            visibleDrops,
            isAutoReplay ? lastFinishedStats : undefined
        );

        const rect = canvas.getBoundingClientRect();
        bounceMarkers.update(sim.contacts, camera, rect.width, rect.height, session.visualTime);

        audio.updatePlaybackState(session.mode, paused || !lakeReady || document.hidden);
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

        // End of a live throw -> record stats, translate physics into coaching feedback, show result card.
        // Auto-replay plays ONCE only when setting a new personal best (>= 3 skips); normal throws keep practice cadence crisp.
        if (sim.ended && !resultShownForThrow && !isAutoReplay && !session.mouseMode && !dev.isReferenceMode && session.snapshot) {
            resultShownForThrow = true;
            lastFinishedDuration = sim.time;
            const distance = Math.hypot(sim.p.x, sim.p.z);
            lastFinishedStats = { skips: sim.skips, distance };
            replayCameraMode = 'course';
            syncReplayButtons();
            rig.setBulletSpanFromDuration(sim.time, PLAYBACK_RATE.slow);
            stoneBox.recordResult(sim.stone.id, sim.skips, distance);
            const { isNewBest, message } = commitRecord(lastFinishedStats.skips, lastFinishedStats.distance);
            resultBestGap.textContent = message;

            const source = throwSource?.snapshot === session.snapshot ? throwSource : undefined;
            const diagnosis = diagnoseThrow(sim, {
                snapshot: session.snapshot,
                release: source?.release,
                isSamePowerCompare: source?.samePower,
                baseline: lastBaseline,
            });
            document.querySelector('#result-tag')!.textContent = sim.skips > 0 ? `${sim.stone.name} · ${sim.reason}` : `${sim.stone.name} · 未起跳落水`;
            document.querySelector('#result-stats')!.textContent = `${lastFinishedStats.skips} 跳 · ${lastFinishedStats.distance.toFixed(1)} m`;
            resultMetrics.textContent = diagnosis.metricsLine;
            resultCompare.textContent = diagnosis.compareLine ?? '';
            resultCompare.classList.toggle('visible', Boolean(diagnosis.compareLine));
            resultRelease.hidden = !diagnosis.timing;
            if (diagnosis.timing) {
                resultReleaseLabel.textContent = diagnosis.timing.label;
                resultReleaseCursor.style.left = `${diagnosis.timing.cursor * 100}%`;
            }
            resultCause.textContent = diagnosis.cause;
            resultTip.textContent = `下一投：${diagnosis.nextTip}`;
            setResultDetails(false);
            resultToast.classList.toggle('new-best', isNewBest);
            resultToast.classList.add('visible');

            // Update baseline on manual throws (or first throw) so subsequent same-power compares measure against it
            if (!source?.samePower || !lastBaseline) {
                lastBaseline = {
                    skips: sim.skips,
                    distance,
                    stoneName: sim.stone.name,
                    tilt: session.snapshot.target.tilt,
                    roll: session.snapshot.target.roll ?? 0,
                };
            }
            if (!lastManualLaunch) {
                lastManualLaunch = { ...session.snapshot.target };
                syncSameThrowButtons();
            }

            if (isNewBest && sim.skips >= 3 && !foragingNow && !compactLayout.matches) {
                autoReplayTimer = window.setTimeout(() => {
                    autoReplayTimer = undefined;
                    if (!compactLayout.matches) startAutoReplay();
                }, 900);
            }
        }

        // Single-pass replay ends cleanly without looping so it never hijacks throwing cadence
        if (sim.ended && isAutoReplay && !paused) {
            session.paused = true;
            syncLabHud();
        }

        const hud = isAiming ? 'aim'
            : isAutoReplay && !sim.ended ? 'replay'
            : resultToast.classList.contains('visible') ? 'result'
            : atShore || sim.ended ? 'ready' : 'flight';
        if (document.body.dataset.throwHud !== hud) document.body.dataset.throwHud = hud;
        firstPullHint.hidden = compactLayout.matches ? hud !== 'ready' : hasThrown || isAiming || !atShore;

        world.post.render(envTime);
        // Draw one frame with the settled meshes and textures before accepting a throw.
        if (!lakeReady && pendingAssets.size === 0) {
            lakeReady = true;
            resetGraphicsSampling();
            lakeLoading.hidden = true;
            if (!session.paused) playPendingThrow?.();
            playPendingThrow = undefined;
        }
        dev.recordFrame(raf, performance.now() - cpuStart);
    }
    requestAnimationFrame(frame);
}
