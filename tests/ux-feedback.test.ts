import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT, Simulation } from '../src/simulation/physics';
import { PullThrowGesture, SWEET_SPOT_MIN, SWEET_SPOT_MAX } from '../src/input/pull-gesture';
import { compareWithBest } from '../src/ui/telemetry';
import { sampleThrow } from '../src/simulation/launch-randomness';
import { diagnoseThrow } from '../src/simulation/throw-feedback';
import { compareStoneProfiles, computeStoneProfile } from '../src/simulation/stone-profile';
import { instantiateStone, STANDARD_STONE, STONE_ARCHETYPES } from '../src/simulation/stones';
import { MOBILE_COURSE_GRID } from '../src/simulation/water-grid';

test('diagnoseThrow translates steep tilt failure, blunt rock, and same-power compare deltas', () => {
    // 1. Steep attack tilt failure gives actionable tilt guidance
    const steepLaunch = { speed: 12, elevation: 2, tilt: 32, roll: 0, spin: 20, direction: 0 };
    const steepSnap = sampleThrow(steepLaunch, 0, 11, STANDARD_STONE);
    const steepSim = new Simulation(steepSnap.sampled, undefined, true, true, 4, STANDARD_STONE).run();
    const steepDiag = diagnoseThrow(steepSim, { snapshot: steepSnap });
    assert.ok(steepDiag.metricsLine.includes('攻角 32°'));
    assert.ok(steepDiag.cause.includes('攻角') || steepDiag.nextTip.includes('攻角'));

    // 2. Blunt plunge boulder identifies thickness rather than blaming player aim
    const boulder = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'plunge_boulder')!, 7, true);
    const boulderSnap = sampleThrow({ speed: 15, elevation: 2, tilt: 8, roll: 0, spin: 24, direction: 0 }, 0, 12, boulder);
    const boulderSim = new Simulation(boulderSnap.sampled, undefined, true, true, 4, boulder).run();
    const boulderDiag = diagnoseThrow(boulderSim, { snapshot: boulderSnap });
    assert.ok(boulderDiag.cause.includes('厚'));
    assert.ok(boulderDiag.nextTip.includes('拣石'));

    // 3. Same-power compare produces a clear delta line against baseline stone
    const master = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'master_disc')!, 8, true);
    const fastLaunch = { speed: 18, elevation: 2, tilt: 9, roll: 0, spin: 28, direction: 0 };
    const baseSim = new Simulation(fastLaunch, undefined, true, true, 4, STANDARD_STONE).run();
    const masterSnap = sampleThrow(fastLaunch, 0, 13, master);
    const masterSim = new Simulation(masterSnap.sampled, undefined, true, true, 4, master).run();
    const compareDiag = diagnoseThrow(masterSim, {
        snapshot: masterSnap,
        isSamePowerCompare: true,
        baseline: {
            skips: baseSim.skips,
            distance: Math.hypot(baseSim.p.x, baseSim.p.z),
            stoneName: STANDARD_STONE.name,
            tilt: fastLaunch.tilt,
            roll: 0,
        },
    });
    assert.ok(compareDiag.metricsLine.includes('无扰动定力'));
    assert.ok(compareDiag.compareLine?.includes(STANDARD_STONE.name));
    assert.ok(compareDiag.compareLine?.includes('跳'));
});

function releaseAt(phase: number, distance = 160) {
    const gesture = new PullThrowGesture();
    const origin = { pointerId: 1, clientX: 500, clientY: 300, timeStamp: 100 };
    gesture.begin(origin, { left: 0, top: 0, width: 1000, height: 800 }, DEFAULT);
    return gesture.release({ ...origin, clientY: origin.clientY + distance, timeStamp: origin.timeStamp + phase / 1.45 * 1000 });
}

test('release timing follows both visits to the gold band and preserves the pointer-up position', () => {
    const early = releaseAt(0.55)!.wristRelease!;
    const hit = releaseAt(0.70)!.wristRelease!;
    const late = releaseAt(0.88)!.wristRelease!;
    assert.equal(early.timing, 'early');
    assert.equal(hit.timing, 'hit');
    assert.equal(late.timing, 'late');
    assert.ok(hit.cursor >= SWEET_SPOT_MIN && hit.cursor <= SWEET_SPOT_MAX);
    assert.ok(late.cursor > SWEET_SPOT_MAX);
    const returning = releaseAt(1.12)!.wristRelease!;
    assert.equal(returning.timing, 'early');
    assert.ok(Math.abs(returning.cursor - late.cursor) < 1e-12);
    assert.equal(releaseAt(1.30)!.wristRelease!.timing, 'hit');
    assert.equal(releaseAt(1.50)!.wristRelease!.timing, 'late');
    assert.equal(releaseAt(1.98)!.wristRelease!.timing, 'late');
    assert.equal(releaseAt(2.02)!.wristRelease!.timing, 'early');
    assert.equal(releaseAt(2.70)!.wristRelease!.timing, 'hit');
});

