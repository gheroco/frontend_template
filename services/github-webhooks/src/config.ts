import { z } from 'zod';
import { GITHUB_MAX_PAYLOAD_BYTES } from './domain.js';

const positiveInteger = z.coerce.number().int().positive();
const runtimeSchema = z.object({
  runtime: z.enum(['memory', 'external']),
  serviceVersion: z.string().min(1),
  port: positiveInteger.max(65_535),
  host: z.string().min(1),
  webhookSecrets: z.array(z.string().min(32)).min(1),
  maxPayloadBytes: positiveInteger.max(GITHUB_MAX_PAYLOAD_BYTES),
  amqpUrl: z.string().url().optional(),
  databaseUrl: z.string().url().optional(),
  queueName: z.string().min(1).max(128),
  databasePoolSize: positiveInteger.max(20),
  retentionDays: positiveInteger.max(3650)
}).superRefine((value, context) => {
  if (value.runtime === 'external' && !value.amqpUrl) {
    context.addIssue({ code: 'custom', path: ['amqpUrl'], message: 'AMQP_URL is required in external runtime mode' });
  }
  if (value.runtime === 'external' && !value.databaseUrl) {
    context.addIssue({ code: 'custom', path: ['databaseUrl'], message: 'DATABASE_URL is required in external runtime mode' });
  }
});

export type RuntimeConfig = z.infer<typeof runtimeSchema>;

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const runtime = environment.WEBHOOK_RUNTIME === 'external' ? 'external' : 'memory';
  const secrets = [environment.GITHUB_WEBHOOK_SECRET, environment.GITHUB_WEBHOOK_PREVIOUS_SECRET]
    .filter((value): value is string => Boolean(value));
  return runtimeSchema.parse({
    runtime,
    serviceVersion: environment.SERVICE_VERSION ?? '1.0.0',
    port: environment.GITHUB_WEBHOOKS_PORT ?? environment.PORT ?? '4203',
    host: environment.HOST ?? '0.0.0.0',
    webhookSecrets: secrets.length > 0 ? secrets : runtime === 'memory' ? ['development-only-webhook-secret-change-me'] : [],
    maxPayloadBytes: environment.GITHUB_MAX_PAYLOAD_BYTES ?? String(GITHUB_MAX_PAYLOAD_BYTES),
    amqpUrl: environment.AMQP_URL,
    databaseUrl: environment.DATABASE_URL,
    queueName: environment.GITHUB_WEBHOOK_QUEUE ?? 'github.webhooks.raw',
    databasePoolSize: environment.DATABASE_POOL_SIZE ?? '4',
    retentionDays: environment.WEBHOOK_RETENTION_DAYS ?? '90'
  });
}
