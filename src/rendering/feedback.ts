import * as THREE from 'three';
import type { Session } from '../app/session';
import type { createWorld } from './world';
import { particlePosition } from './effects';
export function createFeedback(world: ReturnType<typeof createWorld>) {
    const { waterField, sheetField, stone, halo, trail, trailGeometry, drops } = world;
    const dummy = new THREE.Object3D();
    let trailPoints: THREE.Vector3[] = [];
    let lastTrail = 0;
    return {
        reset() { lastTrail = 0; trailPoints = []; trailGeometry.setFromPoints([]); drops.count = 0; },
        update(session: Session, helpers: boolean) {
            const { sim, effects: effectState, visualTime } = session;
            waterField.update(sim.contacts, visualTime);
            sheetField.update(effectState.sheets, visualTime);
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
            let visibleDrops = 0;
            for (const particle of effectState.particles) {
                const age = visualTime - particle.birth;
                const position = particlePosition(particle, visualTime);
                if (age < 0 || age > particle.life || position[1] < 0)
                    continue;
                dummy.position.set(...position);
                dummy.scale.set(particle.size, particle.size * (1.4 + Math.max(0, particle.velocity[1] - 9.81 * age)), particle.size);
                dummy.updateMatrix();
                drops.setMatrixAt(visibleDrops++, dummy.matrix);
            }
            drops.count = visibleDrops;
            drops.instanceMatrix.needsUpdate = true;
            return visibleDrops;
        }
    };
}
