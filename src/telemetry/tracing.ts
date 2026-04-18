/**
 * OpenTelemetry SDK Bootstrap
 *
 * This file must be loaded BEFORE NestJS initialises via the --require flag in
 * the Node startup command. Add to package.json scripts or to the nest-cli.json
 * assets:
 *
 *   node --require ./dist/telemetry/tracing.js dist/main
 *
 * Or in development with ts-node:
 *   ts-node --require ./src/telemetry/tracing.ts src/main.ts
 *
 * Environment variables:
 *   OTEL_ENABLED        — "true" to enable (defaults to false in development)
 *   OTEL_SERVICE_NAME   — service name tag (default: "kryptos-backend")
 *   OTEL_SERVICE_VERSION— service version tag (default: "1.0.0")
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP collector endpoint (e.g. http://localhost:4318)
 *   OTEL_TRACES_SAMPLER — "always_on" | "always_off" | "parentbased_traceid_ratio"
 *   OTEL_TRACES_SAMPLER_ARG — sampling ratio (0.0–1.0) when using ratio sampler
 */

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const enabled = process.env.OTEL_ENABLED === 'true';
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'kryptos-backend';
const serviceVersion = process.env.OTEL_SERVICE_VERSION ?? '1.0.0';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

let sdk: NodeSDK | null = null;

if (enabled) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${otlpEndpoint}/v1/metrics`,
      }),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[OTel] Tracing started — service: ${serviceName}, endpoint: ${otlpEndpoint}`);

  const otelSdk = sdk;
  process.on('SIGTERM', () => {
    if (!otelSdk) return;
    void otelSdk
      .shutdown()
      .then(() => console.log('[OTel] SDK shut down'))
      .catch((err: Error) => console.error('[OTel] SDK shutdown error', err))
      .finally(() => process.exit(0));
  });
} else {
  console.log('[OTel] Tracing disabled (set OTEL_ENABLED=true to enable)');
}

export { sdk };
