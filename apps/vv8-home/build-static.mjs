#!/usr/bin/env node
/**
 * Deterministic, dependency-free static release packaging.
 *   node build-static.mjs          Build from index.template.html + dist root sources.
 *   node build-static.mjs --check  Verify the current release without writing files.
 * Existing releases are retained so cached HTML always has a complete matching bundle.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, stat, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(appDir, 'dist');
const templatePath = path.join(appDir, 'index.template.html');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check') || args.length > 1) {
  console.error('Usage: node build-static.mjs [--check]');
  process.exit(2);
}
const checkOnly = args.includes('--check');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const releaseSourceName = name => /\.(?:js|css|json)$/.test(name) && name !== 'release-manifest.json';
const sourceURL = value => value.split(/[?#]/, 1)[0].replace(/^\.\//, '');

async function readOptional(filename) {
  try { return await readFile(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function ensureLocalResource(value, origin) {
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return;
  const relative = sourceURL(value).replace(/^\//, '');
  if (!relative || relative.includes('${')) return;
  const resolved = path.resolve(distDir, relative);
  if (!resolved.startsWith(distDir + path.sep)) throw new Error(`${origin}: resource escapes dist: ${value}`);
  try { await stat(resolved); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${origin}: missing local resource ${value}`);
    throw error;
  }
}

async function writeAtomically(filename, bytes) {
  const previous = await readOptional(filename);
  if (previous?.equals(bytes)) return false;
  const temporary = `${filename}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, filename);
  return true;
}

async function main() {
  const templateBytes = await readFile(templatePath);
  const template = templateBytes.toString('utf8');
  if (/\.\/releases\/[a-f0-9]+\//.test(template)) {
    throw new Error('index.template.html must use source paths such as ./app.js, not generated release paths.');
  }
  const entries = await readdir(distDir, { withFileTypes: true });
  const names = entries.filter(entry => entry.isFile() && releaseSourceName(entry.name)).map(entry => entry.name).sort();
  if (!names.includes('app.js') || !names.includes('geometry.json') || !names.includes('budget.json')) {
    throw new Error('dist must contain app.js, geometry.json and budget.json.');
  }
  const sources = new Map(await Promise.all(names.map(async name => [name, await readFile(path.join(distDir, name))])));
  const fingerprint = createHash('sha256');
  // Include the builder so a change to rewrite rules receives a new immutable path.
  for (const [name, bytes] of [
    ['build-static.mjs', await readFile(fileURLToPath(import.meta.url))],
    ['index.template.html', templateBytes],
    ...sources
  ]) {
    fingerprint.update(name).update('\0').update(String(bytes.length)).update('\0').update(bytes).update('\0');
  }
  const release = fingerprint.digest('hex').slice(0, 20);
  const base = `./releases/${release}/`;
  const releaseDir = path.join(distDir, 'releases', release);

  // Module imports are naturally relative to the release directory. In contrast,
  // fetch(string), stylesheet.href and link.href resolve relative to the document.
  function rewriteJavaScript(text) {
    return text.replace(/(['"`])\.\/([A-Za-z0-9_.-]+\.(?:json|css))([?#][^'"`]*)?\1/g,
      (match, quote, name, suffix = '', offset, whole) => {
        const before = whole.slice(Math.max(0, offset - 100), offset);
        const after = whole.slice(offset + match.length);
        if (/\b(?:from|import)\s*(?:\(\s*)?$/.test(before) || /^\s*,\s*import\.meta\.url\b/.test(after)) return match;
        if (!sources.has(name)) throw new Error(`JavaScript refers to a missing root resource: ./${name}`);
        return `${quote}${base}${name}${suffix}${quote}`;
      });
  }

  function rewriteStylesheet(text) {
    // CSS URLs resolve from the stylesheet location, unlike URLs assigned by JS.
    return text.replace(/url\(\s*(['"]?)(?:\.\/)?((?:assets|vendor)\/[^)'"\s]+)\1\s*\)/g,
      (_match, quote, name) => `url(${quote}../../${name}${quote})`);
  }

  const packaged = new Map();
  for (const [name, bytes] of sources) {
    if (name.endsWith('.js')) {
      const text = bytes.toString('utf8');
      const imports = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(\.\/[^'"\s]+)\1/g)];
      for (const match of imports) {
        const target = sourceURL(match[2]);
        if (!sources.has(target)) throw new Error(`${name}: local module import is not in the release: ${match[2]}`);
      }
      packaged.set(name, Buffer.from(rewriteJavaScript(text)));
    } else if (name.endsWith('.css')) {
      packaged.set(name, Buffer.from(rewriteStylesheet(bytes.toString('utf8'))));
    } else {
      JSON.parse(bytes.toString('utf8'));
      packaged.set(name, bytes);
    }
  }

  // Preserve the root-based import map, media and download URLs. Rewrite only
  // root source JS/CSS/JSON references that belong to this exact release.
  const html = template.replace(/\b(src|href)\s*=\s*(['"])([^'"]+)\2/g,
    (match, attribute, quote, value) => {
      const name = sourceURL(value);
      if (!sources.has(name)) return match;
      const suffix = value.slice(value.search(/[?#]/));
      return `${attribute}=${quote}${base}${name}${/[?#]/.test(value) ? suffix : ''}${quote}`;
    });
  const localReferences = [...template.matchAll(/\b(?:src|href)\s*=\s*(['"])([^'"]+)\1/g)].map(match => match[2]);
  for (const reference of localReferences) await ensureLocalResource(reference, 'index.template.html');
  for (const importMap of template.matchAll(/<script\b[^>]*\btype\s*=\s*['"]importmap['"][^>]*>([\s\S]*?)<\/script>/gi)) {
    const imports = JSON.parse(importMap[1]).imports || {};
    for (const reference of Object.values(imports)) await ensureLocalResource(reference, 'import map');
  }
  if (!html.includes(`${base}app.js`)) throw new Error('The template must load ./app.js as its module entry.');

  const manifest = {
    schemaVersion: 1,
    release,
    base,
    entry: `${base}app.js`,
    template: 'index.template.html',
    files: [...packaged].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: sha256(bytes) }))
  };
  const htmlBytes = Buffer.from(html);
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');

  if (checkOnly) {
    for (const [name, expected] of packaged) {
      const actual = await readOptional(path.join(releaseDir, name));
      if (!actual?.equals(expected)) throw new Error(`Missing or mismatched release file: ${release}/${name}`);
    }
    for (const [name, expected] of [['index.html', htmlBytes], ['release-manifest.json', manifestBytes]]) {
      const actual = await readOptional(path.join(distDir, name));
      if (!actual?.equals(expected)) throw new Error(`Stale ${name}; run node build-static.mjs.`);
    }
    console.log(JSON.stringify({ checked: true, release, files: packaged.size, entry: manifest.entry }));
    return;
  }

  await mkdir(releaseDir, { recursive: true });
  for (const [name, bytes] of packaged) {
    const filename = path.join(releaseDir, name);
    const existing = await readOptional(filename);
    if (existing && !existing.equals(bytes)) throw new Error(`Refusing to change an existing immutable release file: ${release}/${name}`);
    if (!existing) await writeAtomically(filename, bytes);
  }
  await writeAtomically(path.join(distDir, 'release-manifest.json'), manifestBytes);
  // Publish the entry point last: all referenced assets are now present.
  const changed = await writeAtomically(path.join(distDir, 'index.html'), htmlBytes);
  console.log(JSON.stringify({ built: true, changed, release, files: packaged.size, entry: manifest.entry }));
}

main().catch(error => {
  console.error(`Static release build failed: ${error.message}`);
  process.exitCode = 1;
});
