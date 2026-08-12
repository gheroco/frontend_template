import type { RuntimeConfig } from './config.js';
import type { DeliveryStore, WebhookConsumer, WebhookPublisher } from './domain.js';
import { MemoryWebhookBroker, RabbitWebhookConsumer, RabbitWebhookPublisher } from './queue.js';
import { MemoryDeliveryStore, PostgresDeliveryStore } from './storage.js';

export type RuntimeDependencies = {
  publisher: WebhookPublisher;
  consumer: WebhookConsumer;
  store: DeliveryStore;
};

export function createRuntime(config: RuntimeConfig): RuntimeDependencies {
  if (config.runtime === 'memory') {
    const broker = new MemoryWebhookBroker();
    return { publisher: broker, consumer: broker, store: new MemoryDeliveryStore() };
  }
  const amqpUrl = config.amqpUrl as string;
  return {
    publisher: new RabbitWebhookPublisher(amqpUrl, config.queueName),
    consumer: new RabbitWebhookConsumer(amqpUrl, config.queueName, Number(process.env.WORKER_PREFETCH ?? 8)),
    store: new PostgresDeliveryStore(
      config.databaseUrl as string,
      config.databasePoolSize,
      process.env.RUN_MIGRATIONS === 'true'
    )
  };
}
