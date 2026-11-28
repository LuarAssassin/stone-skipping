import assert from 'node:assert/strict';
import test from 'node:test';
import { Session } from '../src/app/session';
import { automaticQualities, FrameBudget } from '../src/rendering/graphics-quality';
import { DEFAULT } from '../src/simulation/physics';
import { RIPPLE_LIFETIME } from '../src/simulation/ripples';
import { BALANCED_COURSE_GRID, COURSE_GRID } from '../src/simulation/water-grid';

test('Retina drops render pixels before water resolution and 1× screens skip redundant steps', () => {
    assert.deepEqual(automaticQualities(2).map(step => [step.tier, step.pixelRatio]), [
        ['high', 2], ['high', 1.5], ['high', 1.25], ['high', 1], ['balanced', 1], ['low', 1],
    ]);
    assert.deepEqual(automaticQualities(1).map(step => step.tier), ['high', 'balanced', 'low']);
    assert.equal(BALANCED_COURSE_GRID.sizeX, COURSE_GRID.sizeX);
    assert.equal(BALANCED_COURSE_GRID.speed, COURSE_GRID.speed);
    assert.ok(BALANCED_COURSE_GRID.cfl < 0.85);
});

test('one hitch and sustained smooth frames retain high quality; repeated slow frames downgrade', () => {
    const budget = new FrameBudget();
    assert.equal(budget.sample(1400, false, 1400), 0);
    let now = 1400;
    for (let i = 0; i < 360; i++) assert.equal(budget.sample(16.7, false, now += 16.7), 0);
    budget.reset();
    for (let i = 0; i < 59; i++) {
        const duration = i % 2 ? 33.4 : 16.7;
        assert.equal(budget.sample(duration, true, now += duration), 0);
    }
    assert.equal(budget.sample(33.4, true, now += 33.4), 1);
});

test('an upgrade requires extended fast throwing and cannot be driven by idle FPS', () => {
    const budget = new FrameBudget();
    let now = 0;
    for (let i = 0; i < 1500; i++) assert.equal(budget.sample(16.7, false, now += 16.7), 0);
    for (let i = 0; i < 598; i++) assert.equal(budget.sample(16.7, true, now += 16.7), 0);
    assert.equal(budget.sample(16.7, true, now += 16.7), -1);
});

test('settling keeps the full throw, then stops water commands and restarts on replay', () => {
    const session = new Session(() => 271);
    assert.equal(session.waterStrength, 0);
    session.start(DEFAULT, 0);
    session.advance(4);
    const skips = session.sim.skips;
    const position = session.sim.p.toArray();
    assert.equal(session.sim.ended, true);
    assert.equal(session.waterStrength, 1);
    session.advance(RIPPLE_LIFETIME + 1);
    assert.equal(session.waterStrength, 0);
    const queued = session.waterTicks.length;
    session.advance(1);
    assert.equal(session.waterTicks.length, queued);
    assert.equal(session.sim.skips, skips);
    assert.deepEqual(session.sim.p.toArray(), position);
    assert.ok(session.replay());
    session.advance(1 / 60 + session.sim.dt);
    assert.equal(session.waterStrength, 1);
    assert.equal(session.waterTicks.length, 2);
});

test('touching still water wakes it without replaying commands for the idle time', () => {
    const session = new Session(() => 271);
    session.mouseMode = true;
    session.mouse = { x: 2, z: 0, y: 0, radius: 0.22, depth: 0.075 };
    session.advance(1 / 60);
    session.mouse = undefined;
    session.advance(RIPPLE_LIFETIME + 1);
    assert.equal(session.waterStrength, 0);
    session.waterTicks.length = 0;
    session.mouse = { x: 3, z: 0, y: 0, radius: 0.22, depth: 0.075 };
    session.advance(1 / 60);
    assert.equal(session.waterStrength, 1);
    assert.equal(session.waterTicks.length, 2);
    assert.equal(session.waterTicks[0].next.x, 3);
});
