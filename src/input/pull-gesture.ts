import type { Launch } from '../simulation/physics';
import { normalizePoint, type GesturePoint, type GestureRect } from './gesture';

export const MIN_PULL_DISTANCE = 0.032;
export const MIN_HOLD_FALLBACK_MS = 160;
export const MAX_PULL_DISTANCE = 0.38;
export const SWEET_SPOT_MIN = 0.70;
export const SWEET_SPOT_MAX = 0.92;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export interface PullPreview {
    target: Launch;
    power: number;
    duration: number;
    wristCursor: number;
    sweetQuality: number;
    temperatureScale: number;
    isPullActive: boolean;
}

/** Intuitive pull-back & release lake gesture with dynamic wrist-snap sweet spot.
 *  - Pull down (back): smoothly scales launch speed from 6.5 to 25.5 m/s
 *  - Drag left / right: directly steers horizontal direction (-35°..35°)
 *  - Wrist cursor: glides back-and-forth while charged; releasing in the golden sweet-spot
 *    maximizes wrist spin and tightens release jitter without altering physics rules. */
export class PullThrowGesture {
    private active?: {
        id: number;
        rect: GestureRect;
        origin: { x: number; y: number };
        point: { x: number; y: number };
        start: number;
        time: number;
        base: Launch;
    };

    get pointerId() {
        return this.active?.id;
    }

    begin(event: GesturePoint, rect: GestureRect, base: Launch): boolean {
        if (this.active || rect.width <= 0 || rect.height <= 0) return false;
        const point = normalizePoint(event, rect);
        this.active = {
            id: event.pointerId,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            origin: point,
            point,
            start: event.timeStamp,
            time: event.timeStamp,
            base: { ...base },
        };
        return true;
    }

    move(event: GesturePoint) {
        if (!this.active || this.active.id !== event.pointerId) return;
        this.active.point = normalizePoint(event, this.active.rect);
        this.active.time = Math.max(this.active.time, event.timeStamp);
    }

    preview(timeStamp: number): PullPreview | undefined {
        const active = this.active;
        if (!active) return undefined;
        const duration = Math.max(0, Math.max(active.time, timeStamp) - active.start);
        const pullY = Math.max(0, active.point.y - active.origin.y);
        const dx = active.point.x - active.origin.x;

        // Primary control: pull-back distance; fallback: gentle hold charge if user doesn't drag down
        const pullPower = clamp(pullY / MAX_PULL_DISTANCE, 0, 1);
        const holdFallback = clamp((duration - 140) / 1500, 0, 0.58);
        const power = pullY >= MIN_PULL_DISTANCE ? pullPower : Math.max(pullPower, holdFallback);
        const isPullActive = pullY >= MIN_PULL_DISTANCE || duration >= MIN_HOLD_FALLBACK_MS;

        // Smooth ping-pong wrist snap rhythm (period ~1.15s)
        const phase = ((duration / 1000) * 1.45) % 2;
        const rawTriangle = phase <= 1 ? phase : 2 - phase;
        // Slight ease at ends for natural wrist feel
        const wristCursor = 0.5 - 0.5 * Math.cos(rawTriangle * Math.PI);

        // Sweet-spot quality [0..1] peaks inside [0.70..0.92]
        const sweetCenter = (SWEET_SPOT_MIN + SWEET_SPOT_MAX) * 0.5;
        const sweetHalf = (SWEET_SPOT_MAX - SWEET_SPOT_MIN) * 0.5;
        const sweetDist = Math.abs(wristCursor - sweetCenter);
        const sweetQuality = power > 0.12 ? clamp(1 - Math.max(0, sweetDist - sweetHalf * 0.45) / (sweetHalf * 1.15), 0, 1) : 0;

        // Launch speed 6.5 .. 25.5 m/s (covers gentle drops up to pro long-course throws!)
        const speed = 6.5 + 19.0 * Math.pow(power, 1.05);
        const direction = clamp(active.base.direction + dx * 68, -35, 35);

        // Preserve player's chosen spin sign (+1 or -1); scale spin naturally with power & wrist sweet-spot
        const spinSign = active.base.spin < 0 ? -1 : 1;
        const spinMag = (12 + 28 * power) * (0.74 + 0.34 * sweetQuality);
        const spin = spinSign * Number(spinMag.toFixed(1));

        // Releasing in the sweet spot gives a steadier hand (lower effective temperature)
        const temperatureScale = 1 - 0.55 * sweetQuality;

        const target: Launch = {
            ...active.base,
            speed: Number(speed.toFixed(2)),
            direction: Number(direction.toFixed(1)),
            spin,
        };

        return { target, power, duration, wristCursor, sweetQuality, temperatureScale, isPullActive };
    }

    release(event: GesturePoint): PullPreview | undefined {
        if (this.active?.id !== event.pointerId) return undefined;
        this.move(event);
        const preview = this.preview(event.timeStamp);
        this.cancel();
        return preview && preview.isPullActive ? preview : undefined;
    }

    cancel() {
        this.active = undefined;
    }
}
