import type { Pool, PoolClient } from 'pg';

const migrationSql = `
CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
  delivery_id text PRIMARY KEY,
  hook_id text,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 128),
  action text,
  processing_status text NOT NULL CHECK (processing_status IN ('processed', 'invalid')),
  last_error text,
  received_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  repository_id text,
  repository_full_name text,
  organization_id text,
  organization_login text,
  installation_id text,
  sender_id text,
  sender_login text,
  content_type text NOT NULL,
  payload_bytes integer NOT NULL CHECK (payload_bytes >= 0),
  payload_sha256 char(64) NOT NULL,
  request_headers jsonb NOT NULL,
  raw_payload bytea NOT NULL
);

CREATE INDEX IF NOT EXISTS github_webhook_deliveries_received_at_idx
  ON github_webhook_deliveries (received_at DESC, delivery_id DESC);
CREATE INDEX IF NOT EXISTS github_webhook_deliveries_event_received_idx
  ON github_webhook_deliveries (event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS github_webhook_deliveries_repository_received_idx
  ON github_webhook_deliveries (repository_id, received_at DESC)
  WHERE repository_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS github_webhook_recovery_attempts (
  target text NOT NULL,
  github_delivery_id bigint NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target, github_delivery_id)
);
`;

export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('atlas.github-webhooks.schema.v1'))");
    await runStatements(client, migrationSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runStatements(client: PoolClient, sql: string): Promise<void> {
  await client.query(sql);
}
