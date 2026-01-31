import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { sleep } from '../utils/sleep';
import { getRedisClient, getRedisHealth } from './redis';

type CachedToken = {
  accessToken: string;
  tokenType: string;
  expiresAtMs: number;
};

const cachedTokenSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().min(1).default('Bearer'),
  expiresAtMs: z.number().int().positive(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1).optional(),
  expires_in: z.coerce.number().int().positive(),
});

let lastError: string | null = null;
let autoRefreshTimer: NodeJS.Timeout | null = null;

function requireM2MConfigured() {
  if (!env.AUTH0_M2M_ENABLED)
    throw new Error('Auth0 M2M token flow is disabled (AUTH0_M2M_ENABLED=false).');
  if (!env.REDIS_ENABLED) throw new Error('Redis must be enabled for Auth0 M2M token caching.');
  if (!env.AUTH0_M2M_TOKEN_URL) throw new Error('AUTH0_M2M_TOKEN_URL is required.');
  if (!env.AUTH0_M2M_CLIENT_ID) throw new Error('AUTH0_M2M_CLIENT_ID is required.');
  if (!env.AUTH0_M2M_CLIENT_SECRET) throw new Error('AUTH0_M2M_CLIENT_SECRET is required.');
  if (!env.AUTH0_M2M_AUDIENCE) throw new Error('AUTH0_M2M_AUDIENCE is required.');
}

async function getCached(redisKey: string) {
  const redis = getRedisClient();
  const [raw, ttlMs] = await Promise.all([redis.get(redisKey), redis.pttl(redisKey)]);

  if (!raw) return { token: null as CachedToken | null, ttlMs };
  const parsed = cachedTokenSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return { token: null as CachedToken | null, ttlMs };

  return { token: parsed.data, ttlMs };
}

async function setCached(redisKey: string, token: CachedToken, ttlMs: number) {
  const redis = getRedisClient();
  await redis.set(redisKey, JSON.stringify(token), 'PX', ttlMs);
}

async function acquireLock(lockKey: string, ttlMs: number) {
  const redis = getRedisClient();
  const lockValue = randomUUID();
  const result = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
  return result === 'OK' ? lockValue : null;
}

async function releaseLock(lockKey: string, lockValue: string) {
  const redis = getRedisClient();
  const lua = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(lua, 1, lockKey, lockValue);
}

