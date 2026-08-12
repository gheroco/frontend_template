import { randomBytes } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env');

if (!(await exists(envPath))) {
  let template = await readFile(path.join(root, '.env.example'), 'utf8');
  template = template
    .replace(/^SESSION_KEY=.*$/m, `SESSION_KEY=${randomBytes(32).toString('hex')}`)
    .replace(/^DEV_JWT_SECRET=.*$/m, `DEV_JWT_SECRET=${randomBytes(48).toString('base64url')}`)
    .replace(/^REGISTRY_API_TOKEN=.*$/m, `REGISTRY_API_TOKEN=${randomBytes(32).toString('base64url')}`)
    .replace(/^GITHUB_WEBHOOK_SECRET=.*$/m, `GITHUB_WEBHOOK_SECRET=${randomBytes(48).toString('base64url')}`);
  await writeFile(envPath, template, { encoding: 'utf8', mode: 0o600 });
  console.log('Created .env with random local-only secrets.');
}

await mkdir(path.join(root, '.runtime/catalog'), { recursive: true });
await cp(path.join(root, 'catalog/local'), path.join(root, '.runtime/catalog'), { recursive: true, force: true });

async function exists(value) {
  try { await access(value); return true; } catch { return false; }
}

