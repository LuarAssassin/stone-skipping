import * as THREE from 'three';
import type { Contact } from '../simulation/physics';
import type { ReplayMode } from '../app/session';

const MUTE_STORAGE_KEY = 'stone-skipping-muted-v1';

type SampleKey =
    | 'ambience'
    | 'skipHeavy1' | 'skipHeavy2' | 'skipHeavy3'
    | 'skipLight1' | 'skipLight2' | 'skipLight3'
    | 'skipSkim1' | 'skipSkim2' | 'skipSkim3'
    | 'sinkBoulder1' | 'sinkBoulder2'
    | 'sinkPlop1' | 'sinkPlop2' | 'sinkPlop3' | 'sinkPlop4'
    | 'sinkLight1' | 'sinkSlip1'
    | 'whoosh1' | 'whooshHeavy' | 'whooshLight'
    | 'stonePick1' | 'stonePick2' | 'stonePickHeavy';

export const SAMPLE_URLS: Record<SampleKey, string> = {
    ambience: '/assets/audio/sunset-lake-ambience.mp3',
    skipHeavy1: '/assets/audio/skip-heavy.mp3',
    skipHeavy2: '/assets/audio/skip-heavy-2.mp3',
    skipHeavy3: '/assets/audio/skip-heavy-3.mp3',
    skipLight1: '/assets/audio/skip-light.mp3',
    skipLight2: '/assets/audio/skip-light-2.mp3',
    skipLight3: '/assets/audio/skip-light-3.mp3',
    skipSkim1: '/assets/audio/skip-skim-1.mp3',
    skipSkim2: '/assets/audio/skip-skim-2.mp3',
    skipSkim3: '/assets/audio/skip-skim-3.mp3',
    sinkBoulder1: '/assets/audio/sink-boulder-1.mp3',
    sinkBoulder2: '/assets/audio/sink-boulder-2.mp3',
    sinkPlop1: '/assets/audio/sink-plop.mp3',
    sinkPlop2: '/assets/audio/sink-plop-2.mp3',
    sinkPlop3: '/assets/audio/sink-plop-3.mp3',
    sinkPlop4: '/assets/audio/sink-plop-4.mp3',
    sinkLight1: '/assets/audio/sink-light-1.mp3',
    sinkSlip1: '/assets/audio/sink-slip-1.mp3',
    whoosh1: '/assets/audio/throw-whoosh.mp3',
    whooshHeavy: '/assets/audio/throw-whoosh-heavy.mp3',
    whooshLight: '/assets/audio/throw-whoosh-light.mp3',
    stonePick1: '/assets/audio/stone-pick-1.mp3',
    stonePick2: '/assets/audio/stone-pick-2.mp3',
    stonePickHeavy: '/assets/audio/stone-pick-heavy.mp3',
};

const SKIP_HEAVY_POOL: readonly SampleKey[] = ['skipHeavy1', 'skipHeavy2', 'skipHeavy3'];
const SKIP_LIGHT_POOL: readonly SampleKey[] = ['skipLight1', 'skipLight2', 'skipLight3'];
const SKIP_SKIM_POOL: readonly SampleKey[] = ['skipSkim1', 'skipSkim2', 'skipSkim3'];
const SINK_BOULDER_POOL: readonly SampleKey[] = ['sinkBoulder1', 'sinkBoulder2'];
const SINK_PLOP_POOL: readonly SampleKey[] = ['sinkPlop1', 'sinkPlop2', 'sinkPlop3', 'sinkPlop4'];
const SINK_LIGHT_POOL: readonly SampleKey[] = ['sinkLight1', 'sinkPlop2', 'sinkPlop4'];
const SINK_SLIP_POOL: readonly SampleKey[] = ['sinkSlip1', 'sinkLight1'];
const WHOOSH_HEAVY_POOL: readonly SampleKey[] = ['whooshHeavy', 'whoosh1'];
const WHOOSH_MID_POOL: readonly SampleKey[] = ['whoosh1', 'whooshHeavy', 'whooshLight'];
const WHOOSH_LIGHT_POOL: readonly SampleKey[] = ['whooshLight', 'whoosh1'];
const STONE_PICK_POOL: readonly SampleKey[] = ['stonePick1', 'stonePick2'];
const STONE_PICK_HEAVY_POOL: readonly SampleKey[] = ['stonePickHeavy', 'stonePick1'];

