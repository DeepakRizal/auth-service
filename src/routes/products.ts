import { Router } from 'express';
import {
  getProductsController,
  getProductsStatsController,
} from '../controllers/productsController';
import { asyncHandler } from '../utils/asyncHandler';

export const productsRouter = Router();

productsRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const out = await getProductsController(req.query);
    res.setHeader('x-cache', out.cacheStatus);
    res.setHeader('x-dedupe', out.deduped ? 'HIT' : 'MISS');
    res.json(out.body);
  }),
);

productsRouter.get(
  '/products/stats',
  asyncHandler(async (_req, res) => {
    const out = await getProductsStatsController();
    res.setHeader('x-cache', out.cacheStatus);
    res.setHeader('x-dedupe', out.deduped ? 'HIT' : 'MISS');
    res.json(out.body);
  }),
);
