import { Router } from 'express';
import { invalidateProductsCacheController } from '../controllers/cacheAdminController';
import { asyncHandler } from '../utils/asyncHandler';

export const cacheAdminRouter = Router();

cacheAdminRouter.post(
  '/admin/cache/products/invalidate',
  asyncHandler(async (_req, res) => {
    const out = await invalidateProductsCacheController();
    res.status(out.httpStatus).json(out.body);
  }),
);
