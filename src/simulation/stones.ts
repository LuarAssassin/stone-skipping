export type StoneRarity = 'common' | 'usable' | 'fine' | 'rare';

export interface StoneSpec {
    id: string;
    archetypeId: string;
    name: string;
    rarity: StoneRarity;
    rarityLabel: string;
    feel: string;
    /** Semi-axes in metres: length a, width b, half-thickness h */
    a: number;
    b: number;
    h: number;
    mass: number;
    density: number;
    dragScale: number;
    wobble: number;
    roughness: number;
    colorHex: string;
    irregularity: number;
    seed: number;
    glbPath?: string;
    variant?: number;
    bestSkips?: number;
    bestDistance?: number;
}

export interface StoneArchetype {
    archetypeId: string;
    name: string;
    rarity: StoneRarity;
    rarityLabel: string;
    feel: string;
    a: number;
    b: number;
    h: number;
    mass: number;
    density: number;
    dragScale: number;
    wobble: number;
    roughness: number;
    colorHex: string;
    irregularity: number;
    glbPath?: string;
}

export interface ManifestStoneEntry {
    id: string;
    archetypeId: string;
    variant: number;
    name: string;
    rarity: StoneRarity;
    rarityLabel: string;
    feel: string;
    glbPath: string;
    a: number;
    b: number;
    h: number;
    volumeM3: number;
    density: number;
    mass: number;
    dragScale: number;
    wobble: number;
    roughness: number;
    colorHex: string;
    triangles: number;
    fileBytes: number;
}

export interface StoneManifest {
    version: number;
    generatedAt: string;
    count: number;
    stones: ManifestStoneEntry[];
}

/** Baseline stone matching exact original physical constants (80 × 60 × 9 mm, 59.94 g). */
export const STANDARD_STONE: Readonly<StoneSpec> = Object.freeze({
    id: 'standard-default',
    archetypeId: 'standard',
    name: '河岸标准扁石',
    rarity: 'usable',
    rarityLabel: '寻常',
    feel: '厚薄均衡，顺手耐打的经典河石。',
    a: 0.04,
    b: 0.03,
    h: 0.0045,
    mass: 0.05994,
    density: 2650,
    dragScale: 1.0,
    wobble: 0,
    roughness: 0.72,
    colorHex: '#686b68',
    irregularity: 0.06,
    seed: 271,
    glbPath: '/assets/stone.glb',
});

