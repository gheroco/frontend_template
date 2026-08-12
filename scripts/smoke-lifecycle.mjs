import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const baseUrl = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:4000';
const runtimeManifest = path.join(root, '.runtime/catalog/inventory.yaml');
const baseManifest = path.join(root, 'catalog/local/inventory.yaml');
let cookie = '';

try {
  const login = await fetch(`${baseUrl}/auth/dev-login`, {
    method: 'POST', headers: { origin: baseUrl, 'content-type': 'application/json' }, body: JSON.stringify({ identity: 'operator' })
  });
  assert(login.status === 204, `login returned ${login.status}`);
  cookie = (login.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
  assert(cookie, 'secure session cookie was not issued');

  await expectTabs(['inventory-overview', 'audit-timeline']);
  await apply('examples/catalog/inventory-with-suppliers.local.yaml');
  await eventually(() => expectTabs(['inventory-overview', 'inventory-suppliers', 'audit-timeline']));
  await apply('examples/catalog/inventory-v2.local.yaml');
  await eventually(async () => {
    const extensions = await getExtensions();
    const inventory = extensions.find((entry) => entry.id === 'inventory-overview');
    assert(inventory?.serviceVersion === '1.1.0' && inventory.elementName === 'inventory-overview-v2', 'upgrade was not visible');
  });
  await apply('catalog/local/inventory.yaml');
  await eventually(async () => {
    const inventory = (await getExtensions()).find((entry) => entry.id === 'inventory-overview');
    assert(inventory?.serviceVersion === '1.0.0' && inventory.elementName === 'inventory-overview-v1', 'rollback was not visible');
  });
  await apply('examples/catalog/inventory-disabled.local.yaml');
  await eventually(() => expectTabs(['audit-timeline']));
  await rm(runtimeManifest, { force: true });
  await eventually(() => expectTabs(['audit-timeline']));
  console.log('Lifecycle HTTP smoke passed: register, upgrade, rollback, disable, delete, restore-safe behavior.');
} finally {
  await copyFile(baseManifest, runtimeManifest);
}

async function apply(relativePath) { await copyFile(path.join(root, relativePath), runtimeManifest); }
async function getExtensions() {
  const response = await fetch(`${baseUrl}/api/extensions`, { headers: { cookie, accept: 'application/json' } });
  assert(response.ok, `extension endpoint returned ${response.status}`);
  return (await response.json()).extensions;
}
async function expectTabs(expected) {
  const actual = (await getExtensions()).map((entry) => entry.id);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `expected ${expected.join(',')} but received ${actual.join(',')}`);
}
async function eventually(operation, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { await operation(); return; } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  throw lastError;
}
function assert(condition, message) { if (!condition) throw new Error(message); }

