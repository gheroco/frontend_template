export const GITHUB_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

export type WebhookEnvelope = {
  deliveryId: string;
  eventType: string;
  hookId: string | null;
  contentType: 'application/json' | 'application/x-www-form-urlencoded';
  receivedAt: string;
  headers: Record<string, string>;
  body: Buffer;
};

export type DeliveryProjection = {
  processingStatus: 'processed' | 'invalid';
  lastError: string | null;
  action: string | null;
  repositoryId: string | null;
  repositoryFullName: string | null;
  organizationId: string | null;
  organizationLogin: string | null;
  installationId: string | null;
  senderId: string | null;
  senderLogin: string | null;
};

export type DeliveryListItem = DeliveryProjection & {
  deliveryId: string;
  hookId: string | null;
  eventType: string;
  receivedAt: string;
  processedAt: string;
  payloadBytes: number;
  payloadSha256: string;
};

export type DeliverySummary = {
  total: number;
  last24Hours: number;
  eventTypes: number;
  latestReceivedAt: string | null;
  topEventTypes: Array<{ eventType: string; count: number }>;
};

export type DeliveryPage = {
  deliveries: DeliveryListItem[];
  nextCursor: string | null;
};

export interface WebhookPublisher {
  start(): Promise<void>;
  ready(): boolean;
  publish(envelope: WebhookEnvelope): Promise<void>;
  close(): Promise<void>;
}

export interface WebhookConsumer {
  start(handler: (envelope: WebhookEnvelope) => Promise<void>, signal: AbortSignal): Promise<void>;
  ready(): boolean;
  close(): Promise<void>;
}

export interface DeliveryStore {
  start(): Promise<void>;
  ready(): Promise<boolean>;
  persist(envelope: WebhookEnvelope, projection: DeliveryProjection): Promise<'created' | 'duplicate'>;
  summary(): Promise<DeliverySummary>;
  list(input: { limit: number; eventType?: string; cursor?: string }): Promise<DeliveryPage>;
  reserveRecoveryAttempt(target: string, deliveryId: number, minimumIntervalSeconds: number): Promise<boolean>;
  maintain(retentionDays: number): Promise<number>;
  close(): Promise<void>;
}
