import * as THREE from 'three';
import type { Launch } from '../simulation/physics';
import type { StoneSpec } from '../simulation/stones';

const ARC_SEGMENTS = 28;

/** Subtle golden sunset ballistic arc + first water-touch ring shown ONLY while pulling back to aim.
 *  Never spoils subsequent bounces — only communicates throw direction, speed & first water entry point. */
export function createAimGuide(scene: THREE.Scene) {
    const group = new THREE.Group();
    group.visible = false;

    const positions = new Float32Array((ARC_SEGMENTS + 1) * 3);
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const arcMaterial = new THREE.LineBasicMaterial({
        color: 0xffcf88,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
    });
    const arcLine = new THREE.Line(arcGeometry, arcMaterial);
    arcLine.frustumCulled = false;
    group.add(arcLine);

    const ringGeometry = new THREE.RingGeometry(0.085, 0.115, 40);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd596,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const innerDot = new THREE.Mesh(
        new THREE.CircleGeometry(0.028, 24),
        new THREE.MeshBasicMaterial({ color: 0xffe6ba, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false })
    );
    innerDot.rotation.x = -Math.PI / 2;
    group.add(innerDot);

    scene.add(group);

    return {
        hide() {
            group.visible = false;
        },
        update(target: Launch, stone: StoneSpec, sweetQuality: number) {
            const rad = Math.PI / 180;
            const dir = target.direction * rad;
            const elev = target.elevation * rad;
            const vx = Math.cos(dir) * Math.cos(elev) * target.speed;
            const vy = Math.sin(elev) * target.speed;
            const vz = Math.sin(dir) * Math.cos(elev) * target.speed;
            const y0 = 0.24;
            const g = 9.81;
            const disc = vy * vy + 2 * g * y0;
            if (disc <= 0) {
                group.visible = false;
                return;
            }
            const tHit = (vy + Math.sqrt(disc)) / g;
            const attr = arcGeometry.getAttribute('position') as THREE.BufferAttribute;
            for (let i = 0; i <= ARC_SEGMENTS; i++) {
                const t = (i / ARC_SEGMENTS) * tHit;
                const x = vx * t;
                const y = Math.max(0.012, y0 + vy * t - 0.5 * g * t * t);
                const z = vz * t;
                attr.setXYZ(i, x, y, z);
            }
            attr.needsUpdate = true;

            const hitX = vx * tHit;
            const hitZ = vz * tHit;
            const scale = Math.max(0.85, Math.max(stone.a, stone.b) / 0.04);
            ring.position.set(hitX, 0.015, hitZ);
            ring.scale.set(scale * (1 + sweetQuality * 0.25), scale * (1 + sweetQuality * 0.25), 1);
            innerDot.position.set(hitX, 0.016, hitZ);

            // Warm golden bloom tint when cursor enters wrist sweet-spot
            const col = sweetQuality > 0.35 ? 0xffe2a4 : 0xf2b372;
            arcMaterial.color.setHex(col);
            ringMaterial.color.setHex(col);
            arcMaterial.opacity = 0.45 + 0.35 * sweetQuality;
            ringMaterial.opacity = 0.48 + 0.36 * sweetQuality;
            group.visible = true;
        },
    };
}
