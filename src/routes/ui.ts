import { Router } from 'express';
import { getUiController } from '../controllers/uiController';

export const uiRouter = Router();

uiRouter.get('/ui', getUiController);
