import type * as THREE from 'three';
import type { Session } from './session';
import type { CameraRig } from '../camera/rig';
import type { createWorld } from '../rendering/world';
import type { createFeedback } from '../rendering/feedback';
import type { Launch } from '../simulation/physics';

export interface DevReviewDeps {
    session: Session;
    rig: CameraRig;
    world: ReturnType<typeof createWorld>;
    feedback: ReturnType<typeof createFeedback>;
    setMarkersEnabled(enabled: boolean): void;
    parameters: Launch;
    longLaunch: Launch;
}

/** Development-only inspection hooks (`window.waterReview`, `?reference=`, `?audit=`, `?benchmark=`). */
export function setupDevReview(deps: DevReviewDeps) {
    const { session, rig, world, feedback, setMarkersEnabled, parameters, longLaunch } = deps;
    const { camera, renderer } = world;

    const review = {
        session,
        rig,
        world,
        feedback,
        side: false,
        errors: [] as string[],
        frames: [] as { raf: number; cpu: number }[],
        inspect(time: number, single = true) {
            session.diagnosticContact = single ? 0 : undefined;
            session.replay();
            session.advance(time);
            session.paused = true;
            this.side = true;
            this.render();
        },
        sideCamera() {
            const contact = session.sim.contacts[0];
            if (!contact) return;
            const point = [contact.point.x, 0, contact.point.z];
            camera.position.set(point[0] + .09, .115, point[2] + .48);
            camera.lookAt(point[0] + .09, .018, point[2]);
            camera.fov = 38;
            camera.updateProjectionMatrix();
        },
        variant(seed: number) {
            if (!session.snapshot) return;
            const time = session.visualTime;
            session.replay({
                ...session.snapshot,
                visual: { ...(session.snapshot.visual ?? { surface: .35, sheet: .8, breakup: 1.1 }), seed },
            });
            session.advance(time);
            session.paused = true;
            document.querySelector<HTMLTextAreaElement>('#snapshot')!.value = JSON.stringify(session.snapshot, null, 2);
            document.querySelector('#launch-summary')!.textContent =
                `physical seed ${session.snapshot!.seed} · T=${session.snapshot!.temperature} · visual ${seed}`;
            this.render();
        },
        programs() {
            const gl = renderer.getContext();
            return renderer.info.programs?.map(program => ({
                name: program.name,
                linked: gl.getProgramParameter(program.program, gl.LINK_STATUS),
            }));
        },
        render() {
            feedback.update(session, false);
            world.waterField.setTime(session.presentationTime);
            world.sunset.update(session.presentationTime);
            rig.update(camera, session.sim.p, session.presentationTime, session.mode === 'bullet', 1, true, session.sim.contacts);
            if (this.side) this.sideCamera();
            world.post.render(session.presentationTime);
        },
    };

    let isReferenceMode = false;

    if (import.meta.env.DEV) {
        Object.assign(window, {
            waterReview: Object.assign(review, {
                surfaceOnly(enabled: boolean) {
                    world.waterField.mesh.material.uniforms.surfaceInspection.value = enabled ? 1 : 0;
                    world.post.setBypass(enabled);
                    setMarkersEnabled(!enabled);
                },
                calibrationBed(enabled: boolean) {
                    world.setCalibrationBed(enabled);
                },
            }),
        });
        renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
            review.errors.push([
                gl.getProgramInfoLog(program),
                gl.getShaderInfoLog(vertex),
                gl.getShaderInfoLog(fragment),
            ].join('\n'));
            if (review.errors.length > 32) review.errors.shift();
        };

        const query = new URLSearchParams(location.search);
        const time = Number(query.get('reference'));
        if (query.has('reference') && Number.isFinite(time) && time >= 0 && time <= 6) {
            isReferenceMode = true;
            document.body.classList.add('reference-mode');
            setMarkersEnabled(false);
            session.start(query.has('long') ? longLaunch : parameters, 0);
            session.replay({ ...session.snapshot!, seed: 271 });
            if (query.has('grouped')) {
                const groups = [.003, .031, .007];
                let i = 0;
                while (session.visualTime < time - 1e-8) {
                    session.advance(Math.min(groups[i++ % groups.length], time - session.visualTime));
                    feedback.update(session, false);
                }
            } else {
                session.advance(time);
            }
            session.paused = true;
            review.side = true;
            world.spray.mesh.visible = query.get('spray') !== 'off';
            if (query.get('sheet') === 'off') world.spray.sheets.visible = false;
            review.sideCamera = () => {
                const c = query.has('long') ? session.sim.contacts.at(-1) : session.sim.contacts[0];
                if (!c) return;
                camera.position.set(c.point.x + .3, .32, c.point.z + 1.6);
                camera.lookAt(c.point.x + .3, .045, c.point.z);
                camera.fov = 48;
                camera.updateProjectionMatrix();
            };
        }

        if (query.has('audit')) {
            review.render();
            const g = world.waterField.solver.grid;
            const data = world.waterField.solver.read(renderer);
            let peak = 0, farPeak = 0, finite = true, hash = 2166136261;
            for (const byte of new Uint8Array(data.buffer)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
            for (let i = 0; i < data.length; i += 4) {
                const h = data[i];
                finite = finite && Number.isFinite(h);
                peak = Math.max(peak, Math.abs(h));
                if ((i / 4 % g.width + .5) * g.dx > 16) farPeak = Math.max(farPeak, Math.abs(h));
            }
            const node = document.createElement('script');
            node.type = 'application/json';
            node.id = 'water-audit';
            node.textContent = JSON.stringify({
                grid: g, hash, peak, farPeak, finite,
                glError: renderer.getContext().getError(),
                programs: review.programs(),
                errors: review.errors,
                skips: session.sim.skips,
                position: session.sim.p.toArray(),
                ribbons: session.spray.ribbons.length,
                drops: session.spray.drops.length,
            });
            document.body.append(node);
        }
    }

    const benchmarkEnabled = import.meta.env.DEV && new URLSearchParams(location.search).has('benchmark');

    return {
        review,
        isReferenceMode,
        resetFrames() {
            if (import.meta.env.DEV) review.frames = [];
        },
        recordFrame(raf: number, cpu: number) {
            if (!import.meta.env.DEV) return;
            review.frames.push({ raf, cpu });
            if (review.frames.length > 600) review.frames.shift();
            if (benchmarkEnabled && session.sim.ended) {
                let node = document.querySelector<HTMLScriptElement>('#water-performance');
                if (!node) {
                    node = document.createElement('script');
                    node.type = 'application/json';
                    node.id = 'water-performance';
                    document.body.append(node);
                    const values = review.frames.map(f => f.raf).sort((a, b) => a - b);
                    node.textContent = JSON.stringify({
                        frames: values.length,
                        mean: values.reduce((a, b) => a + b, 0) / values.length,
                        p95: values[Math.floor(values.length * .95)],
                        max: values.at(-1),
                        skips: session.sim.skips,
                        distance: Math.hypot(session.sim.p.x, session.sim.p.z),
                    });
                }
            }
        },
        applySideCamera(cam: THREE.PerspectiveCamera) {
            if (import.meta.env.DEV && review.side) {
                void cam;
                review.sideCamera();
            }
        },
    };
}
