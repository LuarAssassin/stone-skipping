import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DEFAULT, Simulation } from '../src/simulation/physics';
import {
    forageShoreStones,
    instantiateStone,
    MAX_COLLECTION_SIZE,
    STANDARD_STONE,
    STONE_ARCHETYPES,
    StoneBox,
    stoneFromManifestEntry,
    type StoneManifest,
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

test('Blender stone manifest loads cleanly, every GLB exists on disk, foraging is strictly unique, and plunge_boulder vs master_disc behave physically', () => {
    const manifestUrl = new URL('../public/assets/stones/manifest.json', import.meta.url);
    const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as StoneManifest;
    assert.ok(manifest.count >= 36, `expected at least 36 stones in manifest, got ${manifest.count}`);
    assert.equal(manifest.stones.length, manifest.count);

    for (const entry of manifest.stones) {
        const glbUrl = new URL(`../public${entry.glbPath}`, import.meta.url);
        assert.ok(existsSync(glbUrl), `missing GLB asset: ${entry.glbPath}`);
        assert.ok(entry.a >= entry.b && entry.b >= entry.h && entry.mass > 0.01);
    }

    // Strict uniqueness: laying out the entire manifest (all 96 stones) produces 100% unique GLBs
    const shoreAll = forageShoreStones(120, 4242, manifest.stones.length, manifest.stones);
    assert.equal(shoreAll.length, manifest.stones.length);
    assert.ok(shoreAll.every(s => s.glbPath?.startsWith('/assets/stones/')));
    const uniqueGlbs = new Set(shoreAll.map(s => s.glbPath));
    assert.equal(uniqueGlbs.size, manifest.stones.length, `expected ${manifest.stones.length} strictly unique stones on shore, got ${uniqueGlbs.size}`);

    // Exclude previous batch prefers unseen stones when catalog has spare entries
    const prevIds = new Set(shoreAll.slice(0, 16).map(s => s.id.replace(/-[a-z0-9]+$/, '')));
    const fresh16 = forageShoreStones(120, 9999, 16, manifest.stones, prevIds);
    const freshGlbs = new Set(fresh16.map(s => s.glbPath));
    assert.equal(freshGlbs.size, 16);
    const prevGlbs = new Set(shoreAll.slice(0, 16).map(s => s.glbPath));
    const overlap = fresh16.filter(s => prevGlbs.has(s.glbPath)).length;
    assert.equal(overlap, 0, `expected fresh batch to avoid all 16 excluded stones when ${manifest.stones.length - 16} unseen exist, got ${overlap} overlap`);

    const boulder = stoneFromManifestEntry(manifest.stones.find(s => s.archetypeId === 'plunge_boulder')!, 1);
    const master = stoneFromManifestEntry(manifest.stones.find(s => s.archetypeId === 'master_disc')!, 2);
    const launch = { speed: 15, elevation: 2, tilt: 8, spin: 26, direction: 0 };
    const simBoulder = new Simulation(launch, undefined, true, true, 4, boulder).run();
    const simMaster = new Simulation(launch, undefined, true, true, 4, master).run();

    assert.equal(simBoulder.skips, 0, `340g plunge_boulder should plunge straight in (got ${simBoulder.skips} skips)`);
    assert.ok(simMaster.skips >= 5 && simMaster.p.x > simBoulder.p.x * 2, `master_disc (${simMaster.skips} skips, ${simMaster.p.x.toFixed(1)}m) should vastly outperform plunge_boulder (${simBoulder.p.x.toFixed(1)}m)`);
});
