import { Router } from 'express';
import { getHealth } from '../controllers/healthController';
import { asyncHandler } from '../utils/asyncHandler';

export const healthRouter = Router();

healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const { httpStatus, body } = await getHealth();
    res.status(httpStatus).json(body);
  }),
);
