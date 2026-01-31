import type { Request, Response } from 'express';
import { env } from '../config/env';
import { handleExternalBWebhook } from '../modules/webhooks/externalB/externalBWebhook.service';

export async function postWebhookExternalBController(req: Request, res: Response): Promise<void> {
  if (!env.WEBHOOK_B_ENABLED) {
    res.status(404).json({ error: { message: 'Webhook B disabled' } });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''));
  const result = await handleExternalBWebhook({
    rawBody,
    headers: req.headers as Record<string, string | string[] | undefined>,
  });

  if (result.status === 'duplicate') {
    res.status(200).json({ ok: true, deduped: true, idempotencyKey: result.idempotencyKey });
    return;
  }

  if (result.status === 'in_flight') {
    res.status(202).json({ ok: true, inFlight: true, idempotencyKey: result.idempotencyKey });
    return;
  }

  res.status(200).json({ ok: true, processed: true, idempotencyKey: result.idempotencyKey });
}
