import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { Vector3 } from 'three';
import { SAMPLE_URLS, sinkPlungeIntensity } from '../src/audio/engine';

test('direct steep stone drop retains full resonant sink intensity', () => {
    const directDrop = sinkPlungeIntensity(new Vector3(3.5, -3.8, 0), 0);
    assert.ok(directDrop > 0.85, `expected strong direct plunge (>0.85), got ${directDrop.toFixed(3)}`);
});

test('successful shallow skipping run becomes quiet to nearly silent when sinking', () => {
    const direct = sinkPlungeIntensity(new Vector3(4.0, -3.0, 0), 0);
    const shortSkip = sinkPlungeIntensity(new Vector3(3.5, -0.5, 0), 3);
    const longSkip = sinkPlungeIntensity(new Vector3(2.0, -0.25, 0), 12);

    assert.ok(shortSkip < direct * 0.15, `3-skip sink should be much quieter than direct drop (${shortSkip.toFixed(3)} vs ${direct.toFixed(3)})`);
    assert.ok(longSkip < 0.015, `12-skip shallow sink should be virtually silent (<0.015), got ${longSkip.toFixed(4)}`);
});

test('steeper entry angle produces louder sink than shallow glide at same skip count', () => {
    const shallow = sinkPlungeIntensity(new Vector3(5.0, -0.35, 0), 1);
    const steep = sinkPlungeIntensity(new Vector3(2.0, -2.5, 0), 1);
    assert.ok(steep > shallow * 2.5, `expected steep sink (${steep.toFixed(3)}) >> shallow (${shallow.toFixed(3)})`);
});

test('all 24 ElevenLabs audio samples referenced by CinemaAudioEngine exist and are non-empty on disk', () => {
    const entries = Object.entries(SAMPLE_URLS);
    assert.equal(entries.length, 24);
    for (const [key, urlPath] of entries) {
        const fileUrl = new URL(`../public${urlPath}`, import.meta.url);
        assert.ok(existsSync(fileUrl), `missing audio sample ${key}: ${urlPath}`);
        const size = statSync(fileUrl).size;
        assert.ok(size > 4000, `audio sample ${key} (${urlPath}) unexpectedly small (${size} bytes)`);
    }
});
