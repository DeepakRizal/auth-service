import { z } from 'zod';
import { env } from '../config/env';
import { listProducts } from '../repositories/products/productRepository';
import { getProductStats } from '../repositories/products/productStatsRepository';
import { withCache } from '../services/cache';
import { getDbPool } from '../services/db';
import { getProductsListCacheKey, getProductsStatsCacheKey } from '../services/productsCache';
import { AppError } from '../utils/AppError';
import type { ProductSortBy, SortOrder } from '../repositories/products/productRepository';
import { dedupeInFlight } from '../utils/dedupeInFlight';
import { stableStringify } from '../utils/stableStringify';

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).catch(20),
  sortBy: z.enum(['createdAt', 'price', 'name'] as const).catch('createdAt'),
  sortOrder: z.enum(['asc', 'desc'] as const).catch('desc'),

  q: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  createdFrom: z.string().min(1).optional(),
  createdTo: z.string().min(1).optional(),

  cursor: z.string().min(1).optional(),
});

function encodeCursor(payload: unknown) {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

function decodeCursor(raw: string): {
  sortBy: ProductSortBy;
  sortOrder: SortOrder;
  v: unknown;
  id: unknown;
} {
  const json = Buffer.from(raw, 'base64url').toString('utf-8');
  return JSON.parse(json) as {
    sortBy: ProductSortBy;
    sortOrder: SortOrder;
    v: unknown;
    id: unknown;
  };
}

export async function getProductsController(reqQuery: unknown) {
  if (!env.MYSQL_ENABLED) {
    throw new AppError('MySQL is disabled (MYSQL_ENABLED=false).', 503);
  }

  const parsed = querySchema.parse(reqQuery);

  if (
    parsed.minPrice !== undefined &&
    parsed.maxPrice !== undefined &&
    parsed.minPrice > parsed.maxPrice
  ) {
    throw new AppError('minPrice cannot be greater than maxPrice', 400);
  }

  const createdFrom = parsed.createdFrom ? new Date(parsed.createdFrom) : undefined;
  const createdTo = parsed.createdTo ? new Date(parsed.createdTo) : undefined;
  if (createdFrom && Number.isNaN(createdFrom.getTime()))
    throw new AppError('Invalid createdFrom', 400);
  if (createdTo && Number.isNaN(createdTo.getTime())) throw new AppError('Invalid createdTo', 400);

  const sortBy = parsed.sortBy as ProductSortBy;
  const sortOrder = parsed.sortOrder as SortOrder;

  let cursor: { v: string | number; id: number } | undefined;

  if (parsed.cursor) {
    let decoded: { sortBy: ProductSortBy; sortOrder: SortOrder; v: unknown; id: unknown };
    try {
      decoded = decodeCursor(parsed.cursor);
    } catch {
      throw new AppError('Invalid cursor', 400);
    }

    if (decoded.sortBy !== sortBy || decoded.sortOrder !== sortOrder) {
      throw new AppError('Cursor does not match sortBy/sortOrder', 400);
    }

    if (typeof decoded.id !== 'number' || !Number.isFinite(decoded.id)) {
      throw new AppError('Invalid cursor id', 400);
    }

    if (sortBy === 'createdAt') {
      if (typeof decoded.v !== 'string') throw new AppError('Invalid cursor value', 400);
      const d = new Date(decoded.v);
      if (Number.isNaN(d.getTime())) throw new AppError('Invalid cursor value', 400);
      cursor = { v: d.toISOString(), id: decoded.id };
    } else if (sortBy === 'price') {
      if (typeof decoded.v !== 'string' && typeof decoded.v !== 'number') {
        throw new AppError('Invalid cursor value', 400);
      }
      cursor = { v: decoded.v, id: decoded.id };
    } else {
      if (typeof decoded.v !== 'string') throw new AppError('Invalid cursor value', 400);
      cursor = { v: decoded.v, id: decoded.id };
    }
  }

  const pool = getDbPool();
  const keyInput = {
    limit: parsed.limit,
    sortBy,
    sortOrder,
    q: parsed.q ?? null,
    category: parsed.category ?? null,
    minPrice: parsed.minPrice ?? null,
    maxPrice: parsed.maxPrice ?? null,
    createdFrom: createdFrom?.toISOString() ?? null,
    createdTo: createdTo?.toISOString() ?? null,
    cursor: parsed.cursor ?? null,
  };

  const cacheKey = await getProductsListCacheKey(keyInput);
  const dedupeKey = cacheKey ?? `products:list:bypass:${stableStringify(keyInput)}`;

  const compute = async () => {
    const { items, hasMore, nextCursor } = await listProducts(pool, {
      limit: parsed.limit,
      sortBy,
      sortOrder,
      q: parsed.q,
      category: parsed.category,
      minPrice: parsed.minPrice,
      maxPrice: parsed.maxPrice,
      createdFrom,
      createdTo,
      cursor,
    });

    const encodedNextCursor = nextCursor
      ? encodeCursor({ sortBy, sortOrder, v: nextCursor.v, id: nextCursor.id })
      : null;

    return {
      items: items.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      pageInfo: {
        limit: parsed.limit,
        hasMore,
        nextCursor: encodedNextCursor,
      },
    };
  };

  const { value: result, deduped } = await dedupeInFlight(dedupeKey, async () => {
    if (!cacheKey) {
      return { value: await compute(), status: 'BYPASS' as const };
    }
    return await withCache({
      key: cacheKey,
      ttlSeconds: env.PRODUCTS_LIST_CACHE_TTL_SECONDS,
      compute,
    });
  });

  return { body: result.value, cacheStatus: result.status, deduped };
}

export async function getProductsStatsController() {
  if (!env.MYSQL_ENABLED) {
    throw new AppError('MySQL is disabled (MYSQL_ENABLED=false).', 503);
  }

  const pool = getDbPool();
  const cacheKey = await getProductsStatsCacheKey({ v: 1 });
  const dedupeKey = cacheKey ?? 'products:stats:bypass';

  const compute = async () => {
    const stats = await getProductStats(pool);
    return {
      totals: {
        ...stats.totals,
        minCreatedAt: stats.totals.minCreatedAt
          ? new Date(stats.totals.minCreatedAt).toISOString()
          : null,
        maxCreatedAt: stats.totals.maxCreatedAt
          ? new Date(stats.totals.maxCreatedAt).toISOString()
          : null,
      },
      byCategory: stats.byCategory,
    };
  };

  const { value: result, deduped } = await dedupeInFlight(dedupeKey, async () => {
    if (!cacheKey) {
      return { value: await compute(), status: 'BYPASS' as const };
    }
    return await withCache({
      key: cacheKey,
      ttlSeconds: env.PRODUCTS_STATS_CACHE_TTL_SECONDS,
      compute,
    });
  });

  return { body: result.value, cacheStatus: result.status, deduped };
}