export const STONE_ARCHETYPES: readonly StoneArchetype[] = [
    {
        archetypeId: 'plunge_boulder',
        name: '重拳河卵石',
        rarity: 'common',
        rarityLabel: '钝石',
        feel: '圆肩饱满，整块压在掌心，入水时沉沉一声，水花高高翻起。',
        a: 0.038, b: 0.033, h: 0.024,
        mass: 0.344, density: 2680, dragScale: 1.48, wobble: 0.06,
        roughness: 0.65, colorHex: '#60534a', irregularity: 0.08,
        glbPath: '/assets/stones/plunge_boulder_01.glb',
    },
    {
        archetypeId: 'chunky_cobble',
        name: '圆滚鹅卵石',
        rarity: 'common',
        rarityLabel: '钝石',
        feel: '饱满沉甸，怕是难起漂，但砸进水里一定很响。',
        a: 0.029, b: 0.026, h: 0.016,
        mass: 0.138, density: 2650, dragScale: 1.38, wobble: 0.08,
        roughness: 0.56, colorHex: '#7d7167', irregularity: 0.08,
        glbPath: '/assets/stones/chunky_cobble_01.glb',
    },
    {
        archetypeId: 'jagged_gravel',
        name: '棱角碎石',
        rarity: 'common',
        rarityLabel: '钝石',
        feel: '边角磕碰、重心微偏，触水后脾气捉摸不定。',
        a: 0.037, b: 0.024, h: 0.0105,
        mass: 0.092, density: 2600, dragScale: 1.28, wobble: 0.24,
        roughness: 0.88, colorHex: '#807d79', irregularity: 0.24,
        glbPath: '/assets/stones/jagged_gravel_01.glb',
    },
    {
        archetypeId: 'standard',
        name: '河岸标准扁石',
        rarity: 'usable',
        rarityLabel: '寻常',
        feel: '厚薄均衡、边缘磨圆，最顺手的基准扁石。',
        a: 0.04, b: 0.03, h: 0.0045,
        mass: 0.05994, density: 2650, dragScale: 1.0, wobble: 0,
        roughness: 0.72, colorHex: '#686b68', irregularity: 0.06,
        glbPath: '/assets/stones/standard_01.glb',
    },
    {
        archetypeId: 'small_wafer',
        name: '小薄碎瓦片',
        rarity: 'usable',
        rarityLabel: '寻常',
        feel: '轻飘小巧，随手一甩就能跳，只是惯性小飞不远。',
        a: 0.028, b: 0.0225, h: 0.00275,
        mass: 0.022, density: 2400, dragScale: 1.04, wobble: 0.06,
        roughness: 0.78, colorHex: '#8d6e5e', irregularity: 0.12,
        glbPath: '/assets/stones/small_wafer_01.glb',
    },
    {
        archetypeId: 'thin_shale',
        name: '青灰薄页岩',
        rarity: 'fine',
        rarityLabel: '精良',
        feel: '极薄轻盈、升重比出色，适合打出密集连跳与薄水幕。',
        a: 0.042, b: 0.032, h: 0.0026,
        mass: 0.042, density: 2550, dragScale: 0.90, wobble: 0.02,
        roughness: 0.62, colorHex: '#526068', irregularity: 0.07,
        glbPath: '/assets/stones/thin_shale_01.glb',
    },
    {
        archetypeId: 'heavy_basalt',
        name: '玄武重圆饼',
        rarity: 'fine',
        rarityLabel: '精良',
        feel: '厚实压手、圆润对称，大力出手后陀螺稳如钟表。',
        a: 0.044, b: 0.0425, h: 0.0055,
        mass: 0.126, density: 2950, dragScale: 0.96, wobble: 0.0,
        roughness: 0.64, colorHex: '#3c4045', irregularity: 0.04,
        glbPath: '/assets/stones/heavy_basalt_01.glb',
    },
    {
        archetypeId: 'willow_leaf',
        name: '柳叶长扁石',
        rarity: 'fine',
        rarityLabel: '精良',
        feel: '狭长灵动，配合左右侧倾与切旋容易滑出飘逸弧线。',
        a: 0.052, b: 0.022, h: 0.00375,
        mass: 0.051, density: 2650, dragScale: 0.93, wobble: 0.03,
        roughness: 0.58, colorHex: '#6c7a7c', irregularity: 0.06,
        glbPath: '/assets/stones/willow_leaf_01.glb',
    },
    {
        archetypeId: 'master_disc',
        name: '溪磨黑曜圆盘',
        rarity: 'rare',
        rarityLabel: '稀珍',
        feel: '可遇不可求的轴对称薄圆盘，表面如玉顺滑，专为极限纪录而生。',
        a: 0.046, b: 0.044, h: 0.0031,
        mass: 0.076, density: 2750, dragScale: 0.78, wobble: 0.0,
        roughness: 0.42, colorHex: '#2f353d', irregularity: 0.025,
        glbPath: '/assets/stones/master_disc_01.glb',
    },
];

export const MAX_COLLECTION_SIZE = 8;

const STORAGE_KEY = 'stone-skipping-box-v1';

const IRREGULARITY_BY_ARCHETYPE = new Map(STONE_ARCHETYPES.map(a => [a.archetypeId, a.irregularity]));

function mulberry32(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function stoneFromManifestEntry(entry: ManifestStoneEntry, instanceSeed: number): StoneSpec {
    return {
        id: `${entry.id}-${(instanceSeed >>> 0).toString(36)}`,
        archetypeId: entry.archetypeId,
        variant: entry.variant,
        name: entry.name,
        rarity: entry.rarity,
        rarityLabel: entry.rarityLabel,
        feel: entry.feel,
        a: entry.a,
        b: entry.b,
        h: entry.h,
        mass: entry.mass,
        density: entry.density,
        dragScale: entry.dragScale,
        wobble: entry.wobble,
        roughness: entry.roughness,
        colorHex: entry.colorHex,
        irregularity: IRREGULARITY_BY_ARCHETYPE.get(entry.archetypeId) ?? 0.06,
        seed: instanceSeed >>> 0,
        glbPath: entry.glbPath,
    };
}

let cachedCatalog: ManifestStoneEntry[] | null = null;
let catalogPromise: Promise<ManifestStoneEntry[]> | null = null;

/** Load the 36 baked Blender stones from `/assets/stones/manifest.json` (with safe empty fallback). */
export function loadStoneManifest(url = '/assets/stones/manifest.json'): Promise<ManifestStoneEntry[]> {
    if (cachedCatalog) return Promise.resolve(cachedCatalog);
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
        try {
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = (await res.json()) as Partial<StoneManifest>;
            if (Array.isArray(data.stones) && data.stones.length > 0) {
                cachedCatalog = data.stones;
                return cachedCatalog;
            }
        } catch {
            // Fall back to procedural archetypes
        }
        return [];
    })();
    return catalogPromise;
}