interface DecodedSample {
    buffer: AudioBuffer;
    onset: number;
}

/** Find the exact transient onset in decoded PCM so AI-generated one-shots fire with sub-ms sync. */
function detectOnsetSeconds(buffer: AudioBuffer): number {
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
    }
    if (peak < 1e-4) return 0;
    const threshold = peak * 0.05;
    for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) >= threshold) {
            return Math.max(0, i / buffer.sampleRate - 0.008);
        }
    }
    return 0;
}

/** Generate a lightweight open-water horizon stereo reverb impulse response. */
function createLakeReverbImpulse(ctx: AudioContext): AudioBuffer {
    const duration = 1.6;
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const out = impulse.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < length; i++) {
            const t = i / length;
            const env = Math.pow(1 - t, 2.8) * (0.25 + 0.75 * Math.min(1, t * 28));
            const white = Math.random() * 2 - 1;
            const alpha = 0.24 - 0.16 * t;
            lp += (white - lp) * alpha;
            out[i] = lp * env;
        }
    }
    return impulse;
}

/** Fallback procedural soft pink-like noise buffer if MP3s are still loading or unavailable. */
function createNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.02) * 0.65;
    }
    return buf;
}

function loadMutedPreference(): boolean {
    try {
        return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

/** Compute physically grounded sink audibility [0..1] from entry velocity vector & prior skip count.
 *  - Direct drop (0 skips, steep plunge) -> loud resonant plop (near 1.0)
 *  - Multi-skip throw sliding shallowly beneath supporting water -> quiet hushed slip (near 0) */
export function sinkPlungeIntensity(velocity: THREE.Vector3, skips: number): number {
    const speed = velocity.length();
    const verticalDown = Math.max(0, -velocity.y);
    const entrySine = speed > 0.05 ? verticalDown / speed : 1;
    const steepFactor = THREE.MathUtils.smoothstep(entrySine, 0.08, 0.55);
    const verticalFactor = THREE.MathUtils.clamp((verticalDown - 0.15) / 2.4, 0.04, 1.0);

    if (skips <= 0) {
        // Direct throw into water without skipping: preserve full resonant plop
        return THREE.MathUtils.clamp(0.42 + 0.58 * (0.4 * steepFactor + 0.6 * verticalFactor), 0.35, 1.0);
    }

    // Successful skipping runs lose vertical energy & glide gently under the water film
    const skipDecay = Math.exp(-skips * 0.58);
    const raw = skipDecay * (0.18 + 0.82 * steepFactor) * (0.20 + 0.80 * verticalFactor);
    return THREE.MathUtils.clamp(raw, 0, 0.42);
}

export class CinemaAudioEngine {
    private ctx?: AudioContext;
    private masterGain?: GainNode;
    private cinemaFilter?: BiquadFilterNode;
    private ambienceGain?: GainNode;
    private sfxGain?: GainNode;
    private reverbConvolver?: ConvolverNode;
    private noiseBuffer?: AudioBuffer;
    private samples = new Map<SampleKey, DecodedSample>();
    private lastPickedByPool = new Map<string, SampleKey>();
    private loadingStarted = false;
    private ambienceSource?: AudioBufferSourceNode;
    private ambienceKind: 'none' | 'procedural' | 'sample' = 'none';
    private muted = loadMutedPreference();
    private lastSkipAtMs = -Infinity;
    private currentMode: ReplayMode = 'normal';
    private currentPaused = false;
    private camRight = new THREE.Vector3();
    private toPoint = new THREE.Vector3();

    get isMuted() {
        return this.muted;
    }

    setMuted(value: boolean) {
        this.muted = value;
        try {
            localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0');
        } catch {
            // ignore
        }
        if (this.ctx && this.masterGain) {
            const now = this.ctx.currentTime;
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setTargetAtTime(value ? 0 : 0.92, now, 0.04);
        }
        if (!value) this.unlock();
    }

    toggleMute(): boolean {
        this.setMuted(!this.muted);
        return this.muted;
    }

    unlock() {
        if (typeof window === 'undefined') return;
        const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;

        if (!this.ctx) {
            this.ctx = new AudioCtor();
            const ctx = this.ctx;

            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -10;
            compressor.knee.value = 14;
            compressor.ratio.value = 4;
            compressor.attack.value = 0.004;
            compressor.release.value = 0.16;

            this.masterGain = ctx.createGain();
            this.masterGain.gain.value = this.muted ? 0 : 0.92;

            this.cinemaFilter = ctx.createBiquadFilter();
            this.cinemaFilter.type = 'lowpass';
            this.cinemaFilter.frequency.value = 18000;
            this.cinemaFilter.Q.value = 0.7;

            this.ambienceGain = ctx.createGain();
            this.ambienceGain.gain.value = 0.0001;

            this.sfxGain = ctx.createGain();
            this.sfxGain.gain.value = 0.95;

            this.reverbConvolver = ctx.createConvolver();
            this.reverbConvolver.buffer = createLakeReverbImpulse(ctx);
            const reverbReturn = ctx.createGain();
            reverbReturn.gain.value = 0.36;

            this.noiseBuffer = createNoiseBuffer(ctx, 2.5);

            this.ambienceGain.connect(this.cinemaFilter);
            this.sfxGain.connect(this.cinemaFilter);
            this.reverbConvolver.connect(reverbReturn);
            reverbReturn.connect(this.cinemaFilter);
            this.cinemaFilter.connect(compressor);
            compressor.connect(this.masterGain);
            this.masterGain.connect(ctx.destination);

            this.startProceduralAmbience();
            this.loadAllSamples();
            this.applyCinemaState();
        }

        if (this.ctx.state === 'suspended') {
            void this.ctx.resume();
        }
    }

    private async loadAllSamples() {
        if (this.loadingStarted || !this.ctx) return;
        this.loadingStarted = true;
        const ctx = this.ctx;

        await Promise.all(
            (Object.keys(SAMPLE_URLS) as SampleKey[]).map(async key => {
                try {
                    const res = await fetch(SAMPLE_URLS[key]);
                    if (!res.ok) return;
                    const arrayBuf = await res.arrayBuffer();
                    const buffer = await ctx.decodeAudioData(arrayBuf);
                    const onset = key === 'ambience' ? 0 : detectOnsetSeconds(buffer);
                    this.samples.set(key, { buffer, onset });
                    if (key === 'ambience') {
                        this.switchToSampleAmbience(buffer);
                    }
                } catch {
                    // Graceful fallback to procedural Web Audio synthesis
                }
            })
        );
    }

    private startProceduralAmbience() {
        if (!this.ctx || !this.ambienceGain || !this.noiseBuffer || this.ambienceKind !== 'none') return;
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 420;
        filter.Q.value = 0.55;

        src.connect(filter);
        filter.connect(this.ambienceGain);
        src.start();
        this.ambienceSource = src;
        this.ambienceKind = 'procedural';
        this.applyCinemaState();
    }

    private switchToSampleAmbience(buffer: AudioBuffer) {
        if (!this.ctx || !this.ambienceGain) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const oldSrc = this.ambienceSource;
        const nextGain = ctx.createGain();
        nextGain.gain.setValueAtTime(0.0001, now);
        nextGain.gain.exponentialRampToValueAtTime(1.0, now + 1.4);

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(nextGain);
        nextGain.connect(this.ambienceGain);
        src.start(now);

        if (oldSrc) {
            try {
                oldSrc.stop(now + 0.6);
            } catch {
                // ignore
            }
        }
        this.ambienceSource = src;
        this.ambienceKind = 'sample';
        this.applyCinemaState();
    }

    updatePlaybackState(mode: ReplayMode, paused: boolean) {
        if (mode === this.currentMode && paused === this.currentPaused) return;
        this.currentMode = mode;
        this.currentPaused = paused;
        this.applyCinemaState();
    }

    private applyCinemaState() {
        if (!this.ctx || !this.cinemaFilter || !this.ambienceGain) return;
        const now = this.ctx.currentTime;
        const targetCutoff =
            this.currentMode === 'bullet' ? 920 :
            this.currentMode === 'slow' ? 3200 :
            18500;
        this.cinemaFilter.frequency.setTargetAtTime(targetCutoff, now, 0.14);

        const baseAmbience = this.ambienceKind === 'sample' ? 0.30 : 0.08;
        const targetAmbience = this.currentPaused ? baseAmbience * 0.38 : baseAmbience;
        this.ambienceGain.gain.setTargetAtTime(targetAmbience, now, 0.25);

        if (this.ambienceSource && this.ambienceKind === 'sample') {
            const ambRate = this.currentMode === 'bullet' ? 0.62 : this.currentMode === 'slow' ? 0.84 : 1.0;
            this.ambienceSource.playbackRate.setTargetAtTime(ambRate, now, 0.18);
        }
    }

    private computeSpatial(point: THREE.Vector3, camera: THREE.PerspectiveCamera) {
        const dist = camera.position.distanceTo(point);
        // Open-water distance attenuation + natural air high-frequency rolloff
        const gain = 1 / (1 + dist * 0.085);
        const airCutoff = Math.max(1200, 15500 * Math.exp(-dist * 0.055));
        const reverbSend = Math.min(0.65, 0.10 + dist * 0.015);
        this.camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        this.toPoint.copy(point).sub(camera.position).normalize();
        const pan = THREE.MathUtils.clamp(this.toPoint.dot(this.camRight) * 0.82, -0.85, 0.85);
        return { dist, gain, airCutoff, reverbSend, pan };
    }

    private createSpatialChain(point: THREE.Vector3, camera: THREE.PerspectiveCamera, volume: number, extraLowpass?: number) {
        const ctx = this.ctx!;
        const sp = this.computeSpatial(point, camera);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = extraLowpass ? Math.min(sp.airCutoff, extraLowpass) : sp.airCutoff;
        filter.Q.value = 0.6;

        const gain = ctx.createGain();
        gain.gain.value = Math.min(1.15, volume * sp.gain);

        const panner = ctx.createStereoPanner();
        panner.pan.value = sp.pan;

        filter.connect(gain);
        gain.connect(panner);
        panner.connect(this.sfxGain!);

        if (this.reverbConvolver) {
            const send = ctx.createGain();
            send.gain.value = sp.reverbSend;
            gain.connect(send);
            send.connect(this.reverbConvolver);
        }

        return { input: filter, gain, sp };
    }

    /** Pick a loaded sample randomly from a candidate pool, avoiding immediate back-to-back repeats. */
    private pickSample(poolName: string, keys: readonly SampleKey[]): DecodedSample | undefined {
        const available = keys.filter(k => this.samples.has(k));
        if (available.length === 0) return undefined;
        const prev = this.lastPickedByPool.get(poolName);
        const candidates = available.length > 1 && prev ? available.filter(k => k !== prev) : available;
        const chosenKey = candidates[Math.floor(Math.random() * candidates.length)];
        this.lastPickedByPool.set(poolName, chosenKey);
        return this.samples.get(chosenKey);
    }

    /** Tactile river-stone foley when picking up or pocketing a stone (real ElevenLabs samples with procedural fallback). */
    playStoneClink(stoneMass = 0.06) {
        if (this.muted || !this.ctx || !this.sfxGain) return;
        const ctx = this.ctx;
        if (ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const massRatio = THREE.MathUtils.clamp(stoneMass / 0.06, 0.35, 3.2);
        const pitch = Math.pow(1 / massRatio, 0.22);

        const sample = stoneMass >= 0.13
            ? this.pickSample('stonePickHeavy', STONE_PICK_HEAVY_POOL)
            : this.pickSample('stonePick', STONE_PICK_POOL);
        if (sample) {
            const src = ctx.createBufferSource();
            src.buffer = sample.buffer;
            src.playbackRate.value = (0.94 + Math.random() * 0.12) * THREE.MathUtils.clamp(pitch, 0.80, 1.18);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.001, now);
            g.gain.linearRampToValueAtTime(0.34 * Math.pow(massRatio, 0.18), now + 0.005);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
            src.connect(g);
            g.connect(this.sfxGain);
            src.start(now, sample.onset);
            return;
        }

        // Fallback dual short stony click resonances while MP3s load
        for (const [offset, mult, amp] of [[0, 1.0, 0.14], [0.018, 1.38, 0.09]] as const) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const f = (1280 + Math.random() * 240) * pitch * mult;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now + offset);
            osc.frequency.exponentialRampToValueAtTime(f * 0.62, now + offset + 0.032);
            g.gain.setValueAtTime(0.0005, now + offset);
            g.gain.linearRampToValueAtTime(amp, now + offset + 0.002);
            g.gain.exponentialRampToValueAtTime(0.0005, now + offset + 0.036);
            osc.connect(g);
            g.connect(this.sfxGain);
            osc.start(now + offset);
            osc.stop(now + offset + 0.042);
        }
    }

    playThrow(speed: number, stoneMass = 0.06) {
        if (this.muted || !this.ctx || !this.sfxGain) return;
        const ctx = this.ctx;
        if (ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const intensity = THREE.MathUtils.clamp((speed - 5) / 18, 0.25, 1.0);
        const rateScale = this.currentMode === 'bullet' ? 0.42 : this.currentMode === 'slow' ? 0.68 : 1.0;

        const whooshPool = (speed >= 17 || stoneMass >= 0.13)
            ? WHOOSH_HEAVY_POOL
            : (speed <= 10.5 && stoneMass <= 0.055)
                ? WHOOSH_LIGHT_POOL
                : WHOOSH_MID_POOL;
        const sample = this.pickSample('whoosh', whooshPool);
        if (sample) {
            const src = ctx.createBufferSource();
            src.buffer = sample.buffer;
            src.playbackRate.value = (0.90 + intensity * 0.26 + (Math.random() - 0.5) * 0.08) * rateScale;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0005, now);
            g.gain.linearRampToValueAtTime(0.32 * intensity, now + 0.022);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.50 / rateScale);
            src.connect(g);
            g.connect(this.sfxGain);
            src.start(now, sample.onset);
            return;
        }

        if (!this.noiseBuffer) return;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(320 * rateScale, now);
        bp.frequency.exponentialRampToValueAtTime(1150 * rateScale, now + 0.14);
        bp.Q.value = 1.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0005, now);
        g.gain.linearRampToValueAtTime(0.20 * intensity, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.sfxGain);
        src.start(now, Math.random() * 0.6, 0.3);
    }

    playSkip(contact: Contact, skipIndex: number, camera: THREE.PerspectiveCamera, stoneMass = 0.06) {
        if (this.muted || !this.ctx || !this.sfxGain) return;
        const ctx = this.ctx;
        if (ctx.state !== 'running') return;

        // Smooth spacing guard during high-frequency micro-skip cascades
        const nowMs = performance.now();
        if (nowMs - this.lastSkipAtMs < 32) return;
        this.lastSkipAtMs = nowMs;

        const now = ctx.currentTime;
        const speed = contact.velocity.length();
        const vertical = Math.abs(contact.velocity.y);
        const massRatio = THREE.MathUtils.clamp(stoneMass / 0.06, 0.35, 2.5);
        const massGain = Math.pow(massRatio, 0.28);
        const massPitch = Math.pow(1 / massRatio, 0.16);
        const energyNorm = THREE.MathUtils.clamp((speed * 0.038 + vertical * 0.24), 0.14, 1.0);
        const rateScale = this.currentMode === 'bullet' ? 0.38 : this.currentMode === 'slow' ? 0.64 : 1.0;

        // Gentle volume taper on later delicate micro-skips so rapid skips feel silky and watery
        const skipEnvelope = skipIndex === 0 ? 1.0 : Math.max(0.24, Math.pow(0.92, skipIndex));
        // Soften harsh upper-mid resonances on subsequent skips (keeps liquid shimmer without "ruler/click" hardness)
        const softCutoff = skipIndex === 0 ? 15000 : Math.max(3800, 9200 - skipIndex * 180);
        const chain = this.createSpatialChain(
            contact.point,
            camera,
            (0.22 + 0.56 * energyNorm) * skipEnvelope * massGain,
            softCutoff
        );

        const heavy = this.pickSample('skipHeavy', SKIP_HEAVY_POOL);
        const light = this.pickSample('skipLight', SKIP_LIGHT_POOL);
        const skim = this.pickSample('skipSkim', SKIP_SKIM_POOL);

        // Keep pitch variation subtle & organic (~0.93..1.12) modulated by stone mass
        const jitter = (0.94 + Math.random() * 0.12) * massPitch;
        const gentleRise = 1.0 + Math.min(0.10, skipIndex * 0.006);

        if (heavy || light || skim) {
            if (skipIndex === 0) {
                // First contact: full crisp realistic water slap (lighter stones or gentle tosses can pull light pool)
                const primary = (stoneMass < 0.036 && energyNorm < 0.55 && light) ? light : (heavy ?? light ?? skim)!;
                const src = ctx.createBufferSource();
                src.buffer = primary.buffer;
                src.playbackRate.value = (0.94 + energyNorm * 0.12) * jitter * rateScale;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.001, now);
                g.gain.linearRampToValueAtTime(0.95, now + 0.004);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.68 / rateScale);
                src.connect(g);
                g.connect(chain.input);
                src.start(now, primary.onset);
            } else {
                // Subsequent consecutive skips: rotate across varied skim & light pools with soft 6ms liquid attack
                const chosen = (skipIndex <= 2 && energyNorm > 0.45 && Math.random() < 0.55 && light)
                    ? light
                    : (skim ?? light ?? heavy)!;
                const heavyHint = skipIndex <= 2 && heavy ? Math.max(0, (vertical - 0.85) * 0.25) : 0;

                if (heavyHint > 0.05 && heavy) {
                    const srcH = ctx.createBufferSource();
                    srcH.buffer = heavy.buffer;
                    srcH.playbackRate.value = 1.02 * jitter * rateScale;
                    const gH = ctx.createGain();
                    gH.gain.setValueAtTime(0.001, now);
                    gH.gain.linearRampToValueAtTime(heavyHint, now + 0.008);
                    gH.gain.exponentialRampToValueAtTime(0.001, now + 0.36 / rateScale);
                    srcH.connect(gH);
                    gH.connect(chain.input);
                    srcH.start(now, heavy.onset);
                }

                const srcS = ctx.createBufferSource();
                srcS.buffer = chosen.buffer;
                srcS.playbackRate.value = gentleRise * jitter * rateScale;
                const gS = ctx.createGain();
                gS.gain.setValueAtTime(0.001, now);
                gS.gain.linearRampToValueAtTime(0.88, now + 0.006);
                gS.gain.exponentialRampToValueAtTime(0.001, now + 0.36 / rateScale);
                srcS.connect(gS);
                gS.connect(chain.input);
                srcS.start(now, Math.max(0, chosen.onset + Math.random() * 0.006));

                // Subtle airy fine-spray shimmer layer (pure filtered noise, zero tonal pitch-bend)
                if (this.noiseBuffer) {
                    const nSrc = ctx.createBufferSource();
                    nSrc.buffer = this.noiseBuffer;
                    const hp = ctx.createBiquadFilter();
                    hp.type = 'bandpass';
                    hp.frequency.value = (2400 + Math.random() * 900) * rateScale;
                    hp.Q.value = 0.85;
                    const nG = ctx.createGain();
                    nG.gain.setValueAtTime(0.0005, now);
                    nG.gain.linearRampToValueAtTime(0.075 * energyNorm, now + 0.009);
                    nG.gain.exponentialRampToValueAtTime(0.0008, now + 0.12 / rateScale);
                    nSrc.connect(hp);
                    hp.connect(nG);
                    nG.connect(chain.input);
                    nSrc.start(now, Math.random() * 1.2, 0.16 / rateScale);
                }
            }
            return;
        }

        // Pure procedural fallback (soft filtered water swish only — no tonal frog/twang oscillator)
        if (this.noiseBuffer) {
            const nSrc = ctx.createBufferSource();
            nSrc.buffer = this.noiseBuffer;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = (1400 + energyNorm * 1200) * rateScale;
            bp.Q.value = 0.9;
            const nGain = ctx.createGain();
            nGain.gain.setValueAtTime(0.001, now);
            nGain.gain.linearRampToValueAtTime(0.34 * energyNorm, now + 0.007);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18 / rateScale);
            nSrc.connect(bp);
            bp.connect(nGain);
            nGain.connect(chain.input);
            nSrc.start(now, Math.random() * 0.8, 0.24 / rateScale);
        }
    }

    playSink(point: THREE.Vector3, velocity: THREE.Vector3, skips: number, camera: THREE.PerspectiveCamera, stoneMass = 0.06) {
        if (this.muted || !this.ctx || !this.sfxGain) return;
        const ctx = this.ctx;
        if (ctx.state !== 'running') return;

        const intensity = sinkPlungeIntensity(velocity, skips);
        // After a long shallow skipping run, the stone glides beneath the surface virtually silently
        if (intensity < 0.015) return;

        const now = ctx.currentTime;
        const massRatio = THREE.MathUtils.clamp(stoneMass / 0.06, 0.35, 2.8);
        const massGain = Math.pow(massRatio, 0.36);
        const massPitch = Math.pow(1 / massRatio, 0.18);
        const rateScale = this.currentMode === 'bullet' ? 0.40 : this.currentMode === 'slow' ? 0.65 : 1.0;

        // Route physically to distinct recorded plunge/sink pools based on prior skips & stone mass!
        let sink: DecodedSample | undefined;
        let durationSec = 1.15;
        if (skips >= 2) {
            // Post-skip shallow submerge: gentle liquid slip instead of loud kerplunk
            sink = this.pickSample('sinkSlip', SINK_SLIP_POOL) ?? this.pickSample('sinkPlop', SINK_PLOP_POOL);
            durationSec = 0.65;
        } else if (stoneMass >= 0.135) {
            // Heavy boulder / cobble direct drop: deep resonant kerplunk + tall splash
            sink = this.pickSample('sinkBoulder', SINK_BOULDER_POOL) ?? this.pickSample('sinkPlop', SINK_PLOP_POOL);
            durationSec = 1.95;
        } else if (stoneMass <= 0.044) {
            // Light wafer / thin shale direct drop: quick delicate high plop
            sink = this.pickSample('sinkLight', SINK_LIGHT_POOL) ?? this.pickSample('sinkPlop', SINK_PLOP_POOL);
            durationSec = 0.95;
        } else {
            // Standard-to-medium stones: rich 4-way randomized natural plop pool
            sink = this.pickSample('sinkPlop', SINK_PLOP_POOL);
            durationSec = 1.35;
        }

        const sinkCutoff = skips === 0 ? 15000 : 1400 + 2800 * intensity;
        const chain = this.createSpatialChain(point, camera, 0.90 * intensity * massGain, sinkCutoff);

        if (sink) {
            const src = ctx.createBufferSource();
            src.buffer = sink.buffer;
            // Subtle organic pitch jitter layered atop the naturally distinct recorded samples
            src.playbackRate.value = (0.95 + Math.random() * 0.10) * THREE.MathUtils.clamp(massPitch, 0.84, 1.14) * rateScale;
            const g = ctx.createGain();
            const attack = skips === 0 ? 0.004 : 0.024;
            g.gain.setValueAtTime(0.001, now);
            g.gain.linearRampToValueAtTime(0.96, now + attack);
            g.gain.exponentialRampToValueAtTime(0.001, now + durationSec / rateScale);
            src.connect(g);
            g.connect(chain.input);
            src.start(now, sink.onset);
        }

        // Subtle Minnaert cavity bubble undertone only on steep/direct plunges when no boulder sample already carries it
        if (skips <= 1 && intensity > 0.30 && (!sink || stoneMass < 0.135)) {
            const bubble = ctx.createOscillator();
            const bGain = ctx.createGain();
            const startF = (175 + Math.random() * 45) * massPitch * rateScale;
            bubble.type = 'sine';
            bubble.frequency.setValueAtTime(startF, now + 0.025 / rateScale);
            bubble.frequency.exponentialRampToValueAtTime(startF * 2.05, now + 0.11 / rateScale);
            const bAmp = (sink ? 0.09 : 0.36) * intensity;
            bGain.gain.setValueAtTime(0.0001, now);
            bGain.gain.linearRampToValueAtTime(bAmp, now + 0.032 / rateScale);
            bGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.15 / rateScale);
            bubble.connect(bGain);
            bGain.connect(chain.input);
            bubble.start(now);
            bubble.stop(now + 0.17 / rateScale);
        }
    }
}
