import type { Contact } from './physics';
import type { StoneSpec } from './stones';

export const MAX_RIPPLE_PACKETS = 48;
export const RIPPLE_LIFETIME = 9.0;
const GRAVITY = 9.81;
const VISCOSITY = 0.000095;

export interface RipplePacket {
    x: number;
    z: number;
    birth: number;
    amplitude: number;
    dirX: number;
    dirZ: number;
    forwardBias: number;
    waveSpeed: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Extract active dispersive ripple wave-packets deterministically from real physical Contacts.
 *  Every contact radiates 360° concentric gravity-capillary rings with forward bias scaled by
 *  real horizontal-to-vertical momentum and amplitude scaled by impulse & stone size. */
export function extractRipplePackets(
    contacts: readonly Contact[],
    stone: StoneSpec,
    visualTime: number
): RipplePacket[] {
    if (!contacts.length) return [];
    const active: RipplePacket[] = [];
    const stoneRadius = Math.sqrt(Math.max(1e-6, stone.a * stone.b));

    for (let i = contacts.length - 1; i >= 0 && active.length < MAX_RIPPLE_PACKETS; i--) {
        const c = contacts[i];
        const age = visualTime - c.time;
        if (age < 0 || age > RIPPLE_LIFETIME) continue;

        const vx = c.velocity.x;
        const vz = c.velocity.z;
        const horiz = Math.hypot(vx, vz);
        const vert = Math.abs(c.velocity.y);
        const dirX = horiz > 0.05 ? vx / horiz : 1;
        const dirZ = horiz > 0.05 ? vz / horiz : 0;

        // Seed impulse smoothly on the very first ms of contact before full integration finishes
        const seedImpulse = stone.mass * (0.35 * vert + 0.04 * horiz);
        const rawImpulse = Math.max(c.impulse, seedImpulse * 0.45);
        const isDeepPlunge = !c.bounced && (c.end !== undefined || vert > 1.8) && stone.h > 0.008;
        const plungeBoost = isDeepPlunge ? 1.38 : (!c.bounced && c.end !== undefined ? 1.15 : 1.0);

        // Physical wave height amplitude in metres (~2mm delicate late skip up to ~11mm heavy plunge)
        const sizeScale = Math.pow(stoneRadius / 0.0346, 0.35);
        const amplitude = clamp(0.0052 * Math.pow(rawImpulse / 0.14, 0.52) * sizeScale * plungeBoost, 0.0018, 0.0125);

        // Forward momentum bias: 0 for pure vertical drop (isotropic 360°), up to 0.44 for fast shallow skip
        // Even at max forwardBias=0.44, rear is (1-0.44)=0.56 and sides are 1.0 -> full 360° ring stays crisp!
        const forwardBias = clamp((horiz / (horiz + 2.6 * vert + 0.4)) * 0.46, 0, 0.44);

        // Real deep-water dominant leading wave speed (0.46–0.74 m/s: 15x–40x slower than stone!)
        const waveSpeed = clamp(0.48 + 0.16 * sizeScale * Math.pow(rawImpulse / 0.14, 0.15), 0.46, 0.74);

        active.push({
            x: c.point.x,
            z: c.point.z,
            birth: c.time,
            amplitude,
            dirX,
            dirZ,
            forwardBias,
            waveSpeed,
        });
    }

    return active.reverse();
}

/** CPU reference evaluator matching the exact GLSL Cauchy-Poisson dispersive wave-packet shader.
 *  Returns surface height (m) and exact analytical gradient (dh/dx, dh/dz) at world (x, z, time). */
export function evaluateRippleField(
    packets: readonly RipplePacket[],
    x: number,
    z: number,
    time: number
): { height: number; gx: number; gz: number } {
    let height = 0;
    let gx = 0;
    let gz = 0;

    for (const p of packets) {
        const tau = time - p.birth;
        if (tau <= 0.001 || tau >= RIPPLE_LIFETIME) continue;

        const px = x - p.x;
        const pz = z - p.z;
        const leadRadius = p.waveSpeed * 1.48 * tau + 0.12;
        if (Math.abs(px) > leadRadius + 0.35 || Math.abs(pz) > leadRadius + 0.35) continue;
        const dist = Math.hypot(px, pz);
        if (dist > leadRadius + 0.35) continue;

        // Slight early contact-sweep elongation along travel axis, naturally rounding into circles as r >> sweep
        const sweep = 0.095 * (p.forwardBias / 0.44);
        const along = px * p.dirX + pz * p.dirZ;
        const clampedAlong = clamp(along, -sweep, sweep);
        const qx = px - clampedAlong * p.dirX;
        const qz = pz - clampedAlong * p.dirZ;
        const qDist = Math.hypot(qx, qz);
        const r = Math.hypot(qDist, 0.032);
        const ux = qx / r;
        const uz = qz / r;

        // Deep-water Cauchy-Poisson stationary phase: phi = g * t^2 / (4 * r)
        // Outer rings have longer wavelength and lead faster; inner rings are tighter and trail behind
        const tEff = tau + 0.11;
        const rEff = r + 0.038;
        const phase = (GRAVITY * tEff * tEff) / (4.0 * rEff);
        const k = phase / rEff; // exact -d(phi)/dr

        // Physical viscous cutoff kills ultra-short center waves, leaving a calm pond eye & 4–7 crisp rings
        const viscous = Math.exp(-VISCOSITY * k * k * tEff);
        // Smooth outer leading front cutoff (finite stone cannot excite infinitely long waves)
        const frontEdge = clamp((leadRadius - r) / (0.14 + 0.36 * leadRadius), 0, 1);
        const frontSmooth = frontEdge * frontEdge * (3 - 2 * frontEdge);
        // Gentle center birth fade
        const birthFade = clamp(tau / 0.045, 0, 1);
        const timeDecay = Math.exp(-0.24 * tau) * clamp((RIPPLE_LIFETIME - tau) / 1.2, 0, 1);
        const spread = 1 / Math.sqrt(1 + 2.4 * r);

        // 360° radiation with directional forward bias
        const cosTheta = dist > 0.005 ? along / dist : 0;
        const dirWeight = 1 + p.forwardBias * cosTheta;

        const env = p.amplitude * dirWeight * viscous * frontSmooth * birthFade * timeDecay * spread;
        if (env < 1e-7) continue;

        const s = Math.sin(phase);
        const c = Math.cos(phase);
        height += env * s;
        // Analytical radial gradient d(env * sin(phi))/dr ≈ -env * k * cos(phi)
        const dHdr = -env * k * c * (qDist / r);
        gx += dHdr * ux;
        gz += dHdr * uz;
    }

    return { height, gx, gz };
}
