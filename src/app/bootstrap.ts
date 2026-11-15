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
    const gesture = new ThrowGesture();
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", "湖面投掷区域");
    const cancelGesture = bindGesture(canvas, gesture, parameters, syncControls, start);
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
        if (replay) {
            if (!session.replay())
                return;
        }
        else {
            session.start(target, launch.temperature);
            document.querySelector<HTMLSelectElement>('#playback')!.value = 'normal';
        }
        const lastThrow = session.snapshot!;
        document.querySelector<HTMLTextAreaElement>('#snapshot')!.value = JSON.stringify(session.snapshot, null, 2);
        document.querySelector('#launch-summary')!.textContent = `本次 seed ${lastThrow.seed} · T=${lastThrow.temperature}\n目标 → 实际出手\n` + fields.map(([key, label, , , , unit]) => `${label} ${lastThrow.target[key].toFixed(3)} → ${lastThrow.sampled[key].toFixed(3)} ${unit}`).join('\n');
        feedback.reset();
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
    const review={session,rig,world,feedback,errors:[] as string[],frames:[] as {raf:number;cpu:number}[],render(){feedback.update(session,false);rig.update(camera,session.sim.p,session.presentationTime,session.mode==='bullet',1,true);renderer.render(scene,camera);}};
    if(import.meta.env.DEV) {
        Object.assign(window,{waterReview:review});
        renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{review.errors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].join('\n'));if(review.errors.length>32)review.errors.shift();};
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
        rig.update(camera, sim.p, session.presentationTime, session.mode === 'bullet', elapsed, paused);
        updateTelemetry(session, visibleDrops);
        renderer.render(scene, camera);
        if(import.meta.env.DEV){review.frames.push({raf,cpu:performance.now()-cpuStart});if(review.frames.length>600)review.frames.shift();}
    }
    requestAnimationFrame(frame);
}
