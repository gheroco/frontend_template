import { Pool } from 'pg';
import { migrate } from './migrations.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const pool = new Pool({ connectionString, max: 1, application_name: 'atlas-github-webhooks-migration' });
try {
  await migrate(pool);
} finally {
  await pool.end();
}
