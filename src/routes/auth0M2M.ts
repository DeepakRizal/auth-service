import { Router } from 'express';
import { getAuth0M2MTokenStatusController } from '../controllers/auth0M2MController';
import { asyncHandler } from '../utils/asyncHandler';

export const auth0M2MRouter = Router();

auth0M2MRouter.get(
  '/auth0/m2m/status',
  asyncHandler(async (_req, res) => {
    res.json(await getAuth0M2MTokenStatusController());
  }),
);
