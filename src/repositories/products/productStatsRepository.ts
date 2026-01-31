import type { Pool, RowDataPacket } from 'mysql2/promise';

export async function getProductStats(pool: Pool) {
  type TotalsRow = RowDataPacket & {
    total: number;
    minPrice: string | null;
    maxPrice: string | null;
    minCreatedAt: Date | null;
    maxCreatedAt: Date | null;
  };

  type ByCategoryRow = RowDataPacket & { category: string; count: number };

  const [[totals]] = await pool.query<TotalsRow[]>(
    `
      SELECT
        COUNT(*) AS total,
        MIN(price) AS minPrice,
        MAX(price) AS maxPrice,
        MIN(createdAt) AS minCreatedAt,
        MAX(createdAt) AS maxCreatedAt
      FROM products;
    `,
  );

  const [byCategory] = await pool.query<ByCategoryRow[]>(
    `
      SELECT category, COUNT(*) AS count
      FROM products
      GROUP BY category
      ORDER BY count DESC
      LIMIT 50;
    `,
  );

  return {
    totals: {
      total: Number(totals?.total ?? 0),
      minPrice: totals?.minPrice ?? null,
      maxPrice: totals?.maxPrice ?? null,
      minCreatedAt: totals?.minCreatedAt ?? null,
      maxCreatedAt: totals?.maxCreatedAt ?? null,
    },
    byCategory: byCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
  };
}
