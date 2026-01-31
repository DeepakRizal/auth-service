import type { Pool, RowDataPacket } from 'mysql2/promise';

import type { ProductListQuery, ProductRow, SortOrder } from '../../types/products';

export type { ProductListQuery, ProductRow, ProductSortBy, SortOrder } from '../../types/products';

function orderKeyword(order: SortOrder) {
  return order === 'asc' ? 'ASC' : 'DESC';
}

function opForCursor(order: SortOrder) {
  return order === 'asc' ? '>' : '<';
}

export async function listProducts(pool: Pool, query: ProductListQuery) {
  const params: unknown[] = [];
  const where: string[] = [];

  if (query.q) {
    where.push(`MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE)`);
    params.push(query.q);
  }

  if (query.category) {
    where.push(`category = ?`);
    params.push(query.category);
  }

  if (query.minPrice !== undefined) {
    where.push(`price >= ?`);
    params.push(query.minPrice);
  }

  if (query.maxPrice !== undefined) {
    where.push(`price <= ?`);
    params.push(query.maxPrice);
  }

  if (query.createdFrom) {
    where.push(`createdAt >= ?`);
    params.push(query.createdFrom);
  }

  if (query.createdTo) {
    where.push(`createdAt <= ?`);
    params.push(query.createdTo);
  }

  const order = orderKeyword(query.sortOrder);
  const cursorOp = opForCursor(query.sortOrder);

  const sortColumn =
    query.sortBy === 'createdAt' ? 'createdAt' : query.sortBy === 'price' ? 'price' : 'name';

  if (query.cursor) {
    const cursorValue =
      query.sortBy === 'createdAt' && typeof query.cursor.v === 'string'
        ? new Date(query.cursor.v)
        : query.cursor.v;
    where.push(`(${sortColumn} ${cursorOp} ? OR (${sortColumn} = ? AND id ${cursorOp} ?))`);
    params.push(cursorValue, cursorValue, query.cursor.id);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const limitPlusOne = Math.min(101, Math.max(1, query.limit + 1));
  params.push(limitPlusOne);

  const sql = `
    SELECT id, name, description, price, category, createdAt
    FROM products
    ${whereSql}
    ORDER BY ${sortColumn} ${order}, id ${order}
    LIMIT ?;
  `;

  const [rows] = await pool.query<(RowDataPacket & ProductRow)[]>(sql, params);
  const items = rows.slice(0, query.limit).map((r) => ({
    id: Number(r.id),
    name: r.name,
    description: r.description ?? null,
    price: String(r.price),
    category: r.category,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as unknown as string),
  }));

  const hasMore = rows.length > query.limit;
  const last = items[items.length - 1];

  const nextCursor =
    hasMore && last
      ? {
          v:
            query.sortBy === 'createdAt'
              ? last.createdAt.toISOString()
              : query.sortBy === 'price'
                ? last.price
                : last.name,
          id: last.id,
        }
      : null;

  return { items, hasMore, nextCursor };
}
