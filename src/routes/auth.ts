import { Router } from 'express';
import { requiresAuth } from 'express-openid-connect';
import { getAuthStatusController, getProfileController } from '../controllers/authController';

export const authRouter = Router();

authRouter.get('/auth/status', getAuthStatusController);

authRouter.get('/profile', requiresAuth(), getProfileController);
