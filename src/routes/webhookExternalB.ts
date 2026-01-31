import express, { Router } from 'express';
import { postWebhookExternalBController } from '../controllers/webhookExternalBController';
import { asyncHandler } from '../utils/asyncHandler';

export const webhookExternalBRouter = Router();

webhookExternalBRouter.post(
  '/webhooks/external-b',
  express.raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(postWebhookExternalBController),
);
