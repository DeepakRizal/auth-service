import type { Pool, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { connectDb, disconnectDb, getDbPool } from '../services/db';

type SeedConfig = {
  targetCount: number;
  batchSize: number;
  reset: boolean;
  seed: number;
};

function intFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function boolFromEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]) {
  return arr[Math.floor(rng() * arr.length)]!;
}

function buildInsertQuery(rowCount: number) {
  const tuples = new Array(rowCount).fill('(?,?,?,?,?)').join(',');
  return `INSERT INTO products (name, description, price, category, createdAt) VALUES ${tuples};`;
}

async function getCurrentCount(pool: Pool) {
  type CountRow = RowDataPacket & { cnt: number };
  const [rows] = await pool.query<CountRow[]>(`SELECT COUNT(*) AS cnt FROM products;`);
  return Number(rows?.[0]?.cnt ?? 0);
}

async function main() {
  const cfg: SeedConfig = {
    targetCount: intFromEnv('SEED_COUNT', 1_000_000),
    batchSize: intFromEnv('SEED_BATCH_SIZE', 2_000),
    reset: boolFromEnv('SEED_RESET', false),
    seed: intFromEnv('SEED_RANDOM_SEED', 42),
  };

  if (!env.MYSQL_ENABLED) {
    throw new Error(
      'MYSQL_ENABLED is false. Set MYSQL_ENABLED=true (or run via npm script that forces it) to seed.',
    );
  }
  if (!env.MYSQL_URL) {
    throw new Error('MYSQL_URL is not set.');
  }

  logger.info(
    {
      targetCount: cfg.targetCount,
      batchSize: cfg.batchSize,
      reset: cfg.reset,
    },
    'Seeding products',
  );

  await connectDb();
  const pool = getDbPool();

  try {
    if (cfg.reset) {
      logger.warn('Reset enabled: truncating products table');
      await pool.query('SET FOREIGN_KEY_CHECKS = 0;');
      await pool.query('TRUNCATE TABLE products;');
      await pool.query('SET FOREIGN_KEY_CHECKS = 1;');
    }

    let current = await getCurrentCount(pool);
    if (current >= cfg.targetCount) {
      logger.info({ current }, 'Seed skipped (already at/above target)');
      return;
    }

    const rng = mulberry32(cfg.seed);

    const categories = [
      'fruits',
      'vegetables',
      'grains',
      'dairy',
      'meat',
      'seafood',
      'spices',
      'beverages',
      'snacks',
      'bakery',
      'frozen',
      'organic',
      'household',
      'personal-care',
      'baby',
      'pet',
      'health',
      'ready-to-eat',
      'condiments',
      'misc',
    ] as const;

    const adjectives = [
      'Fresh',
      'Organic',
      'Premium',
      'Farm',
      'Local',
      'Natural',
      'Seasonal',
      'Crisp',
      'Healthy',
      'Value',
    ] as const;

    const nouns = [
      'Apples',
      'Tomatoes',
      'Rice',
      'Milk',
      'Chicken',
      'Fish',
      'Chili',
      'Juice',
      'Cookies',
      'Bread',
      'Spinach',
      'Cheese',
      'Yogurt',
      'Beans',
      'Tea',
    ] as const;

    const now = Date.now();
    const fiveYearsMs = 1000 * 60 * 60 * 24 * 365 * 5;
    const minTs = now - fiveYearsMs;

    const startedAt = Date.now();
    let lastLogAt = startedAt;

    while (current < cfg.targetCount) {
      const remaining = cfg.targetCount - current;
      const batch = Math.min(cfg.batchSize, remaining);

      const params: Array<string | null | Date> = [];
      params.length = 0;

      for (let i = 0; i < batch; i++) {
        const idx = current + i + 1;
        const category = pick(rng, categories);
        const name = `${pick(rng, adjectives)} ${pick(rng, nouns)} #${idx}`;
        const description =
          rng() < 0.03
            ? null
            : `Category:${category} quality:${pick(rng, ['A', 'B', 'C'] as const)} batch:${Math.floor(
                rng() * 10_000,
              )} notes:${pick(rng, ['sweet', 'spicy', 'crunchy', 'soft', 'rich'] as const)}`;

        const price = (Math.floor(rng() * 10_000_00) / 100).toFixed(2);

        const createdAt = new Date(minTs + Math.floor(rng() * fiveYearsMs));

        params.push(name, description, price, category, createdAt);
      }

      const sql = buildInsertQuery(batch);
      await pool.query(sql, params);

      current += batch;

      const nowMs = Date.now();
      if (nowMs - lastLogAt >= 2000) {
        const elapsedSec = (nowMs - startedAt) / 1000;
        const rowsPerSec = Math.round(current / Math.max(1, elapsedSec));
        logger.info({ inserted: current, target: cfg.targetCount, rowsPerSec }, 'Seed progress');
        lastLogAt = nowMs;
      }
    }

    const finalCount = await getCurrentCount(pool);
    const elapsedMs = Date.now() - startedAt;
    logger.info({ finalCount, elapsedSeconds: Math.round(elapsedMs / 1000) }, 'Seed completed');
  } finally {
    await disconnectDb();
  }
}

void main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