export function instantiateStone(archetype: StoneArchetype, seed: number, exact = false): StoneSpec {
    const rng = mulberry32(seed);
    const scaleA = exact ? 1 : 0.93 + rng() * 0.14;
    const scaleB = exact ? 1 : 0.93 + rng() * 0.14;
    const scaleH = exact ? 1 : 0.91 + rng() * 0.18;
    const a = Number((archetype.a * scaleA).toFixed(5));
    const b = Number((archetype.b * scaleB).toFixed(5));
    const h = Number((archetype.h * scaleH).toFixed(5));
    const mass = Number((archetype.mass * scaleA * scaleB * scaleH).toFixed(5));
    return {
        id: exact ? `${archetype.archetypeId}-default` : `${archetype.archetypeId}-${seed.toString(36)}`,
        archetypeId: archetype.archetypeId,
        name: archetype.name,
        rarity: archetype.rarity,
        rarityLabel: archetype.rarityLabel,
        feel: archetype.feel,
        a, b, h, mass,
        density: archetype.density,
        dragScale: archetype.dragScale,
        wobble: archetype.wobble,
        roughness: archetype.roughness,
        colorHex: archetype.colorHex,
        irregularity: archetype.irregularity,
        seed,
        glbPath: archetype.glbPath,
    };
}

function pickWeighted<T>(items: readonly T[], weights: number[], rng: () => number): T {
    const total = weights.reduce((s, w) => s + w, 0);
    let target = rng() * total;
    for (let i = 0; i < items.length; i++) {
        target -= weights[i];
        if (target <= 0) return items[i];
    }
    return items[items.length - 1];
}

/** Generate naturally mixed riverbank stones (`count` defaults to 5 for unit compat, 16 for 3D shore).
 *  When the 36-stone Blender manifest is provided, every stone uses its exact baked GLB & measured physics. */
