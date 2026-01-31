import { Router } from 'express';
import { env } from '../config/env';
import { getMetricsController } from '../controllers/metricsController';

export const metricsRouter = Router();

metricsRouter.get(env.METRICS_PATH, (_req, res) => {
  if (!env.METRICS_ENABLED) {
    return res.status(404).json({ error: { message: 'Metrics disabled' } });
  }

  res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
  return res.status(200).send(getMetricsController());
});
