import type { Pool, RowDataPacket } from 'mysql2/promise';
import { logger } from '../../config/logger';

async function indexExists(pool: Pool, indexName: string) {
  type CountRow = RowDataPacket & { COUNT: number };

  const [rows] = await pool.query<CountRow[]>(
    `
      SELECT COUNT(1) AS COUNT
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
        AND INDEX_NAME = ?;
    `,
    [indexName],
  );

  return Number(rows?.[0]?.COUNT ?? 0) > 0;
}

export async function ensureProductSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      price DECIMAL(10,2) NOT NULL,
      category VARCHAR(100) NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB;
  `);

  if (!(await indexExists(pool, 'idx_products_category'))) {
    await pool.query(`CREATE INDEX idx_products_category ON products (category);`);
  }

  if (!(await indexExists(pool, 'idx_products_price'))) {
    await pool.query(`CREATE INDEX idx_products_price ON products (price);`);
  }

  if (!(await indexExists(pool, 'idx_products_createdAt'))) {
    await pool.query(`CREATE INDEX idx_products_createdAt ON products (createdAt);`);
  }

  if (!(await indexExists(pool, 'ft_products_name_description'))) {
    await pool.query(
      `CREATE FULLTEXT INDEX ft_products_name_description ON products (name, description);`,
    );
  }

  logger.info('Product schema ensured');
}
