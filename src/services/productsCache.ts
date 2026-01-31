import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { getRedisClient, getRedisHealth } from './redis';
import { stableStringify } from '../utils/stableStringify';

const VERSION_KEY = 'products:cache_version';

function canUseCache() {
  const h = getRedisHealth();
  return env.CACHE_ENABLED && h.enabled && h.status === 'up';
}

async function getVersion(): Promise<string | null> {
  if (!canUseCache()) return null;
  const redis = getRedisClient();
  await redis.set(VERSION_KEY, '1', 'NX');
  return (await redis.get(VERSION_KEY)) ?? '1';
}

function hashKey(obj: unknown) {
  const s = stableStringify(obj);
  return createHash('sha1').update(s).digest('hex');
}

export async function getProductsListCacheKey(input: unknown): Promise<string | null> {
  const v = await getVersion();
  if (!v) return null;
  return `products:list:v${v}:${hashKey(input)}`;
}

export async function getProductsStatsCacheKey(input: unknown): Promise<string | null> {
  const v = await getVersion();
  if (!v) return null;
  return `products:stats:v${v}:${hashKey(input)}`;
}

export async function bumpProductsCacheVersion(): Promise<void> {
  if (!canUseCache()) return;
  const redis = getRedisClient();
  await redis.incr(VERSION_KEY);
}
