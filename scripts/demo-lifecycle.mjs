import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const action = process.argv[2];
const targetDirectory = path.join(root, '.runtime/catalog');
const target = path.join(targetDirectory, 'inventory.yaml');
const sources = {
  register: 'catalog/local/inventory.yaml',
  suppliers: 'examples/catalog/inventory-with-suppliers.local.yaml',
  upgrade: 'examples/catalog/inventory-v2.local.yaml',
  rollback: 'catalog/local/inventory.yaml',
  disable: 'examples/catalog/inventory-disabled.local.yaml',
  enable: 'catalog/local/inventory.yaml'
};

await mkdir(targetDirectory, { recursive: true });
if (action === 'delete' || action === 'unregister') {
  await rm(target, { force: true });
  console.log('Inventory unregistered. Its tab disappears within the five-second catalog refresh window.');
} else if (action && sources[action]) {
  await copyFile(path.join(root, sources[action]), target);
  console.log(`Inventory lifecycle action applied: ${action}.`);
} else {
  console.error('Usage: node scripts/demo-lifecycle.mjs <register|suppliers|upgrade|rollback|disable|enable|delete>');
  process.exitCode = 2;
}

