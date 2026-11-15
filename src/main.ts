import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Simulation, Clock, DEFAULT, type Launch } from './physics';
import './style.css';
import { ThrowGesture } from './gesture';
import { sampleThrow, replayLaunch, parseSnapshot, DEFAULT_TEMPERATURE, type ThrowSnapshot } from './launch-randomness';
import { ContactEffects, MAX_PARTICLES, particlePosition } from './effects';
import { createWater } from './water';
import { createSheets } from './sheets';
const sheetField=createSheets();
const waterField=createWater();
const effectState=new ContactEffects();
let visualTime=0,accumulator=0;
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header><span class="eyebrow">STONE / WATER LAB · 01</span><h1>掠水<span>一颗石子，一片水。</span></h1><p>不是预设的跳跃。让速度、姿态与水面决定下一刻。</p></header><aside><div class="stats"><div><strong id="skips">0</strong><small>成功弹跳</small></div><div><strong id="distance">0.0</strong><small>距离 / 米</small></div></div><div id="controls"></div><div class="actions"><button id="throw">投出石子 ↗</button><button id="pause">暂停</button><button id="replay">重放</button><button id="step">单步</button></div><label class="slow"><input id="slow" type="checkbox"> ¼ 速 · 观察接触</label><label class="slow"><input id="follow" type="checkbox" checked> 跟随近景</label><label class="slow"><input id="helpers" type="checkbox"> 轨迹 / 定位辅助</label><details><summary>接触诊断 / SI 单位</summary><pre id="diagnostics"></pre><div id="history"></div></details><p class="note">80 × 60 × 9 mm · 60 g<br>空格暂停 · R 重投 · 参数在下次投掷生效<br>跳数仅在完整触水后离水计入；最终沉水不计。</p><p id="asset">正在加载原始石头…</p></aside><footer><span id="status">准备投掷</span><span>固定步长 0.25 ms / 静水实验 / 无音效</span></footer>`;
const developer=document.createElement('details');developer.id='developer';developer.innerHTML='<summary>开发参数 / 重放 JSON / 诊断</summary>';
const panel=document.querySelector('aside')!;
for(const element of Array.from(panel.children))if(!element.matches('.stats,.actions'))developer.append(element);
panel.append(developer);
const posture=document.createElement('label');posture.className='slider posture';posture.innerHTML='<span>石面倾角 <output id="tilt-value">6°</output></span><input id="posture" aria-label="快捷石面倾角" type="range" min="0" max="50" step="1" value="6">';panel.insertBefore(posture,developer);
const hint=document.createElement('section');hint.id='gesture-hud';hint.innerHTML='<strong>在湖面按住，拖动，松手投掷</strong><p>横拖调方向 · 上拖抬高 / 下拖压低<br>按住 0.12–1.4 秒蓄力 · Esc 取消</p><progress id="power" max="1" value="0" aria-label="蓄力"></progress><output id="aim">准备：约按住 0.7 秒，轻拖后松手</output><span id="aim-arrow">↑</span>';app.append(hint);
const fields:[keyof Launch,string,number,number,number,string][]=[['direction','方向',-35,35,1,'°'],['speed','速度',2,20,.5,'m/s'],['elevation','出手仰角',-12,20,1,'°'],['tilt','石面倾角',0,50,1,'°'],['spin','自旋',0,30,1,'转/s']];
const parameters={...DEFAULT};
for(const [key,label,min,max,step,unit] of fields){const element=document.createElement('label');element.className='slider';element.innerHTML=`<span>${label}<output>${parameters[key]} ${unit}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${parameters[key]}" aria-label="${label}">`;element.querySelector('input')!.oninput=event=>{parameters[key]=+(event.target as HTMLInputElement).value;element.querySelector('output')!.value=`${parameters[key]} ${unit}`;};document.querySelector('#controls')!.append(element);}
function syncControls(){
 fields.forEach(([key,,,,,unit],index)=>{const label=document.querySelectorAll<HTMLLabelElement>('#controls > .slider')[index];label.querySelector('input')!.value=String(parameters[key]);label.querySelector('output')!.value=`${parameters[key]} ${unit}`;});
 document.querySelector<HTMLInputElement>('#posture')!.value=String(parameters.tilt);document.querySelector('#tilt-value')!.textContent=`${parameters.tilt}°`;
}
document.querySelector<HTMLInputElement>('#posture')!.oninput=event=>{parameters.tilt=+(event.target as HTMLInputElement).value;syncControls();};
document.querySelector('#controls')!.addEventListener('input',syncControls);
let temperature=DEFAULT_TEMPERATURE;
const variation=document.createElement('div');
variation.innerHTML=`<label class="slider"><span>投掷扰动温度 / 随机强度 <output id="temperature-value">1</output></span><input id="temperature" aria-label="投掷扰动温度" type="range" min="0" max="2" step="0.1" value="1"></label><p class="note">0 实验（无扰动） · 1 自然微扰；只扰动出手，不模拟风浪。上方滑块为目标值。</p><pre id="launch-summary">尚未投掷</pre><details><summary>完整投掷快照 / JSON</summary><textarea id="snapshot" aria-label="投掷快照 JSON" rows="8" style="width:100%;box-sizing:border-box"></textarea><button id="copy-snapshot">复制快照</button><button id="load-snapshot">载入并重放</button><span id="snapshot-message"></span></details>`;
document.querySelector('#controls')!.append(variation);
document.querySelector<HTMLInputElement>('#temperature')!.oninput=event=>{temperature=+(event.target as HTMLInputElement).value;document.querySelector('#temperature-value')!.textContent=String(temperature);};
const scene=new THREE.Scene();scene.background=new THREE.Color('#bed7da');scene.fog=new THREE.Fog('#bed7da',35,115);
const camera=new THREE.PerspectiveCamera(48,1,.01,180);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight,false);renderer.setClearColor('#bed7da');renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.prepend(renderer.domElement);
const gesture=new ThrowGesture();
const canvas=renderer.domElement;canvas.setAttribute('aria-label','湖面投掷区域');
function cancelGesture(){
 const pointerId=gesture.pointerId;gesture.cancel();
 if(pointerId!==undefined&&canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);
 document.querySelector<HTMLProgressElement>('#power')!.value=0;
 document.querySelector('#aim')!.textContent='准备：约按住 0.7 秒，轻拖后松手';
 document.querySelector<HTMLElement>('#aim-arrow')!.style.transform='rotate(0deg)';
}
function pointerInput(event:PointerEvent){return {pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,timeStamp:event.timeStamp>0?event.timeStamp:performance.now()};}
canvas.addEventListener('pointerdown',event=>{
 if(gesture.pointerId!==undefined){if(event.pointerId!==gesture.pointerId)cancelGesture();return;}
 if(!event.isPrimary||event.button!==0)return;
 if(gesture.begin(pointerInput(event),canvas.getBoundingClientRect(),parameters)){canvas.setPointerCapture(event.pointerId);event.preventDefault();}
});
canvas.addEventListener('pointermove',event=>gesture.move(pointerInput(event)));
canvas.addEventListener('pointerup',event=>{
 const active=gesture.pointerId===event.pointerId;const target=gesture.release(pointerInput(event));
 if(active)cancelGesture();
 if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
 if(target){Object.assign(parameters,target);syncControls();start(false,target);}
});
canvas.addEventListener('pointercancel',cancelGesture);
canvas.addEventListener('lostpointercapture',event=>{if(gesture.pointerId===event.pointerId)cancelGesture();});
document.addEventListener('pointerdown',event=>{if(gesture.pointerId!==undefined&&event.pointerId!==gesture.pointerId)cancelGesture();},true);
window.addEventListener('blur',cancelGesture);
window.addEventListener('keydown',event=>{if(event.code==='Escape')cancelGesture();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelGesture();});
function resizeView(){
 cancelGesture();const rect=canvas.getBoundingClientRect();camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false);
}
window.addEventListener('resize',resizeView);resizeView();
scene.add(new THREE.HemisphereLight(0xe6f6ff,0x274943,2.6));const sun=new THREE.DirectionalLight(0xffeed6,3);sun.position.set(-4,10,5);scene.add(sun);
scene.add(waterField.mesh,sheetField.mesh);
const stone=new THREE.Group();scene.add(stone);
const fallback=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshStandardMaterial({color:0x565957,roughness:.8}));fallback.scale.set(.04,.0045,.03);stone.add(fallback);
new GLTFLoader().load('/assets/stone.glb',gltf=>{stone.remove(fallback);fallback.geometry.dispose();(fallback.material as THREE.Material).dispose();stone.add(gltf.scene);document.querySelector('#asset')!.textContent='✓ Blender 原始 GLB · 真实米制尺寸';},undefined,()=>{document.querySelector('#asset')!.textContent='模型加载失败，使用同尺寸椭球';});
const halo=new THREE.Mesh(new THREE.RingGeometry(.065,.075,40),new THREE.MeshBasicMaterial({color:0xffe3a1,side:THREE.DoubleSide,transparent:true,opacity:.7}));halo.rotation.x=-Math.PI/2;scene.add(halo);
const trailGeometry=new THREE.BufferGeometry();const trail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0xffe3a1,transparent:true,opacity:.7}));scene.add(trail);
const dropGeometry=new THREE.SphereGeometry(1,5,4);
const drops=new THREE.InstancedMesh(dropGeometry,new THREE.MeshPhysicalMaterial({color:0xd1edef,roughness:.18,metalness:.1,transparent:true,opacity:.78}),MAX_PARTICLES);
drops.frustumCulled=false;drops.count=0;scene.add(drops);
let sim=new Simulation(),clock=new Clock(sim),paused=true;
let lastThrow:ThrowSnapshot|undefined;
let trailPoints:THREE.Vector3[]=[];let lastTrail=0;
function advance(seconds:number){
 accumulator+=seconds;
 while(accumulator+1e-12>=sim.dt){
  if(!sim.ended){clock.advance(sim.dt);visualTime=sim.time;}else visualTime+=sim.dt;
  effectState.update(sim.contacts,visualTime);accumulator-=sim.dt;
 }
}
function start(replay=false,target:Launch=parameters){
 cancelGesture();
 if(!replay){const seed=crypto.getRandomValues(new Uint32Array(1))[0];lastThrow=sampleThrow(target,temperature,seed);}
 if(!lastThrow)return;
 document.querySelector<HTMLTextAreaElement>('#snapshot')!.value=JSON.stringify(lastThrow,null,2);
 document.querySelector('#launch-summary')!.textContent=`本次 seed ${lastThrow.seed} · T=${lastThrow.temperature}\n目标 → 实际出手\n`+fields.map(([key,label,,,,unit])=>`${label} ${lastThrow!.target[key].toFixed(3)} → ${lastThrow!.sampled[key].toFixed(3)} ${unit}`).join('\n');
 sim=new Simulation(replayLaunch(lastThrow));clock=new Clock(sim);paused=false;lastTrail=0;trailPoints=[];trailGeometry.setFromPoints([]);effectState.clear();drops.count=0;visualTime=0;accumulator=0;document.querySelector('#pause')!.textContent='暂停';}
