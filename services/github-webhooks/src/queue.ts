import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import type { WebhookConsumer, WebhookEnvelope, WebhookPublisher } from './domain.js';

const exchange = 'github.webhooks';
const deadLetterExchange = 'github.webhooks.dead';
const deadLetterQueue = 'github.webhooks.dead';
const routingKey = 'raw';
const retryDelays = [5_000, 30_000, 300_000] as const;

export class MemoryWebhookBroker implements WebhookPublisher, WebhookConsumer {
  readonly #pending: WebhookEnvelope[] = [];
  #handler: ((envelope: WebhookEnvelope) => Promise<void>) | undefined;
  #closed = false;

  async start(handler?: (envelope: WebhookEnvelope) => Promise<void>, signal?: AbortSignal): Promise<void> {
    if (handler) this.#handler = handler;
    signal?.addEventListener('abort', () => { this.#closed = true; }, { once: true });
    await this.#drain();
  }

  ready(): boolean { return !this.#closed; }

  async publish(envelope: WebhookEnvelope): Promise<void> {
    if (this.#closed) throw new Error('In-memory webhook broker is closed.');
    this.#pending.push({ ...envelope, headers: { ...envelope.headers }, body: Buffer.from(envelope.body) });
    await this.#drain();
  }

  async close(): Promise<void> { this.#closed = true; }

  async #drain(): Promise<void> {
    while (this.#handler && this.#pending.length > 0 && !this.#closed) {
      const envelope = this.#pending.shift();
      if (envelope) await this.#handler(envelope);
    }
  }
}

export class RabbitWebhookPublisher implements WebhookPublisher {
  readonly #url: string;
  readonly #queueName: string;
  #connection: ChannelModel | undefined;
  #channel: ConfirmChannel | undefined;
  #connecting: Promise<void> | undefined;
  #reconnectTimer: NodeJS.Timeout | undefined;
  #closed = false;

  constructor(url: string, queueName: string) {
    this.#url = url;
    this.#queueName = queueName;
  }

  async start(): Promise<void> {
    if (this.#channel || this.#closed) return;
    if (this.#connecting) return this.#connecting;
    this.#connecting = this.#connect().finally(() => { this.#connecting = undefined; });
    return this.#connecting;
  }

  ready(): boolean { return Boolean(this.#channel); }

  async publish(envelope: WebhookEnvelope): Promise<void> {
    await this.start();
    const channel = this.#channel;
    if (!channel) throw new Error('RabbitMQ publisher is unavailable.');
    await confirmedPublish(channel, exchange, routingKey, envelope.body, {
      contentType: envelope.contentType,
      contentEncoding: 'utf-8',
      deliveryMode: 2,
      messageId: envelope.deliveryId,
      timestamp: Math.floor(Date.parse(envelope.receivedAt) / 1_000),
      type: envelope.eventType,
      headers: {
        ...envelope.headers,
        'atlas-received-at': envelope.receivedAt,
        'atlas-hook-id': envelope.hookId ?? '',
        'atlas-attempt': 0
      }
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    await this.#channel?.close().catch(() => undefined);
    await this.#connection?.close().catch(() => undefined);
    this.#channel = undefined;
    this.#connection = undefined;
  }

  async #connect(): Promise<void> {
    const connection = await connect(this.#url, {
      timeout: 2_500,
      keepAlive: true,
      keepAliveDelay: 10_000,
      clientProperties: { connection_name: 'github-webhooks-receiver' }
    });
    const channel = await connection.createConfirmChannel();
    await assertTopology(channel, this.#queueName);
    const disconnected = () => {
      if (this.#connection !== connection) return;
      this.#channel = undefined;
      this.#connection = undefined;
      void connection.close().catch(() => undefined);
      this.#scheduleReconnect();
    };
    connection.once('close', disconnected);
    connection.once('error', disconnected);
    channel.once('close', disconnected);
    channel.once('error', disconnected);
    this.#connection = connection;
    this.#channel = channel;
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#reconnectTimer) return;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.start().catch(() => this.#scheduleReconnect());
    }, 1_000);
    this.#reconnectTimer.unref();
  }
}

export class RabbitWebhookConsumer implements WebhookConsumer {
  readonly #url: string;
  readonly #queueName: string;
  readonly #prefetch: number;
  #connection: ChannelModel | undefined;
  #channel: ConfirmChannel | undefined;
  #handler: ((envelope: WebhookEnvelope) => Promise<void>) | undefined;
  #reconnectTimer: NodeJS.Timeout | undefined;
  #closed = false;

  constructor(url: string, queueName: string, prefetch = 8) {
    this.#url = url;
    this.#queueName = queueName;
    this.#prefetch = prefetch;
  }

  ready(): boolean { return Boolean(this.#channel); }

  async start(handler: (envelope: WebhookEnvelope) => Promise<void>, signal: AbortSignal): Promise<void> {
    this.#handler = handler;
    signal.addEventListener('abort', () => { void this.close(); }, { once: true });
    if (signal.aborted) { await this.close(); return; }
    await this.#connect();
  }

  async close(): Promise<void> {
    this.#closed = true;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    await this.#channel?.close().catch(() => undefined);
    await this.#connection?.close().catch(() => undefined);
    this.#channel = undefined;
    this.#connection = undefined;
  }

  async #connect(): Promise<void> {
    if (this.#closed || this.#channel || !this.#handler) return;
    const connection = await connect(this.#url, {
      timeout: 5_000,
      keepAlive: true,
      keepAliveDelay: 10_000,
      clientProperties: { connection_name: 'github-webhooks-worker' }
    });
    try {
      const channel = await connection.createConfirmChannel();
      await assertTopology(channel, this.#queueName);
      await channel.prefetch(this.#prefetch);
      const disconnected = () => {
        if (this.#connection !== connection) return;
        this.#channel = undefined;
        this.#connection = undefined;
        void connection.close().catch(() => undefined);
        this.#scheduleReconnect();
      };
      connection.once('close', disconnected);
      connection.once('error', disconnected);
      channel.once('close', disconnected);
      channel.once('error', disconnected);
      this.#connection = connection;
      this.#channel = channel;
      await channel.consume(this.#queueName, (message) => {
        if (message && this.#handler) void this.#handle(message, this.#handler);
      }, { noAck: false });
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#reconnectTimer) return;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.#connect().catch(() => this.#scheduleReconnect());
    }, 1_000);
    this.#reconnectTimer.unref();
  }

  async #handle(message: ConsumeMessage, handler: (envelope: WebhookEnvelope) => Promise<void>): Promise<void> {
    const channel = this.#channel;
    if (!channel) return;
    const envelope = envelopeFromMessage(message);
    try {
      await handler(envelope);
      if (this.#channel !== channel) return;
      channel.ack(message);
    } catch (error) {
      if (this.#channel !== channel) return;
      const attempt = integerHeader(message.properties.headers?.['atlas-attempt']);
      if (attempt < retryDelays.length) {
        try {
          await confirmedPublish(channel, '', retryQueue(this.#queueName, attempt), message.content, {
            ...message.properties,
            headers: { ...message.properties.headers, 'atlas-attempt': attempt + 1 }
          });
          channel.ack(message);
          return;
        } catch {
          try { channel.nack(message, false, true); } catch { /* connection recovery requeues it */ }
          return;
        }
      }
      try { channel.nack(message, false, false); } catch { /* connection recovery requeues it */ }
      void error;
    }
  }
}

async function assertTopology(channel: ConfirmChannel, queueName: string): Promise<void> {
  await channel.assertExchange(exchange, 'direct', { durable: true });
  await channel.assertExchange(deadLetterExchange, 'direct', { durable: true });
  await channel.assertQueue(deadLetterQueue, { durable: true, arguments: { 'x-queue-type': 'quorum' } });
  await channel.bindQueue(deadLetterQueue, deadLetterExchange, 'dead');
  await channel.assertQueue(queueName, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-delivery-limit': 20,
      'x-dead-letter-exchange': deadLetterExchange,
      'x-dead-letter-routing-key': 'dead'
    }
  });
  await channel.bindQueue(queueName, exchange, routingKey);
  for (const [index, delay] of retryDelays.entries()) {
    await channel.assertQueue(retryQueue(queueName, index), {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-message-ttl': delay,
        'x-dead-letter-exchange': exchange,
        'x-dead-letter-routing-key': routingKey
      }
    });
  }
}

function envelopeFromMessage(message: ConsumeMessage): WebhookEnvelope {
  const headers = Object.fromEntries(
    Object.entries(message.properties.headers ?? {})
      .filter(([name, value]) => !name.startsWith('atlas-') && typeof value === 'string')
      .map(([name, value]) => [name, String(value)])
  );
  const contentType = message.properties.contentType === 'application/x-www-form-urlencoded'
    ? 'application/x-www-form-urlencoded'
    : 'application/json';
  return {
    deliveryId: message.properties.messageId ?? headers['x-github-delivery'] ?? 'missing',
    eventType: message.properties.type ?? headers['x-github-event'] ?? 'unknown',
    hookId: stringHeader(message.properties.headers?.['atlas-hook-id']),
    contentType,
    receivedAt: stringHeader(message.properties.headers?.['atlas-received-at']) ?? new Date(message.properties.timestamp ? message.properties.timestamp * 1_000 : Date.now()).toISOString(),
    headers,
    body: Buffer.from(message.content)
  };
}

function retryQueue(queueName: string, index: number): string {
  return `${queueName}.retry.${index + 1}`;
}

function integerHeader(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function stringHeader(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function confirmedPublish(
  channel: ConfirmChannel,
  targetExchange: string,
  targetRoutingKey: string,
  content: Buffer,
  options: Parameters<ConfirmChannel['publish']>[3]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('RabbitMQ publisher confirmation timed out.')), 2_500);
    channel.publish(targetExchange, targetRoutingKey, content, options, (error) => {
      clearTimeout(timeout);
      if (error) reject(error); else resolve();
    });
  });
}
