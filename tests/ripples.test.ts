import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { DEFAULT, Simulation, type Contact } from '../src/simulation/physics';
import { instantiateStone, STANDARD_STONE, STONE_ARCHETYPES } from '../src/simulation/stones';
import { evaluateRippleField, extractRipplePackets } from '../src/simulation/ripples';

test('dispersive ripple wave speed is physically slow (~0.46–0.74 m/s), far slower than the skipping stone', () => {
    const sim = new Simulation({ ...DEFAULT, speed: 15, tilt: 8, spin: 24 }, undefined, true, true, 4, STANDARD_STONE).run();
    const packets = extractRipplePackets(sim.contacts, STANDARD_STONE, sim.time + 1.0);
    assert.ok(packets.length >= 4);
    for (const p of packets) {
        assert.ok(p.waveSpeed >= 0.45 && p.waveSpeed <= 0.76, `wave speed ${p.waveSpeed} m/s out of physical lake range`);
        assert.ok(p.waveSpeed < 15 / 15, 'wave speed must be >15x slower than a 15 m/s skipping stone');
    }
});

test('skipping contact radiates crisp concentric ripples in all 360° directions with forward bias', () => {
    const contact: Contact = {
        id: 0, time: 0.2, end: 0.215,
        point: new Vector3(3, 0, 0),
        velocity: new Vector3(14, -1.4, 0),
        impulse: 0.18, maxArea: 0.0025, bounced: true, energyIn: 6,
    };
    const packets = extractRipplePackets([contact], STANDARD_STONE, 2.2);
    assert.equal(packets.length, 1);
    assert.ok(packets[0].forwardBias > 0.25 && packets[0].forwardBias <= 0.44);

    // Measure peak ripple slope over radius [0.35..1.35 m] in 4 directions: forward (+X), backward (-X), left (-Z), right (+Z)
    function peakSlope(dx: number, dz: number) {
        let maxG = 0;
        for (let r = 0.35; r <= 1.35; r += 0.015) {
            const f = evaluateRippleField(packets, 3 + dx * r, dz * r, 2.2);
            maxG = Math.max(maxG, Math.hypot(f.gx, f.gz));
        }
        return maxG;
    }

    const forward = peakSlope(1, 0);
    const backward = peakSlope(-1, 0);
    const left = peakSlope(0, -1);
    const right = peakSlope(0, 1);

    assert.ok(backward > 0.012, `backward ripples must remain clearly visible in 360° (got slope ${backward.toFixed(4)})`);
    assert.ok(left > 0.02 && Math.abs(left - right) < 1e-6, 'left/right lateral ripples must be strong and symmetric');
    assert.ok(forward > left && left > backward, `expected forward (${forward.toFixed(4)}) > lateral (${left.toFixed(4)}) > backward (${backward.toFixed(4)})`);
});

test('vertical rock drop produces 360° isotropic circular ripples and multi-ring Cauchy-Poisson dispersion', () => {
    const cobble = instantiateStone(STONE_ARCHETYPES.find(a => a.archetypeId === 'chunky_cobble')!, 42, true);
    const drop: Contact = {
        id: 0, time: 0.1, end: 0.15,
        point: new Vector3(2, 0, 0),
        velocity: new Vector3(0.01, -4.2, 0),
        impulse: 0.55, maxArea: 0.0022, bounced: false, energyIn: 1.5,
    };
    const packets = extractRipplePackets([drop], cobble, 2.6);
    assert.ok(packets[0].forwardBias < 0.01, 'vertical drop should have near-zero directional bias');

    // Verify isotropy at fixed radius r=0.85m
    const fX = evaluateRippleField(packets, 2.85, 0, 2.6);
    const fZ = evaluateRippleField(packets, 2, 0.85, 2.6);
    assert.ok(Math.abs(fX.height - fZ.height) < 1e-5, 'vertical drop ripples must be circularly symmetric');

    // Count distinct concentric crests (local maxima of height > 0.25mm) at tau = 2.5s
    const crests: number[] = [];
    const samples: number[] = [];
    const radii: number[] = [];
    for (let r = 0.25; r <= 2.1; r += 0.01) {
        radii.push(r);
        samples.push(evaluateRippleField(packets, 2 + r, 0, 2.6).height);
    }
    for (let i = 1; i < samples.length - 1; i++) {
        if (samples[i] > 0.00025 && samples[i] > samples[i - 1] && samples[i] >= samples[i + 1]) {
            crests.push(radii[i]);
        }
    }
    assert.ok(crests.length >= 3, `expected >= 3 concentric dispersive crests, got ${crests.length} at radii [${crests.map(r => r.toFixed(2)).join(', ')}]`);
    // Deep-water dispersion: outer crest spacing (wavelength) must be longer than inner crest spacing!
    const innerSpacing = crests[1] - crests[0];
    const outerSpacing = crests[crests.length - 1] - crests[crests.length - 2];
    assert.ok(outerSpacing > innerSpacing * 1.25, `expected outer wavelength (${outerSpacing.toFixed(3)}m) > inner wavelength (${innerSpacing.toFixed(3)}m)`);
});

test('ripples continue expanding gracefully for several seconds after sinking and eventually fade to zero', () => {
    const contact: Contact = {
        id: 0, time: 0.2, end: 0.215,
        point: new Vector3(4, 0, 0),
        velocity: new Vector3(12, -1.2, 0),
        impulse: 0.16, maxArea: 0.002, bounced: true, energyIn: 4,
    };
    const at4s = extractRipplePackets([contact], STANDARD_STONE, 4.2);
    assert.equal(at4s.length, 1);
    let peak4s = 0;
    for (let r = 0.5; r <= 3.5; r += 0.05) {
        const f = evaluateRippleField(at4s, 4 + r, 0, 4.2);
        peak4s = Math.max(peak4s, Math.hypot(f.gx, f.gz));
    }
    assert.ok(peak4s > 0.008, `ripples should still be visibly expanding 4s after impact (slope=${peak4s.toFixed(4)})`);

    const expired = extractRipplePackets([contact], STANDARD_STONE, 12.0);
    assert.equal(expired.length, 0, 'ripples older than lifetime should be cleaned up');
});