document.querySelector<HTMLButtonElement>('#throw')!.onclick=()=>start();document.querySelector<HTMLButtonElement>('#replay')!.onclick=()=>start(true);
document.querySelector<HTMLButtonElement>('#copy-snapshot')!.onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(lastThrow,null,2));document.querySelector('#snapshot-message')!.textContent='已复制';}catch{document.querySelector('#snapshot-message')!.textContent='请在文本框中全选复制';}};
document.querySelector<HTMLButtonElement>('#load-snapshot')!.onclick=()=>{try{lastThrow=parseSnapshot(document.querySelector<HTMLTextAreaElement>('#snapshot')!.value);start(true);document.querySelector('#snapshot-message')!.textContent='已载入';}catch{document.querySelector('#snapshot-message')!.textContent='无效或不匹配的快照';}};
function toggle(){paused=!paused;document.querySelector('#pause')!.textContent=paused?'继续':'暂停';}
document.querySelector<HTMLButtonElement>('#pause')!.onclick=toggle;
document.querySelector<HTMLButtonElement>('#step')!.onclick=()=>{paused=true;advance(1/120);document.querySelector('#pause')!.textContent='继续';};
window.addEventListener('keydown',event=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;if(event.code==='Space'){event.preventDefault();toggle();}if(event.code==='KeyR')start();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;document.querySelector('#pause')!.textContent='继续';}});

