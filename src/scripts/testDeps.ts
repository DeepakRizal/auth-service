import { logger } from '../config/logger';
import { connectDb, disconnectDb, getDbHealth } from '../services/db';
import { connectRedis, disconnectRedis, getRedisHealth } from '../services/redis';

async function main() {
  await connectDb();
  await connectRedis();

  const db = getDbHealth();
  const redis = getRedisHealth();

  logger.info({ db, redis }, 'Dependency health');

  const ok = (!db.enabled || db.status === 'up') && (!redis.enabled || redis.status === 'up');

  await disconnectRedis();
  await disconnectDb();

  process.exit(ok ? 0 : 1);
}

void main().catch((err) => {
  logger.error({ err }, 'Dependency test failed');
  process.exit(1);
});
