import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_THEME_ID,
    SCENE_THEMES,
    getSceneTheme,
    themeSunDirection,
} from '../src/rendering/themes';

test('scene theme registry exposes sunset as default and provides valid switchable themes', () => {
    assert.equal(DEFAULT_THEME_ID, 'sunset');
    assert.ok(SCENE_THEMES.length >= 2, 'at least two themes should be registered for switching');

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
    assert.equal(getSceneTheme('nonexistent').id, DEFAULT_THEME_ID);
});
