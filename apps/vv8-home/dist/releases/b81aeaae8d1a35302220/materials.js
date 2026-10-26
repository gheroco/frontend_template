import * as THREE from 'three';

/** Small, deterministic PBR surfaces. No network images or browser-only canvas APIs. */
const textureCache = new Map();
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
function hash(x, y, seed = 7) {
  let n = Math.imul(x + seed * 131, 374761393) ^ Math.imul(y + seed * 17, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, seed = 7) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
const defaults = {
  oak: { roughness: .62, tile: [.28, 1.4], normal: .28 },
  fabric: { roughness: .96, tile: [.24, .24], normal: .32 },
  linen: { roughness: .94, tile: [.20, .20], normal: .24 },
  rug: { roughness: 1, tile: [.30, .30], normal: .40 },
  stone: { roughness: .29, tile: [1.4, 1.4], normal: .045 },
  plaster: { roughness: .92, tile: [1, 1], normal: .12 },
  paint: { roughness: .53, tile: [.35, .35], normal: .04 },
  metal: { roughness: .34, tile: [.16, .16], normal: .055 }
};

function texture(canvas, color = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function maps(kind) {
  if (textureCache.has(kind)) return textureCache.get(kind);
  const size = 512, heights = new Float32Array(size * size);
  const canvases = Array.from({ length: 3 }, () => {
    const c = document.createElement('canvas'); c.width = c.height = size; return c;
  });
  const contexts = canvases.map(c => c.getContext('2d'));
  const images = contexts.map(c => c.createImageData(size, size));
  const base = images[0].data, normal = images[1].data, rough = images[2].data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, q = i * 4, u = x / size, v = y / size;
    const fine = hash(x, y), cloud = noise(u * 10, v * 10, 29);
    let shade = .97, height = .5, roughness = .85;
    if (kind === 'oak') {
      const bend = .015 * Math.sin(v * TAU * 2) + .011 * Math.sin(v * TAU * 5 + 1.5);
      const grain = Math.sin((u + bend + .009 * noise(u * 5, v * 13)) * TAU * 43);
      const pores = Math.pow(Math.max(0, Math.sin((u + bend) * TAU * 103)), 16);
      shade = .91 + .045 * grain + .035 * cloud - .045 * pores + .012 * (fine - .5);
      height = .5 + .11 * grain - .20 * pores + .035 * (fine - .5);
      roughness = .75 + .12 * cloud + .08 * pores;
    } else if (kind === 'fabric' || kind === 'linen') {
      const count = kind === 'fabric' ? 67 : 91;
      const warp = Math.sin(u * TAU * count), weft = Math.sin(v * TAU * count);
      const weave = warp * (.70 + .30 * Math.cos(v * TAU * count / 2)) + weft * .65;
      const loop = kind === 'fabric' ? .065 * noise(u * 96, v * 96, 43) : 0;
      height = .5 + .12 * weave + loop + .025 * (fine - .5);
      shade = .94 + .023 * weave + .027 * (cloud - .5) + .015 * (fine - .5);
      roughness = .93 + .07 * cloud;
    } else if (kind === 'rug') {
      const tuft = noise(u * 100, v * 100, 61), weave = Math.sin(u * TAU * 72) * Math.sin(v * TAU * 72);
      shade = .91 + .09 * tuft + .024 * weave + .025 * (cloud - .5);
      height = .35 + .30 * tuft + .16 * weave + .06 * (fine - .5);
      roughness = 1;
    } else if (kind === 'stone') {
      const path = u + .10 * Math.sin(v * TAU) + .045 * Math.sin(v * TAU * 3 + 2.2);
      const vein = Math.pow(Math.max(0, Math.cos(path * TAU * 3)), 28);
      const hairline = Math.pow(Math.max(0, Math.cos((path + .016 * Math.sin(v * 35)) * TAU * 3)), 140);
      shade = .98 - .095 * vein - .05 * hairline + .015 * (cloud - .5) + .008 * (fine - .5);
      height = .5 + .008 * (fine - .5);
      roughness = .73 + .12 * cloud + .06 * vein;
    } else if (kind === 'metal') {
      const brush = Math.sin(u * TAU * 207) + (hash(x, 0, 33) - .5) * .7;
      shade = .97 + .012 * brush; height = .5 + .055 * brush;
      roughness = .72 + .10 * hash(x, 0, 33);
    } else {
      const strength = kind === 'plaster' ? .035 : .012;
      shade = .975 + strength * (cloud - .5) + .008 * (fine - .5);
      height = .5 + strength * 2 * (fine - .5) + strength * (cloud - .5);
      roughness = kind === 'plaster' ? .94 : .88 + .04 * cloud;
    }
    heights[i] = height;
    const value = Math.round(clamp(shade) * 255);
    base[q] = base[q + 1] = base[q + 2] = value; base[q + 3] = 255;
    const rv = Math.round(clamp(roughness) * 255);
    rough[q] = rough[q + 1] = rough[q + 2] = rv; rough[q + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const q = (y * size + x) * 4;
    const dx = (heights[y * size + (x + 1) % size] - heights[y * size + (x + size - 1) % size]) * 2.2;
    const dy = (heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x]) * 2.2;
    const length = Math.hypot(dx, dy, 1);
    normal[q] = Math.round((-dx / length * .5 + .5) * 255);
    normal[q + 1] = Math.round((-dy / length * .5 + .5) * 255);
    normal[q + 2] = Math.round((1 / length * .5 + .5) * 255); normal[q + 3] = 255;
  }
  contexts.forEach((ctx, i) => ctx.putImageData(images[i], 0, 0));
  const result = { map: texture(canvases[0], true), normalMap: texture(canvases[1]), roughnessMap: texture(canvases[2]) };
  result.map.name = kind + ' · neutral albedo';
  result.normalMap.name = kind + ' · surface normal';
  result.roughnessMap.name = kind + ' · roughness';
  textureCache.set(kind, result);
  return result;
}

export function createSurfaceMaterial(kind, options = {}) {
  if (!defaults[kind]) kind = 'paint';
  const def = defaults[kind];
  const { name, color = '#ffffff', normalStrength = def.normal, tile = def.tile, grain = 'y', ...params } = options;
  const m = new THREE.MeshStandardMaterial({ color, roughness: def.roughness, ...maps(kind), ...params });
  m.normalScale.set(normalStrength, normalStrength);
  m.name = name || kind + ' surface';
  m.userData.surface = { family: kind, tile, grain, mapsAreNeutralModulation: true };
  return m;
}

/** Bake metric UV coordinates, retaining dimensions/transforms and avoiding map clones per object. */
export function setPhysicalUV(mesh, options = {}) {
  if (!mesh?.geometry?.attributes?.position) return mesh;
  const surface = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.userData?.surface || {};
  const { tile = surface.tile || [1, 1], grain = surface.grain || 'y', projection = 'box', clone = true, offset = [0, 0] } = options;
  const geometry = clone ? mesh.geometry.clone() : mesh.geometry;
  if (clone) mesh.geometry = geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const pos = geometry.attributes.position, normals = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2), size = typeof tile === 'number' ? [tile, tile] : tile;
  const grainIndex = { x: 0, y: 1, z: 2 }[grain] ?? 1;
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i) * mesh.scale.x, pos.getY(i) * mesh.scale.y, pos.getZ(i) * mesh.scale.z];
    const n = [Math.abs(normals.getX(i)), Math.abs(normals.getY(i)), Math.abs(normals.getZ(i))];
    let axes;
    if (projection === 'xy') axes = [0, 1];
    else if (projection === 'xz') axes = [0, 2];
    else if (projection === 'zy') axes = [2, 1];
    else if (projection === 'cylinder' && n[1] < .7) {
      let angle = Math.atan2(p[0], p[2]); if (angle < 0) angle += TAU;
      uv[i * 2] = angle * Math.hypot(p[0], p[2]) / size[0] + offset[0];
      uv[i * 2 + 1] = p[1] / size[1] + offset[1]; continue;
    } else axes = n[1] >= n[0] && n[1] >= n[2] ? [0, 2] : n[0] >= n[2] ? [2, 1] : [0, 1];
    if (axes[0] === grainIndex) axes.reverse();
    uv[i * 2] = p[axes[0]] / size[0] + offset[0];
    uv[i * 2 + 1] = p[axes[1]] / size[1] + offset[1];
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.userData.physicalUV = true;
  return mesh;
}