export function forageShoreStones(
    careerSkips = 0,
    seed = Math.floor(Math.random() * 0xffffffff),
    count = 5,
    catalog?: readonly ManifestStoneEntry[]
): StoneSpec[] {
    const rng = mulberry32(seed);
    const rareBonus = Math.min(0.10, careerSkips * 0.0010);
    const fineBonus = Math.min(0.14, careerSkips * 0.0016);

    const byRarity = <T extends { rarity: StoneRarity }>(list: readonly T[]) => ({
        common: list.filter(s => s.rarity === 'common'),
        usable: list.filter(s => s.rarity === 'usable'),
        fine: list.filter(s => s.rarity === 'fine'),
        rare: list.filter(s => s.rarity === 'rare'),
    });

    const useManifest = catalog && catalog.length > 0;
    const pools = useManifest ? byRarity(catalog) : byRarity(STONE_ARCHETYPES);

    const pickFrom = (rarity: StoneRarity): StoneSpec => {
        const pool = pools[rarity].length ? pools[rarity] : (useManifest ? catalog : STONE_ARCHETYPES);
        const item = pool[Math.floor(rng() * pool.length)];
        const itemSeed = (seed ^ Math.floor(rng() * 0xffffffff)) >>> 0;
        return useManifest
            ? stoneFromManifestEntry(item as ManifestStoneEntry, itemSeed)
            : instantiateStone(item as StoneArchetype, itemSeed);
    };

    const result: StoneSpec[] = [];
    // Guarantee realistic riverbank diversity: blunt rocks + usable skimmers + at least 1 quality find
    const guaranteed: StoneRarity[] = count >= 12
        ? ['common', 'common', 'common', 'common', 'usable', 'usable', 'usable', 'fine', 'fine']
        : ['common', 'usable', 'fine'];

    for (let i = 0; i < Math.min(count, guaranteed.length); i++) {
        result.push(pickFrom(guaranteed[i]));
    }

    const rarities: StoneRarity[] = ['common', 'usable', 'fine', 'rare'];
    const weights = [0.42, 0.30, 0.21 + fineBonus, 0.07 + rareBonus];
    while (result.length < count) {
        const chosenRarity = pickWeighted(rarities, weights, rng);
        result.push(pickFrom(chosenRarity));
    }

    // Shuffle spatial order so players judge thinness & silhouette with their own eyes
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function formatStoneDimensions(stone: StoneSpec): string {
    return `${Math.round(stone.a * 2000)} × ${Math.round(stone.b * 2000)} × ${(stone.h * 2000).toFixed(1)} mm · ${Math.round(stone.mass * 1000)} g`;
}

interface StoredCollection {
    stones: StoneSpec[];
    equippedId: string;
    careerSkips: number;
}

export class StoneBox {
    stones: StoneSpec[] = [{ ...STANDARD_STONE }];
    equippedId: string = STANDARD_STONE.id;
    careerSkips = 0;
    /** Temporary stone picked from shore for a single try (not yet saved in collection). */
    ephemeral?: StoneSpec;

    constructor(persist = true) {
        if (persist) this.load();
    }

    get equipped(): StoneSpec {
        if (this.ephemeral) return this.ephemeral;
        return this.stones.find(s => s.id === this.equippedId) ?? this.stones[0] ?? { ...STANDARD_STONE };
    }

    get isUsingEphemeral(): boolean {
        return this.ephemeral !== undefined;
    }

    equipSaved(id: string): StoneSpec | undefined {
        const found = this.stones.find(s => s.id === id);
        if (!found) return undefined;
        this.ephemeral = undefined;
        this.equippedId = found.id;
        this.save();
        return found;
    }

    equipEphemeral(stone: StoneSpec) {
        this.ephemeral = { ...stone };
    }

    collect(stone: StoneSpec): { ok: boolean; reason?: string } {
        if (this.stones.some(s => s.id === stone.id)) {
            this.equipSaved(stone.id);
            return { ok: true };
        }
        if (this.stones.length >= MAX_COLLECTION_SIZE) {
            return { ok: false, reason: `石匣已满（最多 ${MAX_COLLECTION_SIZE} 块），请先放回一块` };
        }
        const copy = { ...stone };
        this.stones.push(copy);
        this.ephemeral = undefined;
        this.equippedId = copy.id;
        this.save();
        return { ok: true };
    }

    remove(id: string): boolean {
        if (this.stones.length <= 1) return false;
        const idx = this.stones.findIndex(s => s.id === id);
        if (idx < 0) return false;
        this.stones.splice(idx, 1);
        if (this.equippedId === id) {
            this.equippedId = this.stones[0].id;
        }
        this.save();
        return true;
    }

    recordResult(stoneId: string, skips: number, distance: number) {
        this.careerSkips += Math.max(0, skips);
        const saved = this.stones.find(s => s.id === stoneId);
        if (saved) {
            if (skips > (saved.bestSkips ?? 0) || (skips === (saved.bestSkips ?? 0) && distance > (saved.bestDistance ?? 0))) {
                saved.bestSkips = skips;
                saved.bestDistance = Number(distance.toFixed(2));
            }
        }
        this.save();
    }

    private load() {
        try {
            if (typeof localStorage === 'undefined') return;
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<StoredCollection>;
            if (Array.isArray(parsed.stones) && parsed.stones.length > 0) {
                this.stones = parsed.stones.slice(0, MAX_COLLECTION_SIZE);
                this.equippedId = typeof parsed.equippedId === 'string' && this.stones.some(s => s.id === parsed.equippedId)
                    ? parsed.equippedId
                    : this.stones[0].id;
            }
            if (Number.isFinite(parsed.careerSkips)) {
                this.careerSkips = Math.max(0, Math.floor(parsed.careerSkips!));
            }
        } catch {
            // ignore corrupted storage
        }
    }

    private save() {
        try {
            if (typeof localStorage === 'undefined') return;
            const payload: StoredCollection = {
                stones: this.stones,
                equippedId: this.equippedId,
                careerSkips: this.careerSkips,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // ignore storage errors
        }
    }
}
