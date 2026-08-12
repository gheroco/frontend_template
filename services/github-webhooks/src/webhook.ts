import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { DeliveryProjection, WebhookEnvelope } from './domain.js';

const deliveryPattern = /^[A-Za-z0-9-]{1,128}$/;
const eventPattern = /^[A-Za-z0-9_.-]{1,128}$/;
const storedHeaderNames = [
  'content-type',
  'user-agent',
  'x-github-delivery',
  'x-github-event',
  'x-github-hook-id',
  'x-github-hook-installation-target-id',
  'x-github-hook-installation-target-type'
] as const;

export function verifyGithubSignature(body: Buffer, signature: string | undefined, secrets: readonly string[]): boolean {
  if (!signature?.startsWith('sha256=') || signature.length !== 71 || secrets.length === 0) return false;
  const supplied = Buffer.from(signature, 'utf8');
  let valid = false;
  for (const secret of secrets) {
    const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`, 'utf8');
    const comparable = supplied.length === expected.length ? supplied : expected;
    valid = (timingSafeEqual(expected, comparable) && supplied.length === expected.length) || valid;
  }
  return valid;
}

export function envelopeFromRequest(request: FastifyRequest, body: Buffer): WebhookEnvelope {
  const deliveryId = singleHeader(request.headers['x-github-delivery']);
  const eventType = singleHeader(request.headers['x-github-event']);
  if (!deliveryId || !deliveryPattern.test(deliveryId)) throw requestError(400, 'invalid_delivery_id', 'X-GitHub-Delivery is missing or invalid.');
  if (!eventType || !eventPattern.test(eventType)) throw requestError(400, 'invalid_event_type', 'X-GitHub-Event is missing or invalid.');
  const contentType = normalizeContentType(singleHeader(request.headers['content-type']));
  if (!contentType) throw requestError(415, 'unsupported_media_type', 'Use application/json or application/x-www-form-urlencoded.');

  const headers: Record<string, string> = {};
  for (const name of storedHeaderNames) {
    const value = singleHeader(request.headers[name]);
    if (value) headers[name] = value.slice(0, 512);
  }
  return {
    deliveryId,
    eventType,
    hookId: singleHeader(request.headers['x-github-hook-id'])?.slice(0, 64) ?? null,
    contentType,
    receivedAt: new Date().toISOString(),
    headers,
    body
  };
}

export function parsePayload(envelope: WebhookEnvelope): Record<string, unknown> {
  const text = envelope.body.toString('utf8');
  const source = envelope.contentType === 'application/json'
    ? text
    : new URLSearchParams(text).get('payload');
  if (!source) throw new Error('Webhook payload is empty.');
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) throw new Error('Webhook payload must be a JSON object.');
  return value;
}

export function projectPayload(payload: Record<string, unknown>): DeliveryProjection {
  const repository = record(payload.repository);
  const organization = record(payload.organization);
  const installation = record(payload.installation);
  const sender = record(payload.sender);
  return {
    processingStatus: 'processed',
    lastError: null,
    action: stringValue(payload.action),
    repositoryId: identifier(repository?.id),
    repositoryFullName: stringValue(repository?.full_name),
    organizationId: identifier(organization?.id),
    organizationLogin: stringValue(organization?.login),
    installationId: identifier(installation?.id),
    senderId: identifier(sender?.id),
    senderLogin: stringValue(sender?.login)
  };
}

export function payloadSha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function normalizeContentType(value: string | undefined): WebhookEnvelope['contentType'] | null {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json' || mediaType === 'application/x-www-form-urlencoded' ? mediaType : null;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

function record(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 512) : null;
}

function identifier(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 128) : null;
}

function requestError(statusCode: number, name: string, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.name = name;
  error.statusCode = statusCode;
  return error;
}
