import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const components = [
  {
    entry: 'services/inventory/dist/public/mfe/entry.js',
    files: [
      'catalog/local/inventory.yaml',
      'catalog/docker/inventory.yaml',
      'examples/catalog/inventory-with-suppliers.local.yaml',
      'examples/catalog/inventory-v2.local.yaml',
      'examples/catalog/inventory-disabled.local.yaml',
      'services/inventory/deploy/chart/values.yaml'
    ]
  },
  {
    entry: 'services/audit/dist/public/mfe/entry.js',
    files: ['catalog/local/audit.yaml', 'catalog/docker/audit.yaml', 'services/audit/deploy/chart/values.yaml']
  },
  {
    entry: 'services/github-webhooks/dist/public/mfe/entry.js',
    files: [
      'catalog/local/github-webhooks.yaml',
      'catalog/docker/github-webhooks.yaml',
      'services/github-webhooks/deploy/chart/values.yaml'
    ]
  }
];

let stale = false;
for (const component of components) {
  const bytes = await readFile(path.join(root, component.entry));
  const integrity = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
  for (const relativeFile of component.files) {
    const file = path.join(root, relativeFile);
    const current = await readFile(file, 'utf8');
    const next = current.replace(/sha384-[A-Za-z0-9+/]{64}/g, integrity);
    if (next !== current) {
      stale = true;
      if (!check) await writeFile(file, next, 'utf8');
    }
  }
  console.log(`${component.entry}: ${integrity}`);
}

if (check && stale) {
  console.error('Catalog integrity metadata is stale. Run npm run integrity:sync.');
  process.exitCode = 1;
}
