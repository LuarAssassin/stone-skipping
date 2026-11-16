import * as THREE from 'three';
import type { Session } from '../app/session';
import type { createWorld } from './world';

export function createFeedback(world: ReturnType<typeof createWorld>) {
    const { waterField, stone, halo, trail, trailGeometry } = world;
    let trailPoints: THREE.Vector3[] = [];
    let lastTrail = 0;
    return {
        reset() { lastTrail = 0; trailPoints = []; trailGeometry.setFromPoints([]); },
        update(session: Session, helpers: boolean) {
            const { sim } = session;
            waterField.update(world.renderer, session.waterTicks, session.waterGeneration);

            stone.position.copy(sim.p);
            stone.quaternion.copy(sim.q);
            halo.position.set(sim.p.x, .006, sim.p.z);
            halo.visible = sim.p.y > -.04 && helpers;
            trail.visible = halo.visible;
            if (sim.time - lastTrail > .012) {
                trailPoints.push(sim.p.clone());
                lastTrail = sim.time;
                trailGeometry.setFromPoints(trailPoints);
            }
            return 0;
        }
    };
}
