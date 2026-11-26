/** Read exported atlas GLBs through the same GLTFLoader used by the game. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Box3, DoubleSide, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.self = globalThis;
// Blender separately decodes every atlas. Node supplies the shape of the
// browser's bitmap here so GLTFLoader can resolve all material texture links.
globalThis.createImageBitmap = async blob => {
    const webp = Buffer.from(await blob.arrayBuffer());
    assert.equal(webp.toString('ascii', 0, 4), 'RIFF');
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
    const format = webp.toString('ascii', 12, 16);
    if (format === 'VP8X') {
        return { width: webp.readUIntLE(24, 3) + 1, height: webp.readUIntLE(27, 3) + 1, close() {} };
    }
    if (format === 'VP8 ') {
        return { width: webp.readUInt16LE(26) & 0x3fff, height: webp.readUInt16LE(28) & 0x3fff, close() {} };
    }
    assert.equal(format, 'VP8L');
    const bits = webp.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, close() {} };
};

const manifestPath = process.argv[2];
const pack = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const asset of pack.assets) {
    const bytes = await readFile(join(dirname(manifestPath), asset.file));
    assert.equal(bytes.byteLength, asset.fileBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { scene } = await new GLTFLoader().parseAsync(data, '');
    const bounds = new Box3().setFromObject(scene);
    const close = (a, b) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-5), asset.file);
    close(bounds.min.toArray(), asset.boundsMeters.min);
    close(bounds.max.toArray(), asset.boundsMeters.max);
    close(bounds.getSize(new Vector3()).toArray(), asset.bboxMeters);
    let tris = 0;
    let mask = false;
    let light = false;
    scene.traverse(object => {
        if (!object.isMesh) return;
        tris += object.geometry.index.count / 3;
        const mat = object.material;
        for (const map of [mat.map, mat.roughnessMap, mat.normalMap]) {
            assert.ok(map);
            assert.equal(map.image.width, asset.textureMaps[0].size[0]);
            assert.equal(map.image.height, asset.textureMaps[0].size[1]);
        }
        mask ||= mat.alphaTest > 0 && mat.side === DoubleSide;
        light ||= Boolean(mat.emissiveMap && mat.emissiveIntensity > 1);
    });
    assert.equal(tris, asset.triangles);
    assert.equal(mask, asset.alphaMask);
    assert.equal(light, asset.emissive);
}
console.log(`GLTFLoader verified ${pack.assets.length} ${pack.packId} assets`);
