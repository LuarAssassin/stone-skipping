import { PerspectiveCamera, Vector3 } from 'three';
export type ViewMode = 'overview' | 'follow';
export interface OverviewSettings {
    height: number;
    distance: number;
    azimuth: number;
    target: number;
    fov: number;
}
export const DEFAULT_VIEW: Readonly<OverviewSettings> = Object.freeze({
    height: 9, distance: 9, azimuth: 18, target: 6, fov: 48,
});
export interface Pose {
    position: Vector3;
    target: Vector3;
    fov: number;
}
export function cameraPose(view: ViewMode, settings: OverviewSettings, stone: Vector3, orbit?: number): Pose {
    if (orbit !== undefined) {
        const angle = orbit * 0.65 + Math.PI * 0.8;
        const radius = 0.9 + 0.15 * Math.sin(orbit * 0.4);
        return {
            position: new Vector3(stone.x + Math.cos(angle) * radius, Math.max(0.16, stone.y + 0.22 + 0.07 * Math.sin(orbit * 0.7)), stone.z + Math.sin(angle) * radius),
            target: new Vector3(stone.x, Math.max(0.025, stone.y), stone.z),
            fov: 44,
        };
    }
    if (view === 'follow')
        return {
            position: new Vector3(stone.x - 1.4, Math.max(0.4, stone.y + 0.8), stone.z + 1.8),
            target: new Vector3(stone.x + 0.5, Math.max(0.03, stone.y), stone.z),
            fov: 48,
        };
    const angle = settings.azimuth * Math.PI / 180;
    return {
        position: new Vector3(-settings.distance * Math.cos(angle), settings.height, settings.distance * Math.sin(angle)),
        target: new Vector3(settings.target, 0, 0),
        fov: settings.fov,
    };
}
export function blendPose(current: Pose, target: Pose, seconds: number): Pose {
    const alpha = 1 - Math.exp(-Math.max(0, seconds) * 5);
    return {
        position: current.position.clone().lerp(target.position, alpha),
        target: current.target.clone().lerp(target.target, alpha),
        fov: current.fov + (target.fov - current.fov) * alpha,
    };
}
export class CameraRig {
    view: ViewMode = 'overview';
    settings = { ...DEFAULT_VIEW };
    private pose = cameraPose(this.view, this.settings, new Vector3());
    private bulletStart?: number;
    private wasBullet = false;
    reset() { this.settings = { ...DEFAULT_VIEW }; }
    update(camera: PerspectiveCamera, stone: Vector3, time: number, bullet: boolean, seconds: number, paused: boolean) {
        if (bullet && !this.wasBullet)
            this.bulletStart = time;
        if (bullet && time < (this.bulletStart ?? 0))
            this.bulletStart = time;
        const changed = bullet !== this.wasBullet;
        this.wasBullet = bullet;
        const goal = cameraPose(this.view, this.settings, stone, bullet ? time - (this.bulletStart ?? time) : undefined);
        this.pose = blendPose(this.pose, goal, paused && bullet && !changed ? 0 : seconds);
        this.pose.position.y = Math.max(0.12, this.pose.position.y);
        camera.position.copy(this.pose.position);
        camera.lookAt(this.pose.target);
        camera.fov = this.pose.fov;
        camera.updateProjectionMatrix();
    }
}
