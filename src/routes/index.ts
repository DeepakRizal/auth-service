import { Router } from 'express';
import { env } from '../config/env';
import { authRouter } from './auth';
import { auth0M2MRouter } from './auth0M2M';
import { cacheAdminRouter } from './cacheAdmin';
import { externalARouter } from './externalA';
import { healthRouter } from './health';
import { metricsRouter } from './metrics';
import { productsRouter } from './products';
import { rootRouter } from './root';
import { uiRouter } from './ui';
import { webhookExternalBRouter } from './webhookExternalB';

export const routes = Router();

routes.use(rootRouter);
routes.use(uiRouter);
routes.use(healthRouter);

if (env.AUTH0_ENABLED) {
  routes.use(authRouter);
}

routes.use(auth0M2MRouter);

routes.use(externalARouter);
routes.use(productsRouter);
routes.use(webhookExternalBRouter);
routes.use(cacheAdminRouter);
routes.use(metricsRouter);
