import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { withRetry } from '../utils/withRetry';

type CircuitState = 'closed' | 'open' | 'half_open';

type ExternalAResult =
  | {
      ok: true;
      source: 'live';
      data: unknown;
    }
  | {
      ok: true;
      source: 'fallback';
      data: unknown;
      reason: string;
    };

const jsonUnknownSchema = z.unknown();

let breakerState: CircuitState = 'closed';
let consecutiveFailures = 0;
let openedAtMs: number | null = null;
let lastSuccessData: unknown | null = null;

function nowMs() {
  return Date.now();
}

function isBreakerOpen() {
  if (breakerState !== 'open') return false;
  if (!openedAtMs) return true;
  return nowMs() - openedAtMs < env.EXTERNAL_A_BREAKER_COOLDOWN_MS;
}

function maybeToHalfOpen() {
  if (breakerState !== 'open') return;
  if (isBreakerOpen()) return;
  breakerState = 'half_open';
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`External API A error ${res.status}: ${text.slice(0, 300)}`);
    }

    const parsed = jsonUnknownSchema.parse(JSON.parse(text));
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function openBreaker(reason: string) {
  breakerState = 'open';
  openedAtMs = nowMs();
  logger.warn(
    {
      reason,
      consecutiveFailures,
      cooldownMs: env.EXTERNAL_A_BREAKER_COOLDOWN_MS,
      threshold: env.EXTERNAL_A_BREAKER_FAILURE_THRESHOLD,
    },
    'External API A circuit breaker opened',
  );
}

function recordSuccess(data: unknown) {
  lastSuccessData = data;
  consecutiveFailures = 0;
  openedAtMs = null;
  breakerState = 'closed';
}

function recordFailure(err: unknown) {
  consecutiveFailures += 1;
  const message = err instanceof Error ? err.message : String(err);

  logger.warn(
    {
      err: message,
      consecutiveFailures,
      threshold: env.EXTERNAL_A_BREAKER_FAILURE_THRESHOLD,
      state: breakerState,
    },
    'External API A request failed',
  );

  if (consecutiveFailures >= env.EXTERNAL_A_BREAKER_FAILURE_THRESHOLD) {
    openBreaker(message);
  }
}

export function getExternalAHealth() {
  const cooldownRemainingMs =
    breakerState === 'open' && openedAtMs
      ? Math.max(0, env.EXTERNAL_A_BREAKER_COOLDOWN_MS - (nowMs() - openedAtMs))
      : 0;

  return {
    enabled: env.EXTERNAL_A_ENABLED,
    state: breakerState,
    consecutiveFailures,
    cooldownRemainingMs,
    hasFallbackCache: lastSuccessData !== null,
  };
}

export async function fetchExternalApiA(): Promise<ExternalAResult> {
  if (!env.EXTERNAL_A_ENABLED) {
    return {
      ok: true,
      source: 'fallback',
      data: { message: 'External API A disabled' },
      reason: 'disabled',
    };
  }

  maybeToHalfOpen();

  if (isBreakerOpen()) {
    const cached = lastSuccessData ?? { message: 'External API A temporarily unavailable' };
    return {
      ok: true,
      source: 'fallback',
      data: cached,
      reason: 'circuit_open',
    };
  }

  const url = env.EXTERNAL_A_URL!;

  try {
    const data = await withRetry(() => fetchJsonWithTimeout(url, env.EXTERNAL_A_TIMEOUT_MS), {
      retries: env.EXTERNAL_A_RETRIES,
      baseDelayMs: env.EXTERNAL_A_RETRY_BASE_DELAY_MS,
      maxDelayMs: env.EXTERNAL_A_RETRY_MAX_DELAY_MS,
      shouldRetry: (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('error 400') || msg.includes('error 401') || msg.includes('error 403')) {
          return false;
        }
        return true;
      },
    });

    recordSuccess(data);

    return {
      ok: true,
      source: 'live',
      data,
    };
  } catch (err) {
    recordFailure(err);

    const cached = lastSuccessData ?? { message: 'External API A failed; fallback used' };
    return {
      ok: true,
      source: 'fallback',
      data: cached,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
