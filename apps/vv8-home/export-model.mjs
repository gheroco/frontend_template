// Offline export of the exact viewer model. Requires @napi-rs/canvas in Node.
// Usage: node export-model.mjs [output.glb]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(projectRoot, 'dist');
const output = path.resolve(process.argv[2] || path.join(projectRoot, '..', 'VV8-home-area-calibrated.glb'));
const exportCutaway = process.argv.includes('--cutaway');
let canvasPackage;
try { canvasPackage = require('@napi-rs/canvas'); }
catch (error) {
  const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  if (!runtimeModules) throw new Error('Install @napi-rs/canvas to export the model with Node.');
  canvasPackage = require(path.join(runtimeModules, '@napi-rs/canvas'));
}
const { createCanvas, CanvasElement, ImageData, Image } = canvasPackage;
globalThis.HTMLCanvasElement = CanvasElement || createCanvas(1, 1).constructor;
globalThis.HTMLImageElement = Image;
globalThis.ImageData = ImageData;
globalThis.document = {
  createElement(name) {
    if (name !== 'canvas') throw new Error('Unexpected DOM element requested: ' + name);
    const canvas = createCanvas(1, 1);
    // @napi-rs/canvas exposes a data() method. GLTFExporter tests image.data to
    // distinguish DataTexture pixels from a browser canvas, so hide that method.
    // Without this adapter, every embedded texture would silently become blank.
    Object.defineProperty(canvas, 'data', { value: undefined, configurable: true });
    if (!canvas.toBlob) canvas.toBlob = (callback, mime = 'image/png') => callback(new Blob([canvas.toBuffer(mime)], { type: mime }));
    return canvas;
  },
  createElementNS(namespace, name) { return this.createElement(name); }
};
globalThis.FileReader = class FileReader {
  constructor() { this.result = null; this.error = null; this.readyState = 0; }
  readAsArrayBuffer(blob) {
    this.readyState = 1;
    blob.arrayBuffer().then(result => {
      this.result = result; this.readyState = 2;
      this.onload?.({ target: this }); this.onloadend?.({ target: this });
    }).catch(error => { this.error = error; this.readyState = 2; this.onerror?.({ target: this }); this.onloadend?.({ target: this }); });
  }
  readAsDataURL(blob) {
    this.readyState = 1;
    blob.arrayBuffer().then(result => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;
      this.readyState = 2; this.onload?.({ target: this }); this.onloadend?.({ target: this });
    }).catch(error => { this.error = error; this.readyState = 2; this.onerror?.({ target: this }); this.onloadend?.({ target: this }); });
  }
};

