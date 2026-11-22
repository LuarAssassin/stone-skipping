import * as THREE from 'three';
import type { Contact } from '../simulation/physics';

const MAX_VISIBLE_MARKERS = 18;

/** Projects bounced water-contact points into clean, uncluttered diegetic HUD markers. */
export function createBounceMarkers() {
    const layer = document.createElement('div');
    layer.id = 'bounce-markers';
    layer.setAttribute('aria-hidden', 'true');
    document.querySelector('#app')!.append(layer);

    const pool: HTMLDivElement[] = [];
    for (let i = 0; i < MAX_VISIBLE_MARKERS; i++) {
        const el = document.createElement('div');
        el.className = 'bounce-marker';
        el.innerHTML = '<span class="bounce-dot"></span><span class="bounce-num"></span>';
        layer.append(el);
        pool.push(el);
    }

    const projected = new THREE.Vector3();
    let enabled = true;

    return {
        setEnabled(value: boolean) {
            enabled = value;
            layer.style.display = value ? '' : 'none';
        },
        update(
            contacts: readonly Contact[],
            camera: THREE.PerspectiveCamera,
            width: number,
            height: number,
            visualTime: number
        ) {
            if (!enabled || width <= 0 || height <= 0) {
                for (const el of pool) el.style.opacity = '0';
                return;
            }

            const bounced: { skipNumber: number; contact: Contact }[] = [];
            let skipIndex = 0;
            for (const c of contacts) {
                if (c.bounced) {
                    skipIndex++;
                    bounced.push({ skipNumber: skipIndex, contact: c });
                }
            }

            // Show the most recent bounces first while avoiding overlapping screen clutter
            const placed: { x: number; y: number }[] = [];
            let used = 0;

            for (let i = bounced.length - 1; i >= 0 && used < MAX_VISIBLE_MARKERS; i--) {
                const { skipNumber, contact } = bounced[i];
                const age = visualTime - (contact.end ?? contact.time);
                const fadeOut = Math.max(0, 1 - Math.max(0, age - 2.6) / 1.8);
                if (fadeOut <= 0.02) continue;

                projected.set(contact.point.x, 0.05, contact.point.z).project(camera);
                if (projected.z < -1 || projected.z > 1) continue;

                const sx = (projected.x * 0.5 + 0.5) * width;
                const sy = (-projected.y * 0.5 + 0.5) * height;
                if (sx < 24 || sx > width - 24 || sy < 48 || sy > height - 80) continue;

                if (placed.some(p => Math.hypot(p.x - sx, p.y - sy) < 28)) continue;
                placed.push({ x: sx, y: sy });

                const el = pool[used++];
                const fadeIn = Math.min(1, Math.max(0, age) / 0.12);
                const rise = Math.min(14, Math.max(0, age) * 16);
                el.style.transform = `translate3d(${sx.toFixed(1)}px, ${(sy - rise).toFixed(1)}px, 0)`;
                el.style.opacity = (fadeIn * fadeOut * 0.88).toFixed(3);
                el.querySelector('.bounce-num')!.textContent = String(skipNumber);
            }

            for (let i = used; i < pool.length; i++) {
                pool[i].style.opacity = '0';
            }
        },
    };
}
