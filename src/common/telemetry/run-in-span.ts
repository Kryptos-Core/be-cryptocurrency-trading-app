import { trace } from '@opentelemetry/api';

const TRACER_NAME = 'be-cryptocurrency-trading-app';

/**
 * Runs `fn` inside an active OTel span with optional string attributes.
 */
export async function runInSpan<T>(
  spanName: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return await tracer.startActiveSpan(spanName, async (span) => {
    try {
      if (attributes) {
        for (const [k, v] of Object.entries(attributes)) {
          span.setAttribute(k, v);
        }
      }
      return await fn();
    } finally {
      span.end();
    }
  });
}
