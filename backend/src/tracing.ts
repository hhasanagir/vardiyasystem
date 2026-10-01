import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { SocketIoInstrumentation } from '@opentelemetry/instrumentation-socket.io';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import {
  resourceFromAttributes,
  detectResources,
  processDetector,
  envDetector,
} from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

const ENABLED = process.env.OTEL_ENABLED === 'true';
const OTEL_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

if (ENABLED) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

  const custom = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'vardiya-api',
    [SemanticResourceAttributes.SERVICE_VERSION]:
      process.env.npm_package_version || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
      process.env.NODE_ENV || 'development',
  });

  const detected = detectResources({
    detectors: [processDetector, envDetector],
  });
  const resource = custom.merge(detected);

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${OTEL_ENDPOINT}/v1/traces`,
    }) as any,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            const url = (req as { url?: string }).url || '';
            return (
              url === '/api/v1/health/live' || url === '/api/v1/health/ready'
            );
          },
        },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
      new NestInstrumentation(),
      new SocketIoInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();
  diag.info('OpenTelemetry SDK started');

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => diag.info('OpenTelemetry SDK shut down'))
      .catch((err) => diag.error('Error shutting down OpenTelemetry SDK', err))
      .finally(() => process.exit(0));
  });
}
