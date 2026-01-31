import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { recordHttpRequest } from '../services/metrics';

export function metricsMiddleware(): RequestHandler {
  return (req, res, next) => {
    if (!env.METRICS_ENABLED) return next();
    if (req.originalUrl.startsWith(env.METRICS_PATH)) return next();

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
      recordHttpRequest(
        {
          method: req.method,
          path,
          status: String(res.statusCode),
        },
        durationMs,
      );
    });

    next();
  };
}
