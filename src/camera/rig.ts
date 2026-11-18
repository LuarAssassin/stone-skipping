import { PerspectiveCamera, Vector3 } from 'three';
export type ViewMode = 'overview' | 'follow' | 'course';
export interface OverviewSettings {
    height: number;
    distance: number;
    azimuth: number;
    target: number;
    fov: number;
}
export const DEFAULT_VIEW: Readonly<OverviewSettings> = Object.freeze({
    height: 2.1, distance: 2.4, azimuth: 18, target: 2.8, fov: 42,
});
export interface Pose {
    position: Vector3;
    target: Vector3;
    fov: number;
}
interface CourseFraming { direction: number; aspect: number; earlier?: Vector3 }
export function cameraPose(view: ViewMode, settings: OverviewSettings, stone: Vector3, orbit?: number, course?: CourseFraming): Pose {
    if (orbit !== undefined) {
        const angle = orbit * 0.65 + Math.PI * 0.8;
        const radius = 0.9 + 0.15 * Math.sin(orbit * 0.4);
        return {
            position: new Vector3(stone.x + Math.cos(angle) * radius, Math.max(0.16, stone.y + 0.22 + 0.07 * Math.sin(orbit * 0.7)), stone.z + Math.sin(angle) * radius),
            target: new Vector3(stone.x, Math.max(0.025, stone.y), stone.z),
            fov: 44,
        };
    }
    if (view === 'course') {
        const angle=(course?.direction??0)*Math.PI/180;
        const along=new Vector3(Math.cos(angle),0,Math.sin(angle));
        const earlier=course?.earlier;
        const span=earlier ? Math.max(2.2,Math.min(7,along.dot(stone.clone().sub(earlier)))) : 3.8;
        const side=new Vector3(-along.z,0,along.x);
        const target=stone.clone().addScaledVector(along,-.46*span).setY(.035+.16*Math.max(0,stone.y));
        const distance=(1.65+.76*span)*Math.max(1,1.25/Math.max(.4,course?.aspect??1.4));
        const position=target.clone().addScaledVector(along,-.59*distance).addScaledVector(side,.81*distance);
        position.y=.28+.26*distance;
        return {position,target,fov:46};
    }
    if (view === 'follow')
        return {
            position: new Vector3(stone.x - 1.4, Math.max(0.4, stone.y + 0.8), stone.z + 1.8),
            target: new Vector3(stone.x + 0.2, Math.max(0.03, stone.y), stone.z),
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
    private lastStone?:Vector3;
    private tracking=false;
    private direction=0;
    beginThrow(stone:Vector3,bullet=false,direction=0,aspect=1.4){
        this.direction=direction;
        this.tracking=bullet||this.view!=='overview';
        this.lastStone=stone.clone();
        if(this.tracking)this.pose=cameraPose(this.view,this.settings,stone,bullet?0:undefined,{direction,aspect});
    }
    reset() { this.settings = { ...DEFAULT_VIEW }; }
    update(camera: PerspectiveCamera, stone: Vector3, time: number, bullet: boolean, seconds: number, paused: boolean, contacts: readonly {point: Vector3}[] = []) {
        if (bullet && !this.wasBullet)
            this.bulletStart = time;
        if (bullet && time < (this.bulletStart ?? 0))
            this.bulletStart = time;
        const changed = bullet !== this.wasBullet;
        this.wasBullet = bullet;
        const tracking=bullet||this.view!=='overview';
        // Smooth the relative camera offset, not the stone's world translation.
        // Otherwise a 24 m/s throw leaves a 4.8 m chase lag at smoothing rate 5.
        if(tracking&&this.tracking&&this.lastStone){
            const translation=stone.clone().sub(this.lastStone);
            if(this.view==='course'&&!bullet)translation.y=0;
            this.pose.position.add(translation);this.pose.target.add(translation);
        }
        this.lastStone=stone.clone();this.tracking=tracking;
        const earlier=contacts[Math.max(0,contacts.length-4)]?.point;
        const goal = cameraPose(this.view, this.settings, stone, bullet ? time - (this.bulletStart ?? time) : undefined,
            {direction:this.direction,aspect:camera.aspect,earlier});
        this.pose = blendPose(this.pose, goal, paused && bullet && !changed ? 0 : seconds);
        this.pose.position.y = Math.max(0.12, this.pose.position.y);
        camera.position.copy(this.pose.position);
        camera.lookAt(this.pose.target);
        camera.fov = this.pose.fov;
        camera.updateProjectionMatrix();
    }
}
