import * as THREE from 'three';
import { WATER_DT, type WaterGrid, type WaterTick } from '../simulation/water-grid';

const lifetime = 1.8;
const capacity = Math.ceil(lifetime / WATER_DT) + 2;
interface Patch {
    x: number; z: number; dx: number; dz: number; birth: number;
    length: number; width: number; drift: number; scatteringArea: number;
}

/** Unresolved bubbles and rough water deposited along the actual wetted path.
 * The accumulated optical depth is sampled by the water material. */
export class SurfaceChurn {
    private patches: Patch[] = [];
    private tickTime = 0;
    private generation = -1;
    private wasVisible = false;
    private time = -1;
    private readonly positions = new Float32Array(capacity * 4);
    private readonly shapes = new Float32Array(capacity * 4);
    private readonly geometry = new THREE.InstancedBufferGeometry();
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.Camera();
    private readonly target: THREE.WebGLRenderTarget;

    constructor(grid: WaterGrid) {
        this.target = new THREE.WebGLRenderTarget(Math.min(2048, grid.width), Math.min(1024, grid.height), {
            format: THREE.RedFormat, type: THREE.HalfFloatType, depthBuffer: false,
            minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
        });
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 1,-1,0, -1,1,0, 1,1,0],3));
        this.geometry.setIndex([0,1,2,2,1,3]);
        this.geometry.setAttribute('path', new THREE.InstancedBufferAttribute(this.positions,4).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('shape', new THREE.InstancedBufferAttribute(this.shapes,4).setUsage(THREE.DynamicDrawUsage));
        const material = new THREE.ShaderMaterial({
            uniforms:{domain:{value:new THREE.Vector2(grid.sizeX,grid.sizeZ)}},
            depthTest:false, depthWrite:false, transparent:true, blending:THREE.AdditiveBlending,
            vertexShader:`
                uniform vec2 domain;
                attribute vec4 path,shape;
                varying vec2 offset;
                varying float depth;
                void main(){
                    offset=position.xy*2.8;
                    vec2 side=vec2(-path.w,path.z);
                    vec2 point=path.xy+path.zw*(shape.w+offset.x*shape.x)+side*offset.y*shape.y;
                    gl_Position=vec4(point/domain*2.-vec2(1.,0.),0.,1.);
                    depth=shape.z;
                }`,
            fragmentShader:`
                varying vec2 offset;
                varying float depth;
                void main(){
                    float r2=dot(offset,offset);
                    gl_FragColor=vec4(depth*exp(-.5*r2)*(1.-smoothstep(5.,8.,r2)),0.,0.,1.);
                }`
        });
        const mesh = new THREE.Mesh(this.geometry,material);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
    }
    get texture() { return this.target.texture; }

    private deposit(tick: WaterTick) {
        const m=tick.momentum;
        if (!m) return;
        const from=m.from??0, to=m.to??1, mid=(from+to)*.5;
        const depth=tick.old.y+(tick.next.y-tick.old.y)*mid;
        if (depth < -Math.max(tick.next.depth*2,.022)) return;
        const sx=tick.next.x-tick.old.x, sz=tick.next.z-tick.old.z, travel=Math.hypot(sx,sz);
        const impulse=Math.hypot(m.impulseX??0,m.impulseZ??0);
        const radius=Math.sqrt((m.wetArea??0)/Math.PI);
        const slipSpeed=travel/WATER_DT;
        const work=impulse*slipSpeed+Math.abs(m.impulseY)*Math.abs(tick.next.y-tick.old.y)/WATER_DT;
        if (work<1e-6) return;
        this.patches.push({
            x:m.x,z:m.z,dx:travel?sx/travel:1,dz:travel?sz/travel:0,
            birth:this.tickTime+mid*WATER_DT,width:Math.max(.016,radius),
            length:Math.max(.02,radius+.38*travel*(to-from)),
            drift:Math.min(1.4,slipSpeed*.08),
            // Effective scattering cross-section (m²) per joule of near-surface work.
            scatteringArea:.065*work/(1+work/.36)
        });
    }
    update(renderer: THREE.WebGLRenderer,ticks: WaterTick[],generation: number,time: number) {
        const reset=generation!==this.generation;
        if (reset) { this.patches=[]; this.tickTime=0; this.generation=generation; }
        if (!reset && !ticks.length && time===this.time) return;
        this.time=time;
        for (const tick of ticks) { this.deposit(tick); this.tickTime+=WATER_DT; }
        this.patches=this.patches.filter(p=>time-p.birth<lifetime);
        if (!reset && !this.patches.length && !this.wasVisible) return;
        for (let i=0;i<this.patches.length;i++) {
            const p=this.patches[i], age=Math.max(0,time-p.birth);
            const advance=p.drift*.19*(1-Math.exp(-age/.19));
            const length=Math.sqrt(p.length*p.length+.025*age)+.46*advance;
            const width=Math.sqrt(p.width*p.width+.013*age);
            const density=p.scatteringArea*Math.exp(-age/.52)/(2*Math.PI*length*width);
            this.positions.set([p.x,p.z,p.dx,p.dz],i*4);
            this.shapes.set([length,width,density,advance],i*4);
        }
        this.geometry.instanceCount=this.patches.length;
        this.geometry.attributes.path.needsUpdate=this.geometry.attributes.shape.needsUpdate=true;
        const target=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();
        const previous=renderer.getClearColor(new THREE.Color());
        renderer.setRenderTarget(this.target);
        renderer.setClearColor(0,0);
        renderer.render(this.scene,this.camera);
        renderer.setClearColor(previous,alpha);
        renderer.setRenderTarget(target);
        this.wasVisible=this.patches.length>0;
    }
}
