import { env } from '../config/env';
import { fetchExternalApiA, getExternalAHealth } from '../services/externalApiA';
import { dedupeInFlight } from '../utils/dedupeInFlight';

export async function getExternalAHealthController() {
  return getExternalAHealth();
}

export async function getExternalASyncController() {
  const { value: result, deduped } = await dedupeInFlight('external-a:sync', fetchExternalApiA);

  return {
    headers: {
      'x-external-a-source': result.source,
      'x-dedupe': deduped ? 'HIT' : 'MISS',
    },
    body: {
      ok: true,
      enabled: env.EXTERNAL_A_ENABLED,
      source: result.source,
      ...(result.source === 'fallback' ? { fallbackReason: result.reason } : {}),
      data: result.data,
    },
  };
}