const dummy=new THREE.Object3D();let previous=performance.now();
function frame(now:number){requestAnimationFrame(frame);const elapsed=Math.min((now-previous)/1000,.1);previous=now;if(!paused)advance(elapsed*(document.querySelector<HTMLInputElement>('#slow')!.checked?.25:1));
 const preview=gesture.preview(now);
 if(preview){document.querySelector<HTMLProgressElement>('#power')!.value=preview.power;document.querySelector('#aim')!.textContent=`${Math.round(preview.power*100)}% · ${preview.target.speed.toFixed(1)} m/s · 方向 ${preview.target.direction.toFixed(0)}° · 仰角 ${preview.target.elevation.toFixed(0)}° · 石面 ${preview.target.tilt}°`;document.querySelector<HTMLElement>('#aim-arrow')!.style.transform=`rotate(${preview.target.direction}deg)`;}
 waterField.update(sim.contacts,visualTime);
 sheetField.update(effectState.sheets,visualTime);
 stone.position.copy(sim.p);stone.quaternion.copy(sim.q);halo.position.set(sim.p.x,.006,sim.p.z);halo.visible=sim.p.y>-.04&&document.querySelector<HTMLInputElement>('#helpers')!.checked;trail.visible=halo.visible;
 if(sim.time-lastTrail>.012){trailPoints.push(sim.p.clone());lastTrail=sim.time;trailGeometry.setFromPoints(trailPoints);}
 let visibleDrops=0;
 for(const particle of effectState.particles){
  const age=visualTime-particle.birth;const position=particlePosition(particle,visualTime);
  if(age<0||age>particle.life||position[1]<0)continue;
  dummy.position.set(...position);dummy.scale.set(particle.size,particle.size*(1.4+Math.max(0,particle.velocity[1]-9.81*age)),particle.size);dummy.updateMatrix();drops.setMatrixAt(visibleDrops++,dummy.matrix);
 }
 drops.count=visibleDrops;drops.instanceMatrix.needsUpdate=true;
 const follow=document.querySelector<HTMLInputElement>('#follow')!.checked;
 const target=follow?new THREE.Vector3(sim.p.x+.3,Math.max(.03,sim.p.y),sim.p.z):new THREE.Vector3(9,0,0);
 camera.position.copy(target).add(follow?new THREE.Vector3(-1.7,1.05,2.3):new THREE.Vector3(-13,9,17));camera.lookAt(target.clone().add(new THREE.Vector3(follow?.65:0,0,-.35)));
 document.querySelector('#skips')!.textContent=String(sim.skips);document.querySelector('#distance')!.textContent=Math.hypot(sim.p.x,sim.p.z).toFixed(1);
 document.querySelector('#status')!.textContent=`${paused?'已暂停 · ':''}${sim.reason} / ${sim.time.toFixed(2)} s`;
 document.querySelector('#diagnostics')!.textContent=`速度  ${sim.v.length().toFixed(2)} m/s\n高度  ${sim.p.y.toFixed(3)} m\n湿面积 ${(sim.area*1e4).toFixed(2)} cm²\n水动力 ${sim.force.length().toFixed(2)} N\n总能量 ${sim.energy().toFixed(3)} J\n自旋  ${(sim.omega.length()/Math.PI/2).toFixed(1)} 转/s\n效果时钟 ${visualTime.toFixed(3)} s\n可见水滴 ${visibleDrops}`;
 document.querySelector('#history')!.innerHTML=sim.contacts.map(c=>`<div class="contact">#${c.id+1} ${c.bounced?'↗ 离水':c.end?'— 结束':'≈ 入水'} · ${(c.impulse).toFixed(3)} N·s · ${((c.end??sim.time)-c.time).toFixed(3)} s</div>`).join('');renderer.render(scene,camera);
}
requestAnimationFrame(frame);
