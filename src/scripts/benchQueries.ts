import type { Pool, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { connectDb, disconnectDb, getDbPool } from '../services/db';

function intFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function msSince(startNs: bigint) {
  return Number(process.hrtime.bigint() - startNs) / 1_000_000;
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const p = (pct: number) => sorted[Math.min(sorted.length - 1, Math.floor(pct * sorted.length))]!;
  return {
    n: values.length,
    minMs: sorted[0] ?? 0,
    avgMs: sum / Math.max(1, values.length),
    p50Ms: p(0.5),
    p95Ms: p(0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

async function explain(pool: Pool, sql: string, params: readonly unknown[]) {
  type ExplainRow = RowDataPacket & {
    id: number;
    select_type: string;
    table: string;
    partitions: string | null;
    type: string;
    possible_keys: string | null;
    key: string | null;
    key_len: string | null;
    ref: string | null;
    rows: number;
    filtered: number;
    Extra: string | null;
  };

  const [rows] = await pool.query<ExplainRow[]>(`EXPLAIN ${sql}`, [...params]);
  return rows.map((r) => ({
    table: r.table,
    type: r.type,
    possible_keys: r.possible_keys,
    key: r.key,
    rows: r.rows,
    extra: r.Extra,
  }));
}

async function pickSampleCategory(pool: Pool) {
  type Row = RowDataPacket & { category: string; cnt: number };
  const [rows] = await pool.query<Row[]>(
    `SELECT category, COUNT(*) AS cnt FROM products GROUP BY category ORDER BY cnt DESC LIMIT 1;`,
  );
  return rows?.[0]?.category ?? 'fruits';
}

async function getPriceBounds(pool: Pool) {
  type Row = RowDataPacket & { minP: string | number; maxP: string | number };
  const [rows] = await pool.query<Row[]>(
    `SELECT MIN(price) AS minP, MAX(price) AS maxP FROM products;`,
  );
  const min = Number(rows?.[0]?.minP ?? 0);
  const max = Number(rows?.[0]?.maxP ?? 0);
  return { min, max };
}

async function getCreatedAtBounds(pool: Pool) {
  type Row = RowDataPacket & { minD: Date; maxD: Date };
  const [rows] = await pool.query<Row[]>(
    `SELECT MIN(createdAt) AS minD, MAX(createdAt) AS maxD FROM products;`,
  );
  return { min: rows?.[0]?.minD, max: rows?.[0]?.maxD };
}

async function timeQuery(pool: Pool, sql: string, params: readonly unknown[], iterations: number) {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await pool.query(sql, [...params]);
    times.push(msSince(start));
  }
  return summarize(times);
}

async function main() {
  const iterations = intFromEnv('BENCH_ITERATIONS', 50);

  if (!env.MYSQL_ENABLED) {
    throw new Error('MYSQL_ENABLED is false. Set MYSQL_ENABLED=true to benchmark.');
  }

  await connectDb();
  const pool = getDbPool();

  try {
    const category = await pickSampleCategory(pool);
    const { min: minPrice, max: maxPrice } = await getPriceBounds(pool);
    const midPrice = (minPrice + maxPrice) / 2;
    const priceLow = Number(Math.max(minPrice, midPrice * 0.5).toFixed(2));
    const priceHigh = Number(Math.min(maxPrice, midPrice * 1.5).toFixed(2));

    const { min: minDate, max: maxDate } = await getCreatedAtBounds(pool);
    const recentCutoff = maxDate
      ? new Date(maxDate.getTime() - 1000 * 60 * 60 * 24 * 30)
      : new Date();

    const fulltextTerm = 'Category';

    const queries = [
      {
        name: 'category filter',
        sql: 'SELECT id FROM products WHERE category = ? LIMIT 50',
        params: [category],
      },
      {
        name: 'price range',
        sql: 'SELECT id FROM products WHERE price BETWEEN ? AND ? ORDER BY price LIMIT 50',
        params: [priceLow, priceHigh],
      },
      {
        name: 'createdAt range',
        sql: 'SELECT id FROM products WHERE createdAt >= ? ORDER BY createdAt DESC LIMIT 50',
        params: [recentCutoff],
      },
      {
        name: 'fulltext name/description',
        sql: 'SELECT id FROM products WHERE MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE) LIMIT 50',
        params: [fulltextTerm],
      },
    ] as const;

    for (const q of queries) {
      const plan = await explain(pool, q.sql, q.params);
      logger.info({ query: q.name, plan }, 'EXPLAIN');
    }

    for (const q of queries) {
      const stats = await timeQuery(pool, q.sql, q.params, iterations);
      logger.info({ query: q.name, iterations, stats }, 'Query latency');
    }

    type CountRow = RowDataPacket & { cnt: number };
    const [rows] = await pool.query<CountRow[]>(`SELECT COUNT(*) AS cnt FROM products;`);
    logger.info(
      { productCount: Number(rows?.[0]?.cnt ?? 0), minDate, maxDate, minPrice, maxPrice },
      'Dataset overview',
    );
  } finally {
    await disconnectDb();
  }
}

void main().catch((err) => {
  logger.error({ err }, 'Bench failed');
  process.exit(1);
});
