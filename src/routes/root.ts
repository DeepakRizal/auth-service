import { Router } from 'express';
import { getRootController } from '../controllers/rootController';

export const rootRouter = Router();

rootRouter.get('/', getRootController);
