import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT, Simulation } from '../src/simulation/physics';
import {
    forageShoreStones,
    instantiateStone,
    MAX_COLLECTION_SIZE,
    STANDARD_STONE,
    STONE_ARCHETYPES,
    StoneBox,
} from '../src/simulation/stones';
import { parseSnapshot, sampleThrow } from '../src/simulation/launch-randomness';
import { Session } from '../src/app/session';
import { PullThrowGesture } from '../src/input/pull-gesture';

test('different stone archetypes produce genuinely distinct physical trajectories under identical launch', () => {
    const cobble = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'chunky_cobble')!, 101, true);
    const shale = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'thin_shale')!, 102, true);
    const master = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'master_disc')!, 103, true);

    const launch = { speed: 14, elevation: 2, tilt: 8, spin: 24, direction: 0 };
    const simCobble = new Simulation(launch, undefined, true, true, 4, cobble).run();
    const simShale = new Simulation(launch, undefined, true, true, 4, shale).run();
    const simMaster = new Simulation(launch, undefined, true, true, 4, master).run();

    assert.ok(simCobble.skips < simShale.skips, `chunky cobble (${simCobble.skips}) should skip fewer times than thin shale (${simShale.skips})`);
    assert.ok(simMaster.skips >= 5, `master disc should skip strongly (got ${simMaster.skips})`);
    assert.ok(simMaster.p.x > simCobble.p.x * 1.5, `master disc (${simMaster.p.x.toFixed(1)}m) should travel much farther than cobble (${simCobble.p.x.toFixed(1)}m)`);
});

test('lateral stone roll bends trajectory sideways and opposite rolls mirror cleanly', () => {
    const leftBank = new Simulation({ ...DEFAULT, speed: 13, tilt: 8, roll: -14, spin: 20 }, undefined, true, true, 4, STANDARD_STONE).run();
    const rightBank = new Simulation({ ...DEFAULT, speed: 13, tilt: 8, roll: 14, spin: -20 }, undefined, true, true, 4, STANDARD_STONE).run();

    assert.ok(Math.abs(leftBank.p.z) > 0.08, `expected measurable lateral curve from roll, got z=${leftBank.p.z.toFixed(4)}`);
    assert.ok(Math.abs(leftBank.p.z + rightBank.p.z) < 1e-6, `mirrored roll+spin should produce symmetric Z (${leftBank.p.z} vs ${rightBank.p.z})`);
});

test('signed spin, roll, and StoneSpec round-trip cleanly through snapshot & Session GPU footprint', () => {
    const cobble = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'chunky_cobble')!, 55, true);
    const target = { speed: 13, elevation: 2, tilt: 8, roll: -10, spin: -24, direction: 4 };
    const snap = sampleThrow(target, 1, 999, cobble);
    assert.ok(snap.sampled.spin < 0);
    assert.ok(snap.sampled.roll !== undefined);
    const parsed = parseSnapshot(JSON.stringify(snap));
    assert.deepEqual(parsed.sampled, snap.sampled);
    assert.equal(parsed.stone?.archetypeId, 'chunky_cobble');

    const session = new Session(() => 77);
    session.start(target, 0, undefined, cobble);
    session.advance(0.1);
    // Cobble thickness (h=0.016m) should reflect directly in water footprint depth (> standard 0.0045m)
    assert.ok(session.waterTicks.length > 0);
    assert.ok(session.waterTicks[0].next.depth > 0.014, `expected thick cobble depth > 0.014m, got ${session.waterTicks[0].next.depth}`);
});

test('shore foraging mixes blunt and quality stones and StoneBox enforces capacity', () => {
    const shore = forageShoreStones(50, 12345);
    assert.equal(shore.length, 5);
    assert.ok(shore.some(s => s.rarity === 'common'), 'shore should include at least one imperfect/blunt stone');

    const box = new StoneBox(false);
    assert.equal(box.stones.length, 1);
    for (let i = 0; i < MAX_COLLECTION_SIZE + 2; i++) {
        const extra = instantiateStone(STONE_ARCHETYPES[i % STONE_ARCHETYPES.length], 500 + i);
        const res = box.collect(extra);
        if (i < MAX_COLLECTION_SIZE - 1) assert.equal(res.ok, true);
        else assert.equal(res.ok, false);
    }
    assert.equal(box.stones.length, MAX_COLLECTION_SIZE);
});

test('PullThrowGesture maps pull-back to speed, preserves spin sign, and rewards sweet-spot timing', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 800 };
    const g = new PullThrowGesture();
    const base = { ...DEFAULT, spin: -20, roll: -6 };

    g.begin({ pointerId: 1, clientX: 500, clientY: 300, timeStamp: 100 }, rect, base);
    g.move({ pointerId: 1, clientX: 600, clientY: 500, timeStamp: 300 });
    const mid = g.preview(300)!;
    assert.ok(mid.power > 0.5);
    assert.ok(mid.target.speed > 14);
    assert.ok(mid.target.direction > 0);
    assert.ok(mid.target.spin < 0, 'negative spin sign should be preserved');
    assert.equal(mid.target.roll, -6);

    // Pull further down increases speed cleanly
    g.move({ pointerId: 1, clientX: 600, clientY: 640, timeStamp: 450 });
    const stronger = g.preview(450)!;
    assert.ok(stronger.target.speed > mid.target.speed);
    assert.ok(stronger.target.speed <= 25.51);

    const released = g.release({ pointerId: 1, clientX: 600, clientY: 640, timeStamp: 450 });
    assert.ok(released);
    assert.ok(released.temperatureScale > 0 && released.temperatureScale <= 1);
});
