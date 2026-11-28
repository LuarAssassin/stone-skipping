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

    // Subtle vertical halo around the ready stone at shore so players spot it immediately before pulling
    const readyStoneRingMat = new THREE.MeshBasicMaterial({
        color: 0xffd79b,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const readyStoneRing = new THREE.Mesh(new THREE.RingGeometry(0.068, 0.082, 40), readyStoneRingMat);
    readyStoneRing.rotation.x = -Math.PI / 2;
    readyStoneRing.position.set(0, 0.24, 0);
    readyStoneRing.visible = false;
    group.add(readyStoneRing);

    scene.add(group);

    function computeFirstHit(target: Launch) {
        const rad = Math.PI / 180;
        const dir = target.direction * rad;
        const elev = target.elevation * rad;
        const vx = Math.cos(dir) * Math.cos(elev) * target.speed;
        const vy = Math.sin(elev) * target.speed;
        const vz = Math.sin(dir) * Math.cos(elev) * target.speed;
        const y0 = 0.24;
        const g = 9.81;
        const disc = vy * vy + 2 * g * y0;
        if (disc <= 0) return undefined;
        const tHit = (vy + Math.sqrt(disc)) / g;
        return { vx, vy, vz, y0, g, tHit };
    }

    return {
        hide() {
            group.visible = false;
            readyStoneRing.visible = false;
        },
        /** Gentle ready-state framing cue at shore: highlights the held stone and approximate first entry point. */
        showReadyHint(target: Launch, stone: StoneSpec, time = 0) {
            const previewTarget: Launch = { ...target, speed: Math.max(10.5, Math.min(16, target.speed || 12)) };
            const hit = computeFirstHit(previewTarget);
            if (!hit) {
                group.visible = false;
                return;
            }
            const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
            const attr = arcGeometry.getAttribute('position') as THREE.BufferAttribute;
            for (let i = 0; i <= ARC_SEGMENTS; i++) {
                const t = (i / ARC_SEGMENTS) * hit.tHit;
                attr.setXYZ(i, hit.vx * t, Math.max(0.012, hit.y0 + hit.vy * t - 0.5 * hit.g * t * t), hit.vz * t);
            }
            attr.needsUpdate = true;

            const scale = Math.max(0.95, Math.max(stone.a, stone.b) / 0.04);
            readyStoneRing.visible = true;
            readyStoneRing.position.set(0, 0.24, 0);
            readyStoneRing.scale.setScalar(scale * (1.02 + pulse * 0.14));
            readyStoneRingMat.opacity = 0.34 + pulse * 0.24;

            ring.position.set(hit.vx * hit.tHit, 0.015, hit.vz * hit.tHit);
            ring.scale.setScalar(scale * (0.95 + pulse * 0.10));
            innerDot.position.set(hit.vx * hit.tHit, 0.016, hit.vz * hit.tHit);

            arcMaterial.color.setHex(0xffd79a);
            ringMaterial.color.setHex(0xffd79a);
            arcMaterial.opacity = 0.22 + pulse * 0.10;
            ringMaterial.opacity = 0.28 + pulse * 0.14;
            group.visible = true;
        },
        update(target: Launch, stone: StoneSpec, sweetQuality: number) {
            const hit = computeFirstHit(target);
            if (!hit) {
                group.visible = false;
                return;
            }
            readyStoneRing.visible = false;
            const attr = arcGeometry.getAttribute('position') as THREE.BufferAttribute;
            for (let i = 0; i <= ARC_SEGMENTS; i++) {
                const t = (i / ARC_SEGMENTS) * hit.tHit;
                const x = hit.vx * t;
                const y = Math.max(0.012, hit.y0 + hit.vy * t - 0.5 * hit.g * t * t);
                const z = hit.vz * t;
                attr.setXYZ(i, x, y, z);
            }
            attr.needsUpdate = true;

            const hitX = hit.vx * hit.tHit;
            const hitZ = hit.vz * hit.tHit;
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
