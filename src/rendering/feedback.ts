import * as THREE from 'three';
import type { Session } from '../app/session';
import type { createWorld } from './world';
import { extractRipplePackets } from '../simulation/ripples';

export function createFeedback(world: ReturnType<typeof createWorld>) {
    const { waterField, stone, halo, trail, trailGeometry } = world;
    let trailCount=0;
    let lastTrail = 0;
    return {
        reset() {
            lastTrail = 0;
            trailCount=0;
            trailGeometry.setDrawRange(0,0);
            waterField.updateRipples([], 0);
        },
        update(session: Session, helpers: boolean) {
            const { sim } = session;
            world.churn.update(world.renderer,session.waterTicks,session.waterGeneration,session.visualTime);
            waterField.update(world.renderer, session.waterTicks, session.waterGeneration, session.waterStrength);
            const ripples = session.mouseMode ? [] : extractRipplePackets(sim.contacts, sim.stone, session.visualTime);
            waterField.updateRipples(ripples, session.visualTime);

            stone.position.copy(sim.p);
            stone.quaternion.copy(sim.q);
            halo.position.set(sim.p.x, .006, sim.p.z);
            halo.visible = sim.p.y > -.04 && helpers;
            trail.visible = halo.visible;
            if (sim.time - lastTrail > .012 && trailCount<2048) {
                const positions=trailGeometry.getAttribute('position') as THREE.BufferAttribute;
                positions.setXYZ(trailCount++,sim.p.x,sim.p.y,sim.p.z);positions.needsUpdate=true;
                lastTrail = sim.time;
                trailGeometry.setDrawRange(0,trailCount);
            }
            return world.spray.update(session.spray,session.visualTime);
        }
    };
}
