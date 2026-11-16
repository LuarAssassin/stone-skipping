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
            waterField.update(effectState.field, visualTime);
            sheetField.update(effectState.sheets, visualTime, effectState.field);
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
                const variation = .5 + .5 * Math.sin(particle.birth * 1731 + particle.velocity[0] * 97 + particle.velocity[2] * 53);
                const radius = particle.size * (particle.volume ? 1 : .55 + variation * .55);
                dummy.scale.set(radius, radius * (particle.volume ? 1 : 1.15 + .45 * Math.max(0, particle.velocity[1] - 9.81 * age)), radius);
                drops.geometry.getAttribute('clarity').setX(visibleDrops, variation);
                dummy.updateMatrix();
                drops.setMatrixAt(visibleDrops++, dummy.matrix);
            }
            drops.count = visibleDrops;
            drops.instanceMatrix.needsUpdate = true;
            drops.geometry.getAttribute('clarity').needsUpdate = true;
            return visibleDrops;
        }
    };
}
