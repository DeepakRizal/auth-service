import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { DependencyStatus } from './db';

let client: Redis | null = null;
let status: DependencyStatus = env.REDIS_ENABLED ? 'down' : 'disabled';
let lastError: string | null = null;

export function getRedisHealth() {
  return {
    enabled: env.REDIS_ENABLED,
    status,
    lastError,
  };
}

export function getRedisClient(): Redis {
  if (!client) throw new Error('Redis client not initialized');
  return client;
}

export async function connectRedis(): Promise<void> {
  if (!env.REDIS_ENABLED) {
    status = 'disabled';
    lastError = null;
    return;
  }

  if (!env.REDIS_URL) {
    status = 'down';
    lastError = 'REDIS_URL is not set';
    logger.warn({ lastError }, 'Redis not connected');
    if (env.BOOTSTRAP_STRICT) throw new Error(lastError);
    return;
  }

  status = 'connecting';

  client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: 5_000,
    retryStrategy: (times) => {
      return Math.min(2000, 50 * Math.pow(2, Math.min(times, 6)));
    },
    reconnectOnError: (err) => {
      const message = err?.message ?? '';
      return message.includes('READONLY') || message.includes('ECONNRESET');
    },
  });

  client.on('connect', () => {
    status = 'connecting';
    logger.info('Redis socket connected');
  });

  client.on('ready', () => {
    status = 'up';
    lastError = null;
    logger.info('Redis ready');
  });

  client.on('error', (err) => {
    status = 'down';
    lastError = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, 'Redis client error');
  });

  client.on('reconnecting', (delayMs: number) => {
    status = 'connecting';
    logger.warn({ delayMs }, 'Redis reconnecting');
  });

  client.on('end', () => {
    status = 'down';
    logger.warn('Redis connection ended');
  });

  try {
    await client.connect();
    await client.ping();
    logger.info('Redis connected');
  } catch (err) {
    status = 'down';
    lastError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Redis connection failed');
    if (env.BOOTSTRAP_STRICT) throw err;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    client.removeAllListeners();
    client.disconnect();
  } catch (err) {
    logger.warn({ err }, 'Redis disconnect error');
  } finally {
    client = null;
    if (env.REDIS_ENABLED) status = 'down';
  }
}
