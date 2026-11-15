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
    assert.equal(session.effects.particles.length, 0);
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