async function fetchAuth0ClientCredentialsToken() {
  requireM2MConfigured();

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', env.AUTH0_M2M_CLIENT_ID!);
  params.set('client_secret', env.AUTH0_M2M_CLIENT_SECRET!);
  params.set('audience', env.AUTH0_M2M_AUDIENCE!);
  if (env.AUTH0_M2M_SCOPE) params.set('scope', env.AUTH0_M2M_SCOPE);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AUTH0_M2M_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(env.AUTH0_M2M_TOKEN_URL!, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: params.toString(),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Auth0 token error ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = JSON.parse(text) as unknown;
    const parsed = tokenResponseSchema.parse(json);

    return {
      accessToken: parsed.access_token,
      tokenType: parsed.token_type ?? 'Bearer',
      expiresInSeconds: parsed.expires_in,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshWithLock() {
  requireM2MConfigured();

  const redisKey = env.AUTH0_M2M_TOKEN_CACHE_KEY;
  const lockKey = env.AUTH0_M2M_TOKEN_LOCK_KEY;
  const skewMs = env.AUTH0_M2M_REFRESH_SKEW_SECONDS * 1000;

  const { token: cached, ttlMs } = await getCached(redisKey);
  if (cached && ttlMs > skewMs) return cached;

  const lockValue = await acquireLock(lockKey, env.AUTH0_M2M_TOKEN_LOCK_TTL_MS);
  if (lockValue) {
    try {
      const again = await getCached(redisKey);
      if (again.token && again.ttlMs > skewMs) return again.token;

      const fetched = await fetchAuth0ClientCredentialsToken();
      const ttlMsNew = Math.max(1, fetched.expiresInSeconds * 1000);
      const token: CachedToken = {
        accessToken: fetched.accessToken,
        tokenType: fetched.tokenType,
        expiresAtMs: Date.now() + ttlMsNew,
      };

      await setCached(redisKey, token, ttlMsNew);
      lastError = null;
      logger.info({ expiresInSeconds: fetched.expiresInSeconds }, 'Auth0 M2M token refreshed');
      return token;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      await releaseLock(lockKey, lockValue).catch(() => undefined);
    }
  }

  let delay = 50;
  const maxWaitMs = env.AUTH0_M2M_TOKEN_LOCK_TTL_MS + 5_000;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const { token, ttlMs: ttl } = await getCached(redisKey);
    if (token && ttl > skewMs) return token;

    await sleep(delay);
    delay = Math.min(1000, delay * 2);
  }

  throw new Error('Timed out waiting for Auth0 M2M token refresh lock.');
}

export async function getAuth0M2MAccessToken(): Promise<string> {
  requireM2MConfigured();

  const redisKey = env.AUTH0_M2M_TOKEN_CACHE_KEY;
  const skewMs = env.AUTH0_M2M_REFRESH_SKEW_SECONDS * 1000;

  const { token, ttlMs } = await getCached(redisKey);
  if (token && ttlMs > skewMs) return token.accessToken;

  const refreshed = await refreshWithLock();
  return refreshed.accessToken;
}

export async function getAuth0M2MAuthorizationHeaderValue(): Promise<string> {
  requireM2MConfigured();

  const redisKey = env.AUTH0_M2M_TOKEN_CACHE_KEY;
  const skewMs = env.AUTH0_M2M_REFRESH_SKEW_SECONDS * 1000;

  const { token, ttlMs } = await getCached(redisKey);
  if (token && ttlMs > skewMs) return `${token.tokenType} ${token.accessToken}`;

  const refreshed = await refreshWithLock();
  return `${refreshed.tokenType} ${refreshed.accessToken}`;
}

export async function getAuth0M2MTokenHealth() {
  const redisHealth = getRedisHealth();
  const enabled = env.AUTH0_M2M_ENABLED;

  if (!enabled) {
    return {
      enabled: false,
      status: 'disabled' as const,
      cached: false,
      ttlMs: null as number | null,
    };
  }

  if (!redisHealth.enabled || redisHealth.status !== 'up') {
    return {
      enabled: true,
      status: 'redis_not_ready' as const,
      cached: false,
      ttlMs: null as number | null,
      lastError,
    };
  }

  try {
    const redis = getRedisClient();
    const ttlMs = await redis.pttl(env.AUTH0_M2M_TOKEN_CACHE_KEY);
    return {
      enabled: true,
      status: 'ok' as const,
      cached: ttlMs > 0,
      ttlMs: ttlMs > 0 ? ttlMs : null,
      lastError,
    };
  } catch (err) {
    return {
      enabled: true,
      status: 'error' as const,
      cached: false,
      ttlMs: null as number | null,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

export function startAuth0M2MTokenAutoRefresh() {
  if (!env.AUTH0_M2M_ENABLED) return;
  if (!env.REDIS_ENABLED) {
    logger.warn('Auth0 M2M enabled but Redis is disabled; auto-refresh will not start');
    return;
  }
  if (autoRefreshTimer) return;

  const skewMs = env.AUTH0_M2M_REFRESH_SKEW_SECONDS * 1000;

  const tick = async () => {
    try {
      await getAuth0M2MAccessToken();
      const redis = getRedisClient();
      const ttlMs = await redis.pttl(env.AUTH0_M2M_TOKEN_CACHE_KEY);

      const nextInMs = ttlMs > 0 ? Math.max(1_000, ttlMs - skewMs) : 5_000;
      autoRefreshTimer = setTimeout(() => void tick(), nextInMs);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn({ err: lastError }, 'Auth0 M2M auto-refresh failed; retrying soon');
      autoRefreshTimer = setTimeout(() => void tick(), 5_000);
    }
  };

  autoRefreshTimer = setTimeout(() => void tick(), 1);
}

export function stopAuth0M2MTokenAutoRefresh() {
  if (!autoRefreshTimer) return;
  clearTimeout(autoRefreshTimer);
  autoRefreshTimer = null;
}
