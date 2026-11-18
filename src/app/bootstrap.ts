import * as THREE from 'three';
import { updateTelemetry } from '../ui/telemetry';
import { type Launch } from '../simulation/physics';
import { Session } from './session';
import { CameraRig } from '../camera/rig';
import { mountCameraPanel } from '../ui/camera-panel';
import { ThrowGesture } from '../input/gesture';
import { parseSnapshot } from '../simulation/launch-randomness';
import { mountLaunchPanel } from '../ui/launch-panel';
import { createFeedback } from '../rendering/feedback';
import { createWorld } from '../rendering/world';
import { mountUI } from '../ui/panel';
import { bindGesture } from '../input/bind';
export function boot() {
    mountUI();
    const world = createWorld();
    const { scene, camera, renderer } = world;
    const feedback = createFeedback(world);
    const session = new Session();
    const rig = new CameraRig();
    mountCameraPanel(rig, session);
    const launch = mountLaunchPanel();
    const { parameters, fields, syncControls } = launch;
    const longLaunch={speed:24,elevation:2,tilt:10,spin:36.7,direction:0};
    const longButton=document.createElement('button');longButton.textContent='长投练习 · 无扰动';longButton.id='long-throw';
    document.querySelector('.actions')!.append(longButton);
    longButton.onclick=()=>{Object.assign(parameters,longLaunch);launch.temperature=0;syncControls();rig.view='course';document.querySelector<HTMLSelectElement>('#view')!.value='course';start();};
    const gesture = new ThrowGesture();
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", "湖面投掷区域");
    const mouseLabel=document.createElement('label');
    mouseLabel.style.cssText='display:block;margin:10px 0;font-size:12px;color:#315b62';
    mouseLabel.innerHTML='<input type="checkbox" id="mouse-water"> 鼠标拨水验证 · 拖动连续水面';
    document.querySelector('.actions')!.after(mouseLabel);
    const mouseMode=mouseLabel.querySelector<HTMLInputElement>('input')!;
    mouseMode.onchange=()=>{cancelGesture();session.replay();session.mouseMode=mouseMode.checked;session.mouse=undefined;session.waterGeneration++;session.waterTicks=[];document.querySelector<HTMLElement>('#gesture-hud')!.style.display=mouseMode.checked?'none':'';};
    const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    for(const kind of ['pointerdown','pointermove','pointerup','pointercancel'])canvas.addEventListener(kind,event=>{
        if(!mouseMode.checked)return;
        event.stopImmediatePropagation();
        const pointer=event as PointerEvent;
        if(kind==='pointerup'||kind==='pointercancel'){session.mouse=undefined;return;}
        if(kind==='pointermove'&&!pointer.buttons)return;
        const box=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((pointer.clientX-box.left)/box.width*2-1,1-(pointer.clientY-box.top)/box.height*2),camera);
        const point=ray.ray.intersectPlane(plane,new THREE.Vector3());
        if(point){session.mouse={x:point.x,z:point.z,y:0,radius:.22,depth:.075};session.paused=false;canvas.setPointerCapture(pointer.pointerId);}
    },true);
    const cancelGesture = bindGesture(canvas, gesture, parameters, syncControls, start);
    for(const input of Array.from(document.querySelectorAll<HTMLInputElement>('input')))if(/sheet|breakup/i.test(input.id)){input.disabled=true;input.title='连续水面基线暂不启用旧版空中水花模型';}
    function resizeView() {
        cancelGesture();
        const rect = canvas.getBoundingClientRect();
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        renderer.setSize(rect.width, rect.height, false);
    }
    window.addEventListener('resize', resizeView);
    resizeView();
    function start(replay = false, target: Launch = parameters) {
        cancelGesture();
        mouseMode.checked=false;
        document.querySelector<HTMLElement>('#gesture-hud')!.style.display='';
        session.mouseMode=false;
        session.mouse=undefined;
        review.side=false;
        session.diagnosticContact=undefined;
        if (replay) {
            if (!session.replay())
                return;
        }
        else {
            session.start(target, launch.temperature, launch.visual);
            document.querySelector<HTMLSelectElement>('#playback')!.value = 'normal';
        }
        const lastThrow = session.snapshot!;
        document.querySelector<HTMLTextAreaElement>('#snapshot')!.value = JSON.stringify(session.snapshot, null, 2);
        document.querySelector('#launch-summary')!.textContent = `本次 seed ${lastThrow.seed} · T=${lastThrow.temperature}\n目标 → 实际出手\n` + fields.map(([key, label, , , , unit]) => `${label} ${lastThrow.target[key].toFixed(3)} → ${lastThrow.sampled[key].toFixed(3)} ${unit}`).join('\n');
        feedback.reset();
        rig.beginThrow(session.sim.p,session.mode==='bullet',lastThrow.sampled.direction,camera.aspect);
        if(import.meta.env.DEV)review.frames=[];
        document.querySelector('#pause')!.textContent = '暂停';
    }
    document.querySelector<HTMLButtonElement>('#throw')!.onclick = () => start();
    document.querySelector<HTMLButtonElement>('#replay')!.onclick = () => start(true);
    document.querySelector<HTMLButtonElement>('#copy-snapshot')!.onclick = async () => { try {
        await navigator.clipboard.writeText(JSON.stringify(session.snapshot, null, 2));
        document.querySelector('#snapshot-message')!.textContent = '已复制';
    }
    catch {
        document.querySelector('#snapshot-message')!.textContent = '请在文本框中全选复制';
    } };
    document.querySelector<HTMLButtonElement>('#load-snapshot')!.onclick = () => { try {
        session.snapshot = parseSnapshot(document.querySelector<HTMLTextAreaElement>('#snapshot')!.value);
        start(true);
        document.querySelector('#snapshot-message')!.textContent = '已载入';
    }
    catch {
        document.querySelector('#snapshot-message')!.textContent = '无效或不匹配的快照';
    } };
    function toggle() {
        session.paused = !session.paused;
        document.querySelector('#pause')!.textContent = session.paused ? '继续' : '暂停';
    }
    document.querySelector<HTMLButtonElement>('#pause')!.onclick = toggle;
    document.querySelector<HTMLButtonElement>('#step')!.onclick = () => {
        session.paused = true;
        session.advance(1 / 120);
        document.querySelector('#pause')!.textContent = '继续';
    };
    window.addEventListener('keydown', event => {
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, summary')) return;
        if (event.code === 'Space') {
            event.preventDefault();
            toggle();
        }
        if (event.code === 'KeyR') start();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            session.paused = true;
            document.querySelector('#pause')!.textContent = '继续';
        }
    });
    const review={session,rig,world,feedback,side:false,inspect(time:number,single=true){session.diagnosticContact=single?0:undefined;session.replay();session.advance(time);session.paused=true;this.side=true;this.render();},sideCamera(){const contact=session.sim.contacts[0];if(!contact)return;const point=[contact.point.x,0,contact.point.z];camera.position.set(point[0]+.09,.115,point[2]+.48);camera.lookAt(point[0]+.09,.018,point[2]);camera.fov=38;camera.updateProjectionMatrix();},errors:[] as string[],frames:[] as {raf:number;cpu:number}[],variant(seed:number){if(!session.snapshot)return;const time=session.visualTime;session.replay({...session.snapshot,visual:{...(session.snapshot.visual??{surface:.35,sheet:.8,breakup:1.1}),seed}});session.advance(time);session.paused=true;document.querySelector<HTMLTextAreaElement>('#snapshot')!.value=JSON.stringify(session.snapshot,null,2);document.querySelector('#launch-summary')!.textContent=`physical seed ${session.snapshot!.seed} · T=${session.snapshot!.temperature} · visual ${seed} · ${session.effects.visual.surface}/${session.effects.visual.sheet}/${session.effects.visual.breakup}`;this.render();},programs(){const gl=renderer.getContext();return renderer.info.programs?.map(program=>({name:program.name,linked:gl.getProgramParameter(program.program,gl.LINK_STATUS)}));},render(){feedback.update(session,false);rig.update(camera,session.sim.p,session.presentationTime,session.mode==='bullet',1,true,session.sim.contacts);if(this.side)this.sideCamera();renderer.render(scene,camera);}};
    if(import.meta.env.DEV) {
        Object.assign(window,{waterReview:Object.assign(review,{surfaceOnly(enabled:boolean){world.waterField.mesh.material.uniforms.surfaceInspection.value=enabled?1:0;}})});
        renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{review.errors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].join('\n'));if(review.errors.length>32)review.errors.shift();};
    }
    // Reproducible reference views for visual review, available only in development.
    if(import.meta.env.DEV){
        const query=new URLSearchParams(location.search),time=Number(query.get('reference'));
        if(query.has('reference')&&Number.isFinite(time)&&time>=0&&time<=6){
            session.start(query.has('long')?longLaunch:parameters,0);session.replay({...session.snapshot!,seed:271});
            if(query.has('grouped')){const groups=[.003,.031,.007];let i=0;while(session.visualTime<time-1e-8){session.advance(Math.min(groups[i++%groups.length],time-session.visualTime));feedback.update(session,false);}}else session.advance(time);
            session.paused=true;review.side=true;
            world.spray.mesh.visible=query.get('spray')!=='off';
            if(query.get('sheet')==='off')world.spray.sheets.visible=false;
            review.sideCamera=()=>{const c=query.has('long')?session.sim.contacts.at(-1):session.sim.contacts[0];if(!c)return;camera.position.set(c.point.x+.3,.32,c.point.z+1.6);camera.lookAt(c.point.x+.3,.045,c.point.z);camera.fov=48;camera.updateProjectionMatrix();};
        }
    }
    if(import.meta.env.DEV&&new URLSearchParams(location.search).has('audit')){
        review.render();
        const g=world.waterField.solver.grid,data=world.waterField.solver.read(renderer);
        let peak=0,farPeak=0,finite=true,hash=2166136261;
        for(const byte of new Uint8Array(data.buffer))hash=Math.imul(hash^byte,16777619)>>>0;
        for(let i=0;i<data.length;i+=4){const h=data[i];finite=finite&&Number.isFinite(h);peak=Math.max(peak,Math.abs(h));if((i/4%g.width+.5)*g.dx>16)farPeak=Math.max(farPeak,Math.abs(h));}
        const node=document.createElement('script');node.type='application/json';node.id='water-audit';node.textContent=JSON.stringify({grid:g,hash,peak,farPeak,finite,glError:renderer.getContext().getError(),programs:review.programs(),errors:review.errors,skips:session.sim.skips,position:session.sim.p.toArray(),ribbons:session.spray.ribbons.length,drops:session.spray.drops.length});document.body.append(node);
    }
    let previous = performance.now();
    function frame(now: number) {
        const cpuStart=performance.now();
        requestAnimationFrame(frame);
        const raf=now-previous;
        const elapsed = Math.min(raf / 1000, .1);
        previous = now;
        session.tick(elapsed);
        const { sim, paused } = session;
        const preview = gesture.preview(now);
        if (preview) {
            document.querySelector<HTMLProgressElement>('#power')!.value = preview.power;
            document.querySelector('#aim')!.textContent = `${Math.round(preview.power * 100)}% · ${preview.target.speed.toFixed(1)} m/s · 方向 ${preview.target.direction.toFixed(0)}° · 仰角 ${preview.target.elevation.toFixed(0)}° · 石面 ${preview.target.tilt}°`;
            document.querySelector<HTMLElement>('#aim-arrow')!.style.transform = `rotate(${preview.target.direction}deg)`;
        }
        const visibleDrops = feedback.update(session, document.querySelector<HTMLInputElement>('#helpers')!.checked);
        rig.update(camera, sim.p, session.presentationTime, session.mode === 'bullet', elapsed, paused, sim.contacts);
        if(import.meta.env.DEV&&review.side)review.sideCamera();
        updateTelemetry(session, visibleDrops);
        renderer.render(scene, camera);
        if(import.meta.env.DEV){
            review.frames.push({raf,cpu:performance.now()-cpuStart});if(review.frames.length>600)review.frames.shift();
            if(new URLSearchParams(location.search).has('benchmark')&&session.sim.ended){
                let node=document.querySelector<HTMLScriptElement>('#water-performance');
                if(!node){node=document.createElement('script');node.type='application/json';node.id='water-performance';document.body.append(node);const values=review.frames.map(f=>f.raf).sort((a,b)=>a-b);node.textContent=JSON.stringify({frames:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)],max:values.at(-1),skips:session.sim.skips,distance:Math.hypot(session.sim.p.x,session.sim.p.z)});}
            }
        }
    }
    requestAnimationFrame(frame);
}
