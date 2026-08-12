import { createHash } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';
import type {
  DeliveryListItem,
  DeliveryPage,
  DeliveryProjection,
  DeliveryStore,
  DeliverySummary,
  WebhookEnvelope
} from './domain.js';
import { migrate } from './migrations.js';

type Cursor = { receivedAt: string; deliveryId: string };

export class MemoryDeliveryStore implements DeliveryStore {
  readonly #deliveries = new Map<string, DeliveryListItem & { body: Buffer; headers: Record<string, string> }>();
  readonly #recovery = new Map<string, number>();
  #closed = false;

  async start(): Promise<void> { this.#closed = false; }
  async ready(): Promise<boolean> { return !this.#closed; }

  async persist(envelope: WebhookEnvelope, projection: DeliveryProjection): Promise<'created' | 'duplicate'> {
    if (this.#deliveries.has(envelope.deliveryId)) return 'duplicate';
    this.#deliveries.set(envelope.deliveryId, {
      deliveryId: envelope.deliveryId,
      hookId: envelope.hookId,
      eventType: envelope.eventType,
      receivedAt: envelope.receivedAt,
      processedAt: new Date().toISOString(),
      payloadBytes: envelope.body.byteLength,
      payloadSha256: createHash('sha256').update(envelope.body).digest('hex'),
      ...projection,
      body: Buffer.from(envelope.body),
      headers: { ...envelope.headers }
    });
    return 'created';
  }

  async summary(): Promise<DeliverySummary> {
    const deliveries = [...this.#deliveries.values()];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    for (const delivery of deliveries) counts.set(delivery.eventType, (counts.get(delivery.eventType) ?? 0) + 1);
    return {
      total: deliveries.length,
      last24Hours: deliveries.filter((delivery) => Date.parse(delivery.receivedAt) >= cutoff).length,
      eventTypes: counts.size,
      latestReceivedAt: deliveries.sort(compareDelivery)[0]?.receivedAt ?? null,
      topEventTypes: [...counts.entries()]
        .map(([eventType, count]) => ({ eventType, count }))
        .sort((left, right) => right.count - left.count || left.eventType.localeCompare(right.eventType))
        .slice(0, 10)
    };
  }

  async list(input: { limit: number; eventType?: string; cursor?: string }): Promise<DeliveryPage> {
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    const values = [...this.#deliveries.values()]
      .filter((delivery) => !input.eventType || delivery.eventType === input.eventType)
      .sort(compareDelivery)
      .filter((delivery) => !cursor || compareDelivery(delivery, cursor) > 0);
    const page = values.slice(0, input.limit);
    const last = page.at(-1);
    return {
      deliveries: page.map(({ body: _body, headers: _headers, ...delivery }) => delivery),
      nextCursor: values.length > input.limit && last ? encodeCursor(last) : null
    };
  }

  async reserveRecoveryAttempt(target: string, deliveryId: number, minimumIntervalSeconds: number): Promise<boolean> {
    const key = `${target}:${deliveryId}`;
    const now = Date.now();
    const last = this.#recovery.get(key);
    if (last && now - last < minimumIntervalSeconds * 1000) return false;
    this.#recovery.set(key, now);
    return true;
  }

  async maintain(retentionDays: number): Promise<number> {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    let deleted = 0;
    for (const [id, delivery] of this.#deliveries) {
      if (Date.parse(delivery.receivedAt) < cutoff) { this.#deliveries.delete(id); deleted += 1; }
    }
    const recoveryCutoff = Date.now() - 4 * 86_400_000;
    for (const [key, attemptedAt] of this.#recovery) if (attemptedAt < recoveryCutoff) this.#recovery.delete(key);
    return deleted;
  }

  async close(): Promise<void> { this.#closed = true; }
}

export class PostgresDeliveryStore implements DeliveryStore {
  readonly #pool: Pool;
  readonly #runMigrations: boolean;

  constructor(connectionString: string, poolSize = 4, runMigrations = false) {
    this.#pool = new Pool({
      connectionString,
      max: poolSize,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
      application_name: 'atlas-github-webhooks'
    });
    this.#runMigrations = runMigrations;
  }

  async start(): Promise<void> {
    if (this.#runMigrations) await migrate(this.#pool);
    await this.#pool.query('SELECT 1');
  }

  async ready(): Promise<boolean> {
    try { await this.#pool.query('SELECT 1'); return true; }
    catch { return false; }
  }

  async persist(envelope: WebhookEnvelope, projection: DeliveryProjection): Promise<'created' | 'duplicate'> {
    const result = await this.#pool.query({
      text: `INSERT INTO github_webhook_deliveries (
        delivery_id, hook_id, event_type, action, processing_status, last_error, received_at,
        repository_id, repository_full_name, organization_id, organization_login,
        installation_id, sender_id, sender_login, content_type, payload_bytes,
        payload_sha256, request_headers, raw_payload
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)
      ON CONFLICT (delivery_id) DO NOTHING
      RETURNING delivery_id`,
      values: [
        envelope.deliveryId, envelope.hookId, envelope.eventType, projection.action, projection.processingStatus,
        projection.lastError, envelope.receivedAt,
        projection.repositoryId, projection.repositoryFullName, projection.organizationId, projection.organizationLogin,
        projection.installationId, projection.senderId, projection.senderLogin, envelope.contentType, envelope.body.byteLength,
        createHash('sha256').update(envelope.body).digest('hex'), JSON.stringify(envelope.headers), envelope.body
      ]
    });
    return result.rowCount === 1 ? 'created' : 'duplicate';
  }

  async summary(): Promise<DeliverySummary> {
    const [overall, types] = await Promise.all([
      this.#pool.query<SummaryRow>(`SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE received_at >= now() - interval '24 hours')::int AS last_24_hours,
        count(DISTINCT event_type)::int AS event_types,
        max(received_at) AS latest_received_at
      FROM github_webhook_deliveries`),
      this.#pool.query<EventCountRow>(`SELECT event_type, count(*)::int AS count
        FROM github_webhook_deliveries
        WHERE received_at >= now() - interval '24 hours'
        GROUP BY event_type ORDER BY count DESC, event_type ASC LIMIT 10`)
    ]);
    const row = overall.rows[0];
    return {
      total: Number(row?.total ?? 0),
      last24Hours: Number(row?.last_24_hours ?? 0),
      eventTypes: Number(row?.event_types ?? 0),
      latestReceivedAt: dateString(row?.latest_received_at),
      topEventTypes: types.rows.map((entry) => ({ eventType: entry.event_type, count: Number(entry.count) }))
    };
  }

  async list(input: { limit: number; eventType?: string; cursor?: string }): Promise<DeliveryPage> {
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    const values: unknown[] = [];
    const where: string[] = [];
    if (input.eventType) { values.push(input.eventType); where.push(`event_type = $${values.length}`); }
    if (cursor) {
      values.push(cursor.receivedAt, cursor.deliveryId);
      where.push(`(received_at, delivery_id) < ($${values.length - 1}::timestamptz, $${values.length})`);
    }
    values.push(input.limit + 1);
    const result = await this.#pool.query<DeliveryRow>({
      text: `SELECT delivery_id, hook_id, event_type, action, processing_status, last_error, received_at, processed_at,
        repository_id, repository_full_name, organization_id, organization_login,
        installation_id, sender_id, sender_login, payload_bytes, payload_sha256
        FROM github_webhook_deliveries
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY received_at DESC, delivery_id DESC LIMIT $${values.length}`,
      values
    });
    const hasMore = result.rows.length > input.limit;
    const deliveries = result.rows.slice(0, input.limit).map(mapDelivery);
    const last = deliveries.at(-1);
    return { deliveries, nextCursor: hasMore && last ? encodeCursor(last) : null };
  }

  async reserveRecoveryAttempt(target: string, deliveryId: number, minimumIntervalSeconds: number): Promise<boolean> {
    const result = await this.#pool.query({
      text: `INSERT INTO github_webhook_recovery_attempts (target, github_delivery_id)
        VALUES ($1, $2)
        ON CONFLICT (target, github_delivery_id) DO UPDATE
          SET attempt_count = github_webhook_recovery_attempts.attempt_count + 1, last_attempt_at = now()
          WHERE github_webhook_recovery_attempts.last_attempt_at < now() - ($3 * interval '1 second')
        RETURNING github_delivery_id`,
      values: [target, deliveryId, minimumIntervalSeconds]
    });
    return result.rowCount === 1;
  }

  async maintain(retentionDays: number): Promise<number> {
    let deleted = 0;
    for (let batch = 0; batch < 10; batch += 1) {
      const result = await this.#pool.query(`WITH doomed AS (
          SELECT delivery_id FROM github_webhook_deliveries
          WHERE received_at < now() - ($1 * interval '1 day')
          ORDER BY received_at ASC LIMIT 10000
        )
        DELETE FROM github_webhook_deliveries AS deliveries
        USING doomed WHERE deliveries.delivery_id = doomed.delivery_id`, [retentionDays]);
      deleted += result.rowCount ?? 0;
      if ((result.rowCount ?? 0) < 10_000) break;
    }
    await this.#pool.query("DELETE FROM github_webhook_recovery_attempts WHERE last_attempt_at < now() - interval '4 days'");
    return deleted;
  }

  async close(): Promise<void> { await this.#pool.end(); }
}

type SummaryRow = QueryResultRow & { total: number; last_24_hours: number; event_types: number; latest_received_at: Date | null };
type EventCountRow = QueryResultRow & { event_type: string; count: number };
type DeliveryRow = QueryResultRow & {
  delivery_id: string; hook_id: string | null; event_type: string; action: string | null;
  processing_status: 'processed' | 'invalid'; last_error: string | null;
  received_at: Date; processed_at: Date; repository_id: string | null; repository_full_name: string | null;
  organization_id: string | null; organization_login: string | null; installation_id: string | null;
  sender_id: string | null; sender_login: string | null; payload_bytes: number; payload_sha256: string;
};

function mapDelivery(row: DeliveryRow): DeliveryListItem {
  return {
    deliveryId: row.delivery_id, hookId: row.hook_id, eventType: row.event_type, action: row.action,
    processingStatus: row.processing_status, lastError: row.last_error,
    receivedAt: row.received_at.toISOString(), processedAt: row.processed_at.toISOString(),
    repositoryId: row.repository_id, repositoryFullName: row.repository_full_name,
    organizationId: row.organization_id, organizationLogin: row.organization_login,
    installationId: row.installation_id, senderId: row.sender_id, senderLogin: row.sender_login,
    payloadBytes: Number(row.payload_bytes), payloadSha256: row.payload_sha256
  };
}

function encodeCursor(value: { receivedAt: string; deliveryId: string }): string {
  return Buffer.from(JSON.stringify({ receivedAt: value.receivedAt, deliveryId: value.deliveryId })).toString('base64url');
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as Cursor).receivedAt === 'string' && !Number.isNaN(Date.parse((parsed as Cursor).receivedAt)) &&
      typeof (parsed as Cursor).deliveryId === 'string') return parsed as Cursor;
  } catch { /* normalized below */ }
  throw Object.assign(new Error('The pagination cursor is invalid.'), { statusCode: 400 });
}

function compareDelivery(left: { receivedAt: string; deliveryId: string }, right: { receivedAt: string; deliveryId: string }): number {
  const byTime = Date.parse(right.receivedAt) - Date.parse(left.receivedAt);
  return byTime || right.deliveryId.localeCompare(left.deliveryId);
}

function dateString(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}
