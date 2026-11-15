import { readFile, writeFile, lstat } from 'node:fs/promises';

const source = new URL('../public/assets/stone.glb.base64', import.meta.url);
const target = new URL('../public/assets/stone.glb', import.meta.url);

try {
  const encoded = (await readFile(source, 'utf8')).replace(/\s/g, '');
  if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Invalid base64 in public/assets/stone.glb.base64');
  }
  const model = Buffer.from(encoded, 'base64');
  if (model.toString('base64') !== encoded || model.length < 12 || model.toString('ascii', 0, 4) !== 'glTF' || model.readUInt32LE(4) !== 2 || model.readUInt32LE(8) !== model.length) {
    throw new Error('Invalid GLB data in public/assets/stone.glb.base64');
  }
  const existing = await lstat(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (existing && !existing.isFile()) {
    throw new Error('Refusing to overwrite non-regular public/assets/stone.glb');
  }
  if (!existing || !(await readFile(target)).equals(model)) {
    await writeFile(target, model);
  }
} catch (error) {
  console.error(`Asset preparation failed: ${error.message}`);
  process.exitCode = 1;
}