const threeURL = pathToFileURL(path.join(dist, 'vendor/build/three.module.js')).href;
const moduleURL = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const roundedSource = fs.readFileSync(path.join(dist, 'vendor/examples/jsm/geometries/RoundedBoxGeometry.js'), 'utf8').replaceAll("from 'three'", `from '${threeURL}'`);
const roundedURL = moduleURL(roundedSource);
const resolvedModules = new Map();
async function resolveViewerModule(relativePath) {
  const filename = path.resolve(dist, relativePath);
  if (resolvedModules.has(filename)) return resolvedModules.get(filename);
  let source = fs.readFileSync(filename, 'utf8');
  // Match real top-level imports/re-exports, excluding example imports in JSDoc.
  const imports = [...source.matchAll(/^(?:import|export)\s+(?:\{[\s\S]*?\}|\*[^;\n]*|[A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+)\1/gm)];
  for (const match of imports) {
    const specifier = match[2];
    let resolved;
    if (specifier === 'three') resolved = threeURL;
    else if (specifier === 'three/addons/geometries/RoundedBoxGeometry.js') resolved = roundedURL;
    else if (specifier.startsWith('three/addons/')) resolved = await resolveViewerModule('vendor/examples/jsm/' + specifier.slice(13));
    else if (specifier.startsWith('.')) resolved = await resolveViewerModule(path.relative(dist, path.resolve(path.dirname(filename), specifier)));
    if (resolved) source = source.replaceAll(match[0], match[0].replace(/from\s+(['"])[^'"]+\1$/, `from '${resolved}'`));
  }
  const url = moduleURL(source);
  resolvedModules.set(filename, url);
  return url;
}
async function importViewerModule(relativePath) { return import(await resolveViewerModule(relativePath)); }

try {
  const [THREE, { createArchitecture }, { createFurnishings }, { GLTFExporter }] = await Promise.all([
    import(threeURL), importViewerModule('architecture.js'), importViewerModule('furnishings.js'),
    importViewerModule('vendor/examples/jsm/exporters/GLTFExporter.js')
  ]);
  const data = JSON.parse(fs.readFileSync(path.join(dist, 'geometry.json'), 'utf8'));
  const budget = JSON.parse(fs.readFileSync(path.join(dist, 'budget.json'), 'utf8'));
  const { attachFurnitureBudget } = await import(pathToFileURL(path.join(dist, 'budget-model.js')).href);
  const architecture = createArchitecture(data);
  architecture.root.add(createFurnishings(data));
  attachFurnitureBudget(architecture.root, budget);
  architecture.update({ walls: exportCutaway ? 'cutaway' : 'full', height: data.wallHeight || 3, mode: 'dollhouse' });
  architecture.root.userData.roomAreas = Object.fromEntries(Object.entries(data.rooms).map(([id, room]) => [id, { brochureArea: room.brochureArea ?? room.targetArea, modelArea: room.modelArea }]));
  architecture.root.userData.dimensionChecks = data.dimensionChecks || [];
  architecture.root.userData.dimensionConflicts = data.dimensionalConflicts || data.conflicts || data.dimensionConflicts || [];
  architecture.root.userData.measurementNote = data.accuracy;
  const scene = new THREE.Scene();
  scene.name = 'VV8 Home — dimensioned drawing reconstruction';
  scene.userData = { units: 'metres', sourceReportedArea: data.sourceReportedTotal, listedRoomAreaSum: data.listedAreaSum, ceilingHeight: data.wallHeight || 3, ceilingHeightBasis: data.wallHeightBasis || 'provided', source: data.source, accuracy: data.accuracy };
  scene.add(architecture.root); scene.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(scene, { binary: true, onlyVisible: true, maxTextureSize: 1024, includeCustomExtensions: true });
  const bytes = Buffer.from(glb);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB header.');
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Missing GLB JSON chunk.');
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8').trim());
  const modelNode = json.nodes.find(node => node.extras?.roomAreas && node.extras?.units === 'metres');
  if (!modelNode || modelNode.extras.ceilingHeight !== (data.wallHeight || 3)) throw new Error('Export lost model dimensions or height metadata.');
  const roomIds = [...new Set(json.nodes.map(node => node.extras?.roomId).filter(Boolean))];
  if (roomIds.length !== 8) throw new Error('Export does not contain all eight room IDs.');
  // Validate decoded image content, not just the presence of texture records.
  const binaryStart = 20 + bytes.readUInt32LE(12) + 8;
  for (const [index, imageDef] of (json.images || []).entries()) {
    if (imageDef.bufferView == null) continue;
    const view = json.bufferViews[imageDef.bufferView];
    const imageBytes = bytes.subarray(binaryStart + (view.byteOffset || 0), binaryStart + (view.byteOffset || 0) + view.byteLength);
    const decoded = await canvasPackage.loadImage(imageBytes);
    const sample = createCanvas(8, 8); const ctx = sample.getContext('2d');ctx.drawImage(decoded, 0, 0, 8, 8);
    const pixels = ctx.getImageData(0, 0, 8, 8).data;
    if (!pixels.some((value, i) => i % 4 === 3 && value > 0)) throw new Error('Embedded texture ' + index + ' is empty.');
  }
  fs.writeFileSync(output, bytes);
  console.log(JSON.stringify({ file: output, bytes: bytes.length, megabytes: +(bytes.length / 1e6).toFixed(3), magic: bytes.subarray(0, 4).toString(), version: bytes.readUInt32LE(4), meshes: json.meshes?.length, nodes: json.nodes?.length, materials: json.materials?.length, images: json.images?.length, roomIds, modelMetadata: modelNode.extras }, null, 2));
} catch (error) {
  console.error('Model export failed: ' + error.message);
  process.exitCode = 1;
}
