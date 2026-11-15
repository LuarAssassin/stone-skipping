import { Clock, Simulation, type Launch } from '../simulation/physics';
import { ContactEffects } from '../rendering/effects';
import { replayLaunch, sampleThrow, type ThrowSnapshot } from '../simulation/launch-randomness';
import { VISUAL_DEFAULTS, visualHash, validateVisual, type VisualSettings } from '../simulation/visual-variation';
export type ReplayMode = 'normal' | 'slow' | 'bullet';
export const PLAYBACK_RATE: Record<ReplayMode, number> = { normal: 1, slow: 0.25, bullet: 0.05 };
export function presentationTick(time: number, seconds: number, paused: boolean): number {
    return paused ? time : time + Math.max(0, seconds);
}
export class Session {
    sim = new Simulation();
    private clock = new Clock(this.sim);
    private accumulator = 0;
    private throwIndex = 0;
    effects = new ContactEffects();
    snapshot?: ThrowSnapshot;
    paused = true;
    mode: ReplayMode = 'normal';
    visualTime = 0;
    presentationTime = 0;
    constructor(private seed = () => crypto.getRandomValues(new Uint32Array(1))[0]) { }
    start(target: Launch, temperature = 1, visual:Omit<VisualSettings,'seed'> = VISUAL_DEFAULTS) {
        this.snapshot = sampleThrow(target, temperature, this.seed());
        this.snapshot.visual=validateVisual({seed:Math.floor(visualHash(this.snapshot.seed,this.throwIndex++,400)*4294967296),...visual});
        this.mode = 'normal';
        this.replay();
    }
    replay(snapshot = this.snapshot) {
        if (!snapshot)
            return false;
        this.snapshot = structuredClone(snapshot);
        this.sim = new Simulation(replayLaunch(this.snapshot));
        this.clock = new Clock(this.sim);
        this.effects.clear();
        this.effects.visual=validateVisual(this.snapshot.visual??{seed:this.snapshot.seed,...VISUAL_DEFAULTS});
        this.accumulator = 0;
        this.visualTime = 0;
        this.presentationTime = 0;
        this.paused = false;
        return true;
    }
    tick(seconds: number) {
        this.presentationTime = presentationTick(this.presentationTime, seconds, this.paused);
        if (!this.paused)
            this.advance(seconds * PLAYBACK_RATE[this.mode]);
    }
    advance(seconds: number) {
        this.accumulator += seconds;
        while (this.accumulator + 1e-12 >= this.sim.dt) {
            if (!this.sim.ended) {
                this.clock.advance(this.sim.dt);
                this.visualTime = this.sim.time;
            }
            else
                this.visualTime += this.sim.dt;
            this.effects.update(this.sim.contacts, this.visualTime, this.sim.active?{id:this.sim.active.id,area:this.sim.area,velocity:this.sim.v}:undefined);
            this.accumulator -= this.sim.dt;
        }
    }
}
