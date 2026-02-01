import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { auth } from 'express-openid-connect';
import helmet from 'helmet';
import { getAuth0Config } from './config/auth0';
import { env } from './config/env';
import { logger } from './config/logger';
import { metricsMiddleware } from './middlewares/metrics';
import { rateLimitMiddleware } from './middlewares/rateLimit';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFound';
import { routes } from './routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: ms,
        },
        'HTTP request',
      );
    });
    next();
  });
  app.use(helmet());
  app.use(cors());

  if (env.METRICS_ENABLED) {
    app.use(metricsMiddleware());
  }

  if (env.RATE_LIMIT_ENABLED) {
    app.use(rateLimitMiddleware());
  }

  const jsonParser = express.json({ limit: '1mb' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.startsWith('/webhooks/')) return next();
    return jsonParser(req, res, next);
  });

  if (env.AUTH0_ENABLED) {
    app.use(auth(getAuth0Config()));
  }

  app.use(routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