test('a short tap never launches and a weak valid launch has no wrist timing', () => {
    assert.equal(releaseAt(0.04, 0), undefined);
    const weak = releaseAt(0.04, 30)!;
    assert.ok(weak.isPullActive);
    assert.equal(weak.wristRelease, undefined);
});

test('settlement uses the measured timing even with jitter off, and omits timing without a gesture', () => {
    const snapshot = sampleThrow(DEFAULT, 0, 13, STANDARD_STONE);
    const sim = new Simulation(snapshot.sampled, undefined, true, true, 4, STANDARD_STONE).run();
    for (const [phase, label, tip] of [
        [0.55, '松手偏早', '等白点进入'], [0.70, '松手命中', '继续在白点进入'], [0.88, '松手偏晚', '一进金色区就松手'],
    ] as const) {
        const release = releaseAt(phase)!.wristRelease!;
        const diagnosis = diagnoseThrow(sim, { snapshot, release });
        assert.deepEqual(diagnosis.timing, { label, cursor: release.cursor });
        assert.ok(diagnosis.nextTip.includes(tip));
    }
    assert.equal(diagnoseThrow(sim, { snapshot }).timing, undefined);
    assert.equal(diagnoseThrow(sim, { snapshot, release: releaseAt(0.70)!.wristRelease, isSamePowerCompare: true }).timing, undefined);
});

test('best comparison preserves skip priority, distance threshold, and the zero-skip rule', () => {
    const best = { skips: 5, distance: 20 };
    assert.deepEqual(compareWithBest({ skips: 3, distance: 55 }, best), { isNewBest: false, message: '距最佳还差 2 跳' });
    assert.deepEqual(compareWithBest({ skips: 5, distance: 20.05 }, best), { isNewBest: false, message: '追平最佳跳数' });
    assert.deepEqual(compareWithBest({ skips: 5, distance: 20.06 }, best), { isNewBest: true, message: '刷新个人纪录' });
    assert.equal(compareWithBest({ skips: 6, distance: 1 }, best).isNewBest, true);
    assert.deepEqual(compareWithBest({ skips: 0, distance: 5 }, { skips: 0, distance: 0 }), { isNewBest: false, message: '完成首跳即可建立个人纪录' });
});

test('computeStoneProfile differentiates blunt, thin, heavy, willow, and master stones with coherent relative deltas', () => {
    const cobble = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'chunky_cobble')!, 1, true);
    const shale = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'thin_shale')!, 2, true);
    const basalt = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'heavy_basalt')!, 3, true);
    const willow = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'willow_leaf')!, 4, true);
    const master = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'master_disc')!, 5, true);

    const pCobble = computeStoneProfile(cobble);
    const pShale = computeStoneProfile(shale);
    const pBasalt = computeStoneProfile(basalt);
    const pWillow = computeStoneProfile(willow);
    const pMaster = computeStoneProfile(master);

    assert.ok(pShale.lift > pCobble.lift + 30, `thin shale lift (${pShale.lift}) should vastly beat cobble (${pCobble.lift})`);
    assert.ok(pBasalt.stability > pWillow.stability, `heavy basalt stability (${pBasalt.stability}) should exceed narrow willow leaf (${pWillow.stability})`);
    assert.ok(pMaster.glide > pCobble.glide + 40, `master disc glide (${pMaster.glide}) should vastly beat cobble (${pCobble.glide})`);
    assert.equal(pWillow.styleTag, '弧线灵动');
    assert.equal(pCobble.styleTag, '厚重砸水');

    const cmp = compareStoneProfiles(master, STANDARD_STONE);
    assert.ok(cmp.deltaGlide > 0, `master disc should report positive glide delta over standard stone (got ${cmp.deltaGlide})`);
    assert.ok(cmp.deltaStability > 0, `master disc should report positive stability delta over standard stone (got ${cmp.deltaStability})`);
});

test('MOBILE_COURSE_GRID cuts water field VRAM footprint by 32x with HalfFloat while keeping CFL stable', () => {
    assert.equal(MOBILE_COURSE_GRID.sizeX, 64);
    assert.equal(MOBILE_COURSE_GRID.sizeZ, 32);
    assert.ok(MOBILE_COURSE_GRID.cfl < 0.86, `expected CFL < 0.86, got ${MOBILE_COURSE_GRID.cfl}`);
    const mobileHalfFloatBytes = MOBILE_COURSE_GRID.width * MOBILE_COURSE_GRID.height * 8 * 2;
    assert.equal(mobileHalfFloatBytes, 4 * 1024 * 1024);
});
