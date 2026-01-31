import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { getRedisClient, getRedisHealth } from './redis';
import { sleep } from '../utils/sleep';

export type CacheGetResult<T> = { hit: true; value: T } | { hit: false; value: null };

export type CacheStatus = 'BYPASS' | 'HIT' | 'MISS' | 'WAIT';

function redisReady() {
  const h = getRedisHealth();
  return env.CACHE_ENABLED && h.enabled && h.status === 'up';
}

export async function cacheGetJson<T>(key: string): Promise<CacheGetResult<T>> {
  if (!redisReady()) return { hit: false, value: null };
  const redis = getRedisClient();
  const raw = await redis.get(key);
  if (!raw) return { hit: false, value: null };
  return { hit: true, value: JSON.parse(raw) as T };
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redisReady()) return;
  const redis = getRedisClient();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

async function acquireLock(lockKey: string, ttlMs: number) {
  if (!redisReady()) return null;
  const redis = getRedisClient();
  const lockValue = randomUUID();
  const ok = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
  return ok === 'OK' ? lockValue : null;
}

async function releaseLock(lockKey: string, lockValue: string) {
  if (!redisReady()) return;
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

export async function withCache<T>(opts: {
  key: string;
  ttlSeconds: number;
  compute: () => Promise<T>;
}): Promise<{ value: T; status: CacheStatus }> {
  if (!redisReady()) {
    return { value: await opts.compute(), status: 'BYPASS' };
  }

  const first = await cacheGetJson<T>(opts.key);
  if (first.hit) return { value: first.value, status: 'HIT' };

  const lockKey = `${opts.key}:lock`;
  const lockValue = await acquireLock(lockKey, env.CACHE_LOCK_TTL_MS);

  if (lockValue) {
    try {
      const value = await opts.compute();
      await cacheSetJson(opts.key, value, opts.ttlSeconds);
      return { value, status: 'MISS' };
    } finally {
      await releaseLock(lockKey, lockValue).catch(() => undefined);
    }
  }

  let delay = 50;
  const maxWaitMs = Math.min(1000, env.CACHE_LOCK_TTL_MS);
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(delay);
    const next = await cacheGetJson<T>(opts.key);
    if (next.hit) return { value: next.value, status: 'WAIT' };
    delay = Math.min(250, delay * 2);
  }

  return { value: await opts.compute(), status: 'BYPASS' };
}
