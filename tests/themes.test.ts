import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    DEFAULT_THEME_ID,
    SCENE_THEMES,
    getSceneTheme,
    themeSunDirection,
} from '../src/rendering/themes';
import {
    DEFAULT_WEATHER_ID,
    WEATHER_PRESETS,
    getWeatherPreset,
} from '../src/rendering/weather';
import {
    buildJiangnanPlacements,
    getPlacementsForPack,
    type ScenePackId,
} from '../src/rendering/scene-packs';

test('scene theme registry exposes sunset as default and registers all differentiated worlds', () => {
    assert.equal(DEFAULT_THEME_ID, 'sunset');
    assert.ok(SCENE_THEMES.length >= 13, 'expected 10 global 3D worlds + 3 pure atmospheric themes');

    const ids = new Set<string>();
    for (const theme of SCENE_THEMES) {
        assert.ok(!ids.has(theme.id), `duplicate theme id: ${theme.id}`);
        ids.add(theme.id);
        assert.ok(theme.name.length > 0);
        assert.ok(theme.subtitle.length > 0);
        assert.equal(theme.mountains.length, 3);
        const dir = themeSunDirection(theme);
        assert.ok(Math.abs(dir.length() - 1) < 1e-6);
        assert.ok(dir.y > 0, `${theme.id} sun/moon should stay above horizon`);
    }

    assert.equal(getSceneTheme('sunset').id, 'sunset');
    assert.equal(getSceneTheme('jiangnan_lotus').scenePack, 'jiangnan');
    assert.equal(getSceneTheme('jiangnan_lotus').horizonStyle, 'open_sea');
    assert.equal(getSceneTheme('tahoe_alpine').scenePack, 'tahoe');
    assert.equal(getSceneTheme('kyoto_autumn').scenePack, 'kyoto');
    assert.equal(getSceneTheme('nordic_aurora').scenePack, 'nordic');
    assert.equal(getSceneTheme('nordic_aurora').auroraStrength, 1.0);
    assert.equal(getSceneTheme('tropical_lagoon').scenePack, 'lagoon');
    assert.equal(getSceneTheme('zhangjiajie_peaks').scenePack, 'zhangjiajie');
    assert.equal(getSceneTheme('fuji_kawaguchi').scenePack, 'fuji');
    assert.equal(getSceneTheme('venice_lagoon').scenePack, 'venice');
    assert.equal(getSceneTheme('venice_lagoon').horizonStyle, 'open_sea');
    assert.equal(getSceneTheme('venice_lagoon').horizonPanorama?.textureUrl, '/assets/horizons/venice_skyline.webp');
    for (const theme of SCENE_THEMES) {
        if (theme.horizonPanorama) {
            const rel = theme.horizonPanorama.textureUrl.replace(/^\/+/, '');
            const st = statSync(resolve('public', rel));
            assert.ok(st.size > 20_000, `[${theme.id}] horizonPanorama ${rel} unexpectedly small (${st.size} bytes)`);
        }
    }
    assert.equal(getSceneTheme('tropical_lagoon').horizonStyle, 'open_sea');
    assert.equal(getSceneTheme('tropical_lagoon').horizonPanorama?.textureUrl, '/assets/horizons/lagoon_skyline.webp');
    assert.equal(getSceneTheme('nile_sunset').horizonStyle, 'open_sea');
    assert.equal(getSceneTheme('nile_sunset').horizonPanorama?.textureUrl, '/assets/horizons/nile_skyline.webp');
    assert.equal(getSceneTheme('swiss_alps').horizonPanorama?.textureUrl, '/assets/horizons/alps_skyline.webp');
    assert.equal(getSceneTheme('tahoe_alpine').horizonPanorama?.textureUrl, '/assets/horizons/tahoe_skyline.webp');
    assert.equal(getSceneTheme('nordic_aurora').horizonPanorama?.textureUrl, '/assets/horizons/nordic_skyline.webp');
    assert.equal(getSceneTheme('zhangjiajie_peaks').horizonStyle, 'open_sea');
    assert.equal(getSceneTheme('zhangjiajie_peaks').horizonPanorama?.textureUrl, '/assets/horizons/zhangjiajie_skyline.webp');
    assert.equal(getSceneTheme('fuji_kawaguchi').horizonStyle, 'open_sea');
    assert.equal(getSceneTheme('fuji_kawaguchi').horizonPanorama?.textureUrl, '/assets/horizons/fuji_skyline.webp');
    assert.equal(getSceneTheme('kyoto_autumn').horizonPanorama?.textureUrl, '/assets/horizons/kyoto_skyline.webp');
    assert.equal(getSceneTheme('jiangnan_lotus').horizonPanorama?.textureUrl, '/assets/horizons/jiangnan_skyline.webp');
    assert.equal(getSceneTheme('swiss_alps').scenePack, 'alps');
    assert.equal(getSceneTheme('nile_sunset').scenePack, 'nile');
    assert.equal(getSceneTheme('nonexistent').id, DEFAULT_THEME_ID);
});

