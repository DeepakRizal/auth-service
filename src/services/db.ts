import type { Pool } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { withRetry } from '../utils/withRetry';
import { ensureProductSchema } from '../repositories/products/productSchema';

import type { DependencyStatus } from '../types/dependencies';

export type { DependencyStatus } from '../types/dependencies';

let pool: Pool | null = null;
let status: DependencyStatus = env.MYSQL_ENABLED ? 'down' : 'disabled';
let lastError: string | null = null;

export function getDbHealth() {
  return {
    enabled: env.MYSQL_ENABLED,
    status,
    lastError,
  };
}

export function getDbPool(): Pool {
  if (!pool) throw new Error('Database pool not initialized');
  return pool;
}

export async function connectDb(): Promise<void> {
  if (!env.MYSQL_ENABLED) {
    status = 'disabled';
    lastError = null;
    return;
  }

  if (!env.MYSQL_URL) {
    status = 'down';
    lastError = 'MYSQL_URL is not set';
    logger.warn({ lastError }, 'MySQL not connected');
    if (env.BOOTSTRAP_STRICT) throw new Error(lastError);
    return;
  }

  status = 'connecting';
  pool = createPool({
    uri: env.MYSQL_URL,
    waitForConnections: true,
    connectionLimit: env.MYSQL_POOL_LIMIT,
    queueLimit: env.MYSQL_QUEUE_LIMIT,
    maxIdle: env.MYSQL_MAX_IDLE,
    idleTimeout: env.MYSQL_IDLE_TIMEOUT_MS,
    enableKeepAlive: env.MYSQL_ENABLE_KEEP_ALIVE,
    keepAliveInitialDelay: env.MYSQL_KEEP_ALIVE_INITIAL_DELAY_MS,
  });

  try {
    await withRetry(
      async () => {
        await pool!.query('SELECT 1;');
      },
      { retries: 5, baseDelayMs: 250, maxDelayMs: 5000 },
    );
    status = 'up';
    lastError = null;
    logger.info({ poolLimit: env.MYSQL_POOL_LIMIT }, 'MySQL connected');

    await ensureProductSchema(pool);
  } catch (err) {
    status = 'down';
    lastError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'MySQL connection/schema init failed');
    if (env.BOOTSTRAP_STRICT) throw err;
  }
}

export async function disconnectDb(): Promise<void> {
  if (!pool) return;
  try {
    await pool.end();
  } catch (err) {
    logger.warn({ err }, 'MySQL disconnect error');
  } finally {
    pool = null;
    if (env.MYSQL_ENABLED) status = 'down';
  }
}
