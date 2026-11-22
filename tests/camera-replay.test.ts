import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { CameraRig, cameraPose, blendPose, DEFAULT_VIEW } from '../src/camera/rig';
import { Session, PLAYBACK_RATE, presentationTick, type ReplayMode } from '../src/app/session';
import { DEFAULT } from '../src/simulation/physics';
const origin = new Vector3();
test('默认全景在出手点后方抬高，固定构图不随石子移动', () => {
    const first = cameraPose('overview', DEFAULT_VIEW, origin);
    assert.ok(first.position.x < 0 && first.position.y > 2 && first.target.x > 0);
    assert.deepEqual(first, cameraPose('overview', DEFAULT_VIEW, new Vector3(20, 1, 2)));
    for (const aspect of [980 / 688, 390 / 524]) {
        const camera = new PerspectiveCamera(first.fov, aspect, 0.01, 180);
        camera.position.copy(first.position);
        camera.lookAt(first.target);
        camera.updateMatrixWorld();
        for (const distance of [0, 9, 20]) {
            const screen = new Vector3(distance, 0, 0).project(camera);
            assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1 && screen.z < 1);
        }
    }
});
test('五个全景参数生效且重置不改变用户选择', () => {
    const base = cameraPose('overview', DEFAULT_VIEW, origin);
    for (const key of ['height', 'distance', 'azimuth', 'target', 'fov'] as const) {
        assert.notDeepEqual(cameraPose('overview', { ...DEFAULT_VIEW, [key]: DEFAULT_VIEW[key] + 2 }, origin), base);
    }
    const rig = new CameraRig();
    rig.view = 'follow';
    rig.settings.height = 19;
    rig.reset();
    assert.deepEqual(rig.settings, DEFAULT_VIEW);
    assert.equal(rig.view, 'follow');
});
test('近景跟随平移与石子一致，子弹机位随独立时间环绕且始终在水面上', () => {
    const stone = new Vector3(4, 0.1, 2);
    const first = cameraPose('follow', DEFAULT_VIEW, stone);
    const next = cameraPose('follow', DEFAULT_VIEW, stone.clone().add(new Vector3(2, 0, 3)));
    assert.ok(next.position.clone().sub(first.position).distanceTo(new Vector3(2, 0, 3)) < 1e-12);
    const bullet = cameraPose('overview', DEFAULT_VIEW, stone, 0);
    assert.notDeepEqual(cameraPose('overview', DEFAULT_VIEW, stone, 2), bullet);
    for (let seconds = 0; seconds < 30; seconds += 0.1) {
        const pose = cameraPose('follow', DEFAULT_VIEW, new Vector3(4, -1, 2), seconds);
        assert.ok(pose.position.y >= 0.16);
        assert.ok(Math.hypot(pose.position.x - 4, pose.position.z - 2) >= 0.75 - 1e-10);
    }
});
test('镜头过渡连续，暂停冻结子弹轨道，退出恢复用户跟随', () => {
    const rig = new CameraRig();
    const camera = new PerspectiveCamera();
    rig.view = 'follow';
    rig.update(camera, origin, 1, true, 0.1, false);
    const moving = camera.position.clone();
    rig.update(camera, origin, 1, true, 0.1, true);
    assert.deepEqual(camera.position, moving);
    rig.update(camera, origin, 2, true, 0.1, false);
    assert.notDeepEqual(camera.position, moving);
    for (let index = 0; index < 200; index++)
        rig.update(camera, origin, 2, false, 0.05, false);
    assert.ok(camera.position.distanceTo(cameraPose('follow', DEFAULT_VIEW, origin).position) < 1e-8);
    assert.equal(rig.view, 'follow');
    const from = cameraPose('overview', DEFAULT_VIEW, origin);
    const to = cameraPose('follow', DEFAULT_VIEW, origin);
    const blended = blendPose(from, to, 0.016);
    assert.ok(blended.position.distanceTo(from.position) > 0);
    assert.ok(blended.position.distanceTo(from.position) < to.position.distanceTo(from.position));
});
test('独立presentation clock不受慢放倍率影响且暂停严格冻结', () => {
    assert.equal(presentationTick(2, 0.5, true), 2);
    assert.equal(presentationTick(2, 0.5, false), 2.5);
    for (const mode of Object.keys(PLAYBACK_RATE) as ReplayMode[]) {
        const session = new Session(() => 42);
        session.start(DEFAULT);
        session.mode = mode;
        session.tick(0.1);
        assert.ok(Math.abs(session.presentationTime - 0.1) < 1e-12);
        assert.ok(Math.abs(session.sim.time - 0.1 * PLAYBACK_RATE[mode]) < 1e-8);
        session.paused = true;
        session.tick(2);
        assert.ok(Math.abs(session.presentationTime - 0.1) < 1e-12);
    }
});
test('新投掷恢复正常1x与默认T1，重放不抽seed且快照隔离', () => {
    let seeds = 0;
    const session = new Session(() => ++seeds);
    assert.equal(session.replay(), false);
    session.mode = 'bullet';
    session.start(DEFAULT);
    assert.equal(session.mode, 'normal');
    assert.equal(session.snapshot!.temperature, 1);
    const snapshot = structuredClone(session.snapshot!);
    session.mode = 'bullet';
    session.tick(0.2);
    session.replay();
    assert.equal(seeds, 1);
    assert.deepEqual(session.snapshot, snapshot);
    assert.equal(session.presentationTime, 0);
    assert.equal(session.visualTime, 0);
    assert.equal(session.spray.drops.length, 0);
    const external = structuredClone(snapshot);
    session.replay(external);
    external.target.speed = 2;
    assert.deepEqual(session.snapshot, snapshot);
    session.start(DEFAULT);
    assert.equal(seeds, 2);
    assert.equal(session.mode, 'normal');
});
test('同snapshot在1x/0.25x/0.05x下的终态、接触及跳数一致', () => {
    const session = new Session(() => 2026);
    session.start(DEFAULT);
    const snapshot = structuredClone(session.snapshot!);
    const results = [];
    for (const mode of Object.keys(PLAYBACK_RATE) as ReplayMode[]) {
        session.replay(snapshot);
        session.mode = mode;
        while (!session.sim.ended)
            session.tick(0.1);
        results.push(JSON.stringify({ p: session.sim.p, v: session.sim.v, q: session.sim.q, contacts: session.sim.contacts, skips: session.sim.skips }));
    }
    assert.equal(results[0], results[1]);
    assert.equal(results[1], results[2]);
});