test('weather registry exposes clear, mist, rain, and fireflies with valid optical bounds', () => {
    assert.equal(DEFAULT_WEATHER_ID, 'clear');
    const ids = new Set(WEATHER_PRESETS.map(w => w.id));
    for (const expected of ['clear', 'mist', 'rain', 'fireflies'] as const) {
        assert.ok(ids.has(expected), `missing weather preset ${expected}`);
    }
    for (const preset of WEATHER_PRESETS) {
        assert.ok(preset.fogNearScale > 0 && preset.fogNearScale <= 1);
        assert.ok(preset.fogFarScale > 0 && preset.fogFarScale <= 1);
        assert.ok(preset.rainIntensity >= 0 && preset.rainIntensity <= 1);
        assert.ok(preset.sunDim > 0 && preset.sunDim <= 1);
    }
    assert.ok(getWeatherPreset('rain').rainIntensity > 0.5);
    assert.equal(getWeatherPreset('unknown').id, DEFAULT_WEATHER_ID);
});

test('every registered 3D scene pack keeps throwing corridor and shore foraging zone completely unobstructed', () => {
    const packs: ScenePackId[] = [
        'jiangnan', 'tahoe', 'kyoto', 'nordic', 'lagoon',
        'fuji', 'zhangjiajie', 'venice', 'alps', 'nile',
    ];
    for (const packId of packs) {
        const placements = getPlacementsForPack(packId);
        assert.ok(placements.length >= 10, `${packId} should place a rich set of scenic props`);
        for (const p of placements) {
            const [x, , z] = p.position;
            if (x >= 0 && x <= 64) {
                assert.ok(
                    Math.abs(z) >= 5.5,
                    `[${packId}] prop ${p.asset} at (${x.toFixed(1)}, ${z.toFixed(1)}) intrudes into throwing corridor`
                );
            }
            if (x >= -3.5 && x <= 0) {
                assert.ok(
                    Math.abs(z) >= 3.5,
                    `[${packId}] prop ${p.asset} at (${x.toFixed(1)}, ${z.toFixed(1)}) intrudes into shore foraging patch`
                );
            }
        }
    }

    const jiangnanAssets = new Set(buildJiangnanPlacements().map(p => p.asset));
    for (const file of [
        'pavilion.glb',
        'wupeng_boat.glb',
        'lotus_leaf_flat.glb',
        'lotus_leaf_tall.glb',
        'lotus_leaf_curled.glb',
        'lotus_flower_open.glb',
        'lotus_flower_bud.glb',
        'willow_tree.glb',
        'distant_pagoda.glb',
    ]) {
        assert.ok(jiangnanAssets.has(file), `Jiangnan layout missing asset ${file}`);
    }
});

test('all 10 Blender scene packs and manifests exist and match exact byte sizes on disk', () => {
    const expectedPacks: Array<{ id: ScenePackId; count: number }> = [
        { id: 'jiangnan', count: 14 },
        { id: 'tahoe', count: 7 },
        { id: 'kyoto', count: 10 },
        { id: 'nordic', count: 7 },
        { id: 'lagoon', count: 7 },
        { id: 'fuji', count: 10 },
        { id: 'zhangjiajie', count: 10 },
        { id: 'venice', count: 10 },
        { id: 'alps', count: 6 },
        { id: 'nile', count: 6 },
    ];
    for (const { id, count } of expectedPacks) {
        const dir = resolve('public/assets/scenes', id);
        const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) as {
            packId: string;
            assets: Array<{ file: string; triangles: number; fileBytes: number }>;
        };
        assert.equal(manifest.packId, id);
        assert.equal(manifest.assets.length, count, `${id} expected ${count} assets`);
        const layoutFiles = new Set(getPlacementsForPack(id).map(p => p.asset));
        for (const entry of manifest.assets) {
            const st = statSync(resolve(dir, entry.file));
            assert.ok(st.size > 10_000, `[${id}] ${entry.file} unexpectedly small (${st.size} bytes)`);
            assert.equal(st.size, entry.fileBytes, `[${id}] ${entry.file} size mismatch with manifest`);
            assert.ok(entry.triangles > 100);
            assert.ok(layoutFiles.has(entry.file), `[${id}] ${entry.file} not placed in scene-packs.ts`);
        }
    }
});
