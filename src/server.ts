import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDb, disconnectDb } from './services/db';
import { connectRedis, disconnectRedis } from './services/redis';
import { startAuth0M2MTokenAutoRefresh } from './services/auth0M2MToken';

async function bootstrap() {
  const app = createApp();

  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      'Server started (bootstrap: server -> DB -> Redis)',
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown started');

    await disconnectRedis();
    await disconnectDb();

    server.close((err) => {
      if (err) {
        logger.error({ err }, 'HTTP server close error');
        process.exitCode = 1;
      }
      logger.info('Shutdown complete');
      process.exit();
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    if (env.BOOTSTRAP_STRICT) process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  try {
    await connectDb();
    await connectRedis();
    startAuth0M2MTokenAutoRefresh();
  } catch (err) {
    logger.error({ err }, 'Bootstrap dependency init failed');
    if (env.BOOTSTRAP_STRICT) {
      await shutdown('BOOTSTRAP_STRICT');
    }
  }
}

void bootstrap();