test('高速长投的相机平滑不累积世界坐标追赶延迟',()=>{
 const rig=new CameraRig(),camera=new PerspectiveCamera(48,1,.01,180);rig.view='follow';
 rig.update(camera,new Vector3(),0,false,10,false);
 const before=camera.position.clone();
 rig.update(camera,new Vector3(24,0,0),1,false,1,false);
 assert.ok(camera.position.clone().sub(before).distanceTo(new Vector3(24,0,0))<1e-10);
 camera.updateMatrixWorld();const projected=new Vector3(24,0,0).project(camera);
 assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1);
});

test('长投中景在横屏、竖屏和斜向投掷时同时框入石子与前几跳', () => {
    const stone = new Vector3(32, .035, -2);
    for (const aspect of [980 / 688, 390 / 524]) {
        for (const direction of [-35, 0, 47]) {
            const angle = direction * Math.PI / 180;
            const along = new Vector3(Math.cos(angle), 0, Math.sin(angle));
            const contacts = [3.4, 2.2, 1.1, .24].map(distance => ({
                point: stone.clone().addScaledVector(along, -distance).setY(0),
            }));
            const rig = new CameraRig();
            const camera = new PerspectiveCamera(46, aspect, .01, 180);
            rig.view = 'course';
            rig.beginThrow(stone, false, direction, aspect);
            rig.update(camera, stone, 2, false, 2, false, contacts);
            camera.updateMatrixWorld();
            const projected = [...contacts.map(c => c.point), stone].map(p => p.clone().project(camera));
            for (const p of projected) {
                assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1);
            }
            assert.ok(projected.at(-1)!.x - projected[0].x > .6);
        }
    }
});

test('子弹回放镜头缓慢微转，全程总转角控制在 15°–30° 内不眩晕', () => {
    const stone = new Vector3(10, 0.05, 0);
    for (const [bulletSpan, elapsed] of [[40, 40], [75, 75]] as const) {
        const start = cameraPose('overview', DEFAULT_VIEW, stone, 0, { direction: 0, aspect: 16 / 9, bulletSpan });
        const end = cameraPose('overview', DEFAULT_VIEW, stone, elapsed, { direction: 0, aspect: 16 / 9, bulletSpan });
        const a0 = Math.atan2(start.position.z - stone.z, start.position.x - stone.x);
        const a1 = Math.atan2(end.position.z - stone.z, end.position.x - stone.x);
        const degrees = Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))) * 180 / Math.PI;
        assert.ok(degrees >= 15 && degrees <= 30, `expected 15°–30° total sweep, got ${degrees.toFixed(2)}°`);
    }
});
