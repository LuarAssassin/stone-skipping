import { Vector3 } from 'three';
import { ContactSpray } from '../simulation/spray';
import { Clock, DEFAULT, Simulation, type Launch } from '../simulation/physics';
import { replayLaunch, sampleThrow, type ThrowSnapshot } from '../simulation/launch-randomness';
import { VISUAL_DEFAULTS, visualHash, validateVisual, type VisualSettings } from '../simulation/visual-variation';
import { COURSE_GRID, dryFootprint, type Footprint, type WaterTick } from '../simulation/water-grid';
import { STANDARD_STONE, type StoneSpec } from '../simulation/stones';
export type ReplayMode = 'normal' | 'slow' | 'bullet';
export const PLAYBACK_RATE: Record<ReplayMode, number> = { normal: 1, slow: 0.25, bullet: 0.05 };
export function presentationTick(time: number, seconds: number, paused: boolean): number {
    return paused ? time : time + Math.max(0, seconds);
}
export class Session {
    waterTicks: WaterTick[] = [];
    waterGeneration = 0;
    mouse?: Footprint;
    mouseMode = false;
    private previousSource = dryFootprint();
    private waterTime = 0;
    private measuredImpulse = new Vector3();
    private totalImpulse = new Vector3();
    private pendingSlip = new Vector3();
    private pendingImpulseY = 0;
    private pendingWeight = 0;
    private pendingX = 0;
    private pendingZ = 0;
    private pendingArea = 0;
    private pendingFirst = Infinity;
    private pendingLast = 0;
    sim = new Simulation();
    private clock = new Clock(this.sim);
    private accumulator = 0;
    private throwIndex = 0;
    spray = new ContactSpray();
    diagnosticContact?: number;
    snapshot?: ThrowSnapshot;
    paused = true;
    mode: ReplayMode = 'normal';
    visualTime = 0;
    presentationTime = 0;
    constructor(private seed = () => crypto.getRandomValues(new Uint32Array(1))[0]) { }
    start(target: Launch, temperature = 1, visual: Omit<VisualSettings, 'seed'> = VISUAL_DEFAULTS, stone?: StoneSpec) {
        this.snapshot = sampleThrow(target, temperature, this.seed(), stone);
        this.snapshot.visual = validateVisual({ seed: Math.floor(visualHash(this.snapshot.seed, this.throwIndex++, 400) * 4294967296), ...visual });
        this.mode = 'normal';
        this.replay();
    }
    replay(snapshot = this.snapshot) {
        if (!snapshot)
            return false;
        this.snapshot = structuredClone(snapshot);
        const stone = this.snapshot.stone ?? STANDARD_STONE;
        this.sim = new Simulation(replayLaunch(this.snapshot), undefined, true, true, 4, stone);
        this.clock = new Clock(this.sim);
        this.spray.reset();
        this.waterTicks = [];
        this.waterGeneration++;
        this.waterTime = 0;
        this.measuredImpulse.set(0, 0, 0);
        this.pendingSlip.set(0, 0, 0);
        this.pendingImpulseY = this.pendingWeight = this.pendingX = this.pendingZ = this.pendingArea = this.pendingLast = 0;
        this.pendingFirst = Infinity;
        this.previousSource = dryFootprint();
        this.accumulator = 0;
        this.visualTime = 0;
        this.presentationTime = 0;
        this.paused = false;
        return true;
    }
    resetToReady(launch: Launch = DEFAULT, stone: StoneSpec = STANDARD_STONE) {
        this.sim = new Simulation(launch, undefined, true, true, 4, stone);
        this.clock = new Clock(this.sim);
        this.spray.reset();
        this.waterTicks = [];
        this.waterGeneration++;
        this.waterTime = 0;
        this.measuredImpulse.set(0, 0, 0);
        this.pendingSlip.set(0, 0, 0);
        this.pendingImpulseY = this.pendingWeight = this.pendingX = this.pendingZ = this.pendingArea = this.pendingLast = 0;
        this.pendingFirst = Infinity;
        this.previousSource = dryFootprint();
        this.accumulator = 0;
        this.visualTime = 0;
        this.presentationTime = 0;
        this.mode = 'normal';
        this.paused = true;
    }
    tick(seconds: number) {
        this.presentationTime = presentationTick(this.presentationTime, seconds, this.paused);
        if (!this.paused)
            this.advance(seconds * PLAYBACK_RATE[this.mode]);
    }
    advance(seconds: number) {
        this.accumulator += seconds;
        while (this.accumulator + 1e-12 >= this.sim.dt) {
            if (!this.sim.ended && !this.mouseMode) {
                this.clock.advance(this.sim.dt);
                this.spray.sample(this.sim, this.snapshot?.seed ?? 0);
                if (this.sim.p.x < -.4 || this.sim.p.x > COURSE_GRID.sizeX || Math.abs(this.sim.p.z) > COURSE_GRID.sizeZ / 2) this.sim.finish('离开水域');
                this.totalImpulse.set(0, 0, 0);
                for (const contact of this.sim.contacts) if (contact.netImpulse) this.totalImpulse.add(contact.netImpulse);
                const reaction = this.measuredImpulse.y - this.totalImpulse.y;
                this.pendingSlip.x += this.measuredImpulse.x - this.totalImpulse.x;
                this.pendingSlip.z += this.measuredImpulse.z - this.totalImpulse.z;
                this.measuredImpulse.copy(this.totalImpulse);
                const point = this.sim.contacts.at(-1)?.centroid ?? this.sim.p;
                this.pendingImpulseY += reaction;
                this.pendingWeight += Math.abs(reaction);
                this.pendingX += point.x * Math.abs(reaction);
                this.pendingZ += point.z * Math.abs(reaction);
                this.pendingArea += Math.max(0, this.sim.area) * Math.abs(reaction);
                if (Math.abs(reaction) > 0) { this.pendingFirst = Math.min(this.pendingFirst, this.visualTime); this.pendingLast = this.visualTime + this.sim.dt; }
            }
            this.visualTime += this.sim.dt;
            if (this.visualTime + 1e-10 >= this.waterTime + 1 / 120) {
                const { a, b, h } = this.sim.stone;
                const axes = [new Vector3(a, 0, 0), new Vector3(0, h, 0), new Vector3(0, 0, b)].map(axis => axis.applyQuaternion(this.sim.q));
                const xx = axes.reduce((sum, axis) => sum + axis.x ** 2, 0), zz = axes.reduce((sum, axis) => sum + axis.z ** 2, 0), xz = axes.reduce((sum, axis) => sum + axis.x * axis.z, 0);
                const spread = Math.hypot(xx - zz, 2 * xz), major = Math.sqrt((xx + zz + spread) / 2), minor = Math.sqrt(Math.max(1e-8, (xx + zz - spread) / 2));
                const source = this.mouseMode ? (this.mouse ?? dryFootprint()) : { x: this.sim.p.x, z: this.sim.p.z, y: this.sim.p.y, radius: major, aspect: minor / major, angle: .5 * Math.atan2(2 * xz, xx - zz), depth: Math.abs(axes[1].y) + Math.hypot(axes[0].y, axes[2].y) };
                const momentum = !this.mouseMode && this.pendingWeight > 0 ? { x: this.pendingX / this.pendingWeight, z: this.pendingZ / this.pendingWeight, impulseY: this.pendingImpulseY, impulseX: this.pendingSlip.x, impulseZ: this.pendingSlip.z, wetArea: this.pendingArea / this.pendingWeight, from: Math.max(0, (this.pendingFirst - this.waterTime) * 120), to: Math.min(1, (this.pendingLast - this.waterTime) * 120) } : undefined;
                const impacts = this.spray.advance(this.visualTime, this.waterTime);
                this.waterTicks.push({ ...(impacts.length ? { impacts } : {}), old: { ...this.previousSource }, next: { ...source }, ...(momentum ? { momentum } : {}) });
                this.pendingImpulseY = this.pendingWeight = this.pendingX = this.pendingZ = this.pendingArea = this.pendingLast = 0;
                this.pendingSlip.set(0, 0, 0);
                this.pendingFirst = Infinity;
                this.previousSource = { ...source };
                this.waterTime += 1 / 120;
            }
            this.accumulator -= this.sim.dt;
        }
    }
}
