import { Vector3 } from 'three';
import { Clock, Simulation, type Launch } from '../simulation/physics';
import { ContactEffects } from '../rendering/effects';
import { replayLaunch, sampleThrow, type ThrowSnapshot } from '../simulation/launch-randomness';
import { VISUAL_DEFAULTS, visualHash, validateVisual, type VisualSettings } from '../simulation/visual-variation';
import { dryFootprint, type Footprint, type WaterTick } from '../rendering/coherent';
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
    private measuredImpulseY = 0;
    private pendingImpulseY = 0;
    private pendingWeight = 0;
    private pendingX = 0;
    private pendingZ = 0;
    sim = new Simulation();
    private clock = new Clock(this.sim);
    private accumulator = 0;
    private throwIndex = 0;
    effects = new ContactEffects();
    diagnosticContact?: number;
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
        this.waterTicks = [];
        this.waterGeneration++;
        this.waterTime = 0;
        this.measuredImpulseY = this.pendingImpulseY = this.pendingWeight = this.pendingX = this.pendingZ = 0;
        this.previousSource = dryFootprint();
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
            if (!this.sim.ended && !this.mouseMode) {
                this.clock.advance(this.sim.dt);
                const total=this.sim.contacts.reduce((sum,contact)=>sum+(contact.netImpulse?.y??0),0);
                const reaction=-(total-this.measuredImpulseY);
                this.measuredImpulseY=total;
                const point=this.sim.contacts.at(-1)?.centroid??this.sim.p;
                this.pendingImpulseY+=reaction;
                this.pendingWeight+=Math.abs(reaction);
                this.pendingX+=point.x*Math.abs(reaction);
                this.pendingZ+=point.z*Math.abs(reaction);
            }
            this.visualTime += this.sim.dt;
            if(this.visualTime+1e-10 >= this.waterTime+1/120){
            const axes=[new Vector3(.04,0,0),new Vector3(0,.0045,0),new Vector3(0,0,.03)].map(axis=>axis.applyQuaternion(this.sim.q));
            const xx=axes.reduce((sum,axis)=>sum+axis.x**2,0),zz=axes.reduce((sum,axis)=>sum+axis.z**2,0),xz=axes.reduce((sum,axis)=>sum+axis.x*axis.z,0);
            const spread=Math.hypot(xx-zz,2*xz),major=Math.sqrt((xx+zz+spread)/2),minor=Math.sqrt(Math.max(1e-8,(xx+zz-spread)/2));
            const source = this.mouseMode ? (this.mouse ?? dryFootprint()) : {x:this.sim.p.x,z:this.sim.p.z,y:this.sim.p.y,radius:major,aspect:minor/major,angle:.5*Math.atan2(2*xz,xx-zz),depth:Math.abs(axes[1].y)+Math.hypot(axes[0].y,axes[2].y)};
                const momentum=!this.mouseMode&&this.pendingWeight>0?{x:this.pendingX/this.pendingWeight,z:this.pendingZ/this.pendingWeight,impulseY:this.pendingImpulseY}:undefined;
                this.waterTicks.push({old:{...this.previousSource},next:{...source},...(momentum?{momentum}:{})});
                this.pendingImpulseY=this.pendingWeight=this.pendingX=this.pendingZ=0;
                this.previousSource = {...source};
                this.waterTime += 1/120;
            }
            this.accumulator -= this.sim.dt;
        }
    }
}
