import type { DeliveryProjection, DeliveryStore, WebhookEnvelope } from './domain.js';
import { parsePayload, projectPayload } from './webhook.js';

export async function processWebhook(store: DeliveryStore, envelope: WebhookEnvelope): Promise<'created' | 'duplicate'> {
  let projection: DeliveryProjection;
  try {
    projection = projectPayload(parsePayload(envelope));
  } catch (error) {
    projection = {
      processingStatus: 'invalid',
      lastError: (error instanceof Error ? error.message : 'Payload could not be parsed.').slice(0, 1_000),
      action: null,
      repositoryId: null,
      repositoryFullName: null,
      organizationId: null,
      organizationLogin: null,
      installationId: null,
      senderId: null,
      senderLogin: null
    };
  }
  return store.persist(envelope, projection);
}
