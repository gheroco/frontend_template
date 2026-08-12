import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

let activeSdk: NodeSDK | undefined;

export async function startTelemetry(serviceName: string, serviceVersion: string): Promise<void> {
  const baseEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!baseEndpoint || activeSdk) return;

  activeSdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: `${baseEndpoint.replace(/\/$/, '')}/v1/traces`,
      headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
    }),
    instrumentations: [getNodeAutoInstrumentations()],
    resourceDetectors: []
  });
  process.env.OTEL_RESOURCE_ATTRIBUTES = [
    process.env.OTEL_RESOURCE_ATTRIBUTES,
    `service.version=${serviceVersion}`,
    `deployment.environment.name=${process.env.DEPLOYMENT_ENVIRONMENT ?? 'development'}`
  ].filter(Boolean).join(',');
  await activeSdk.start();
}

export async function stopTelemetry(): Promise<void> {
  const sdk = activeSdk;
  activeSdk = undefined;
  if (sdk) await sdk.shutdown();
}

function parseHeaders(value: string | undefined): Record<string, string> {
  if (!value) return {};
  return Object.fromEntries(
    value.split(',').map((pair) => pair.split('=', 2)).filter((pair): pair is [string, string] => pair.length === 2)
  );
}

