import { Router } from 'express';
import {
  getExternalAHealthController,
  getExternalASyncController,
} from '../controllers/externalAController';
import { asyncHandler } from '../utils/asyncHandler';

export const externalARouter = Router();

externalARouter.get(
  '/external-a/health',
  asyncHandler(async (_req, res) => {
    res.json(await getExternalAHealthController());
  }),
);

externalARouter.get(
  '/external-a/sync',
  asyncHandler(async (_req, res) => {
    const out = await getExternalASyncController();
    res.setHeader('x-external-a-source', out.headers['x-external-a-source']);
    res.setHeader('x-dedupe', out.headers['x-dedupe']);
    res.status(200).json(out.body);
  }),
);
