export type GraphicsTier = 'high' | 'balanced' | 'low';
export type GraphicsMode = 'auto' | GraphicsTier;

export interface GraphicsQuality {
    tier: GraphicsTier;
    pixelRatio: number;
}

export const GRAPHICS_LABELS: Record<GraphicsTier, string> = {
    high: '高画质', balanced: '均衡', low: '流畅',
};

const QUALITY_STEPS: readonly GraphicsQuality[] = [
    { tier: 'high', pixelRatio: 2 },
    { tier: 'high', pixelRatio: 1.5 },
    { tier: 'high', pixelRatio: 1.25 },
    { tier: 'high', pixelRatio: 1 },
    { tier: 'balanced', pixelRatio: 1 },
    { tier: 'low', pixelRatio: 1 },
];

export function automaticQualities(nativeRatio: number) {
    return QUALITY_STEPS.filter((step, index) => {
        const previous = QUALITY_STEPS[index - 1];
        return !previous || step.tier !== previous.tier || step.pixelRatio < nativeRatio;
    });
}

export function manualQuality(tier: GraphicsTier): GraphicsQuality {
    return tier === 'high' ? QUALITY_STEPS[0] : { tier, pixelRatio: tier === 'balanced' ? 1.25 : 1 };
}

const STORAGE_KEY = 'stone-skipping-graphics-v1';
const AUTOMATIC_STORAGE_KEY = 'stone-skipping-auto-graphics-v1';

export function loadAutomaticQuality(nativeRatio: number, mobile: boolean): GraphicsQuality {
    try {
        const saved = JSON.parse(localStorage.getItem(AUTOMATIC_STORAGE_KEY) ?? 'null');
        if (saved?.nativeRatio === nativeRatio && saved?.mobile === mobile) {
            const quality = automaticQualities(nativeRatio).find(step => step.tier === saved.tier && step.pixelRatio === saved.pixelRatio);
            if (quality) return quality;
        }
    } catch { /* Use the default when storage is unavailable or invalid. */ }
    return manualQuality(mobile ? 'low' : 'high');
}

export function saveAutomaticQuality(quality: GraphicsQuality, nativeRatio: number, mobile: boolean) {
    try { localStorage.setItem(AUTOMATIC_STORAGE_KEY, JSON.stringify({ ...quality, nativeRatio, mobile })); }
    catch { /* Storage may be unavailable. */ }
}

export function loadGraphicsMode(): GraphicsMode {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'high' || saved === 'balanced' || saved === 'low') return saved;
    } catch { /* Storage may be unavailable. */ }
    return 'auto';
}

export function saveGraphicsMode(mode: GraphicsMode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* Storage may be unavailable. */ }
}

/** Require sustained frame pressure for a downgrade and sustained work for an upgrade. */
export class FrameBudget {
    private sampleMs = 0;
    private frames = 0;
    private slowMs = 0;
    private slowFrames = 0;
    private fastThrowMs = 0;
    private upgradesAfter = 0;

    reset() {
        this.resetWindow();
        this.fastThrowMs = 0;
    }

    private resetWindow() {
        this.sampleMs = this.frames = this.slowMs = this.slowFrames = 0;
    }

    sample(ms: number, throwing: boolean, now: number): -1 | 0 | 1 {
        if (!Number.isFinite(ms) || ms <= 0) return 0;
        const duration = Math.min(ms, 100);
        this.sampleMs += duration;
        this.frames++;
        if (ms > 23) {
            this.slowMs += duration;
            this.slowFrames++;
            this.fastThrowMs = Math.max(0, this.fastThrowMs - duration * 4);
        } else if (throwing && ms <= 18.5 && now >= this.upgradesAfter) {
            this.fastThrowMs += duration;
            if (this.fastThrowMs >= 10_000) {
                this.reset();
                this.upgradesAfter = now + 20_000;
                return -1;
            }
        }
        if (this.sampleMs >= 1500 && this.frames >= 12) {
            const slow = this.slowMs >= this.sampleMs * 0.58 && this.slowFrames >= this.frames / 3;
            this.resetWindow();
            if (slow) {
                this.fastThrowMs = 0;
                this.upgradesAfter = now + 20_000;
                return 1;
            }
        }
        return 0;
    }
}
