import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { getRedisClient, getRedisHealth } from '../../../services/redis';
import { AppError } from '../../../utils/AppError';
import { externalBWebhookEventSchema } from './externalBWebhook.schema';

type WebhookProcessResult =
  | { status: 'processed'; idempotencyKey: string }
  | { status: 'duplicate'; idempotencyKey: string }
  | { status: 'in_flight'; idempotencyKey: string };

function normalizeHeaderName(name: string) {
  return name.trim().toLowerCase();
}

function getHeaderValue(headers: Record<string, string | string[] | undefined>, name: string) {
  const key = normalizeHeaderName(name);
  const value = headers[key];
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function computeSignatureHex(secret: string, rawBody: Buffer) {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function verifySignatureIfConfigured(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
) {
  if (!env.WEBHOOK_B_SECRET) return;

  const headerName = env.WEBHOOK_B_SIGNATURE_HEADER;
  const provided = getHeaderValue(headers, headerName);
  if (!provided) {
    throw new AppError(`Missing webhook signature header: ${headerName}`, 401);
  }

  const expectedHex = computeSignatureHex(env.WEBHOOK_B_SECRET, rawBody);
  const cleaned = provided.startsWith('sha256=') ? provided.slice('sha256='.length) : provided;

  const a = Buffer.from(cleaned, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('Invalid webhook signature', 401);
  }
}

function getIdempotencyKey(
  parsedBody: unknown,
  headers: Record<string, string | string[] | undefined>,
) {
  const primaryHeader = env.WEBHOOK_B_IDEMPOTENCY_HEADER;

  const headerCandidates = [primaryHeader, 'idempotency-key', 'x-idempotency-key', 'x-event-id'];

  for (const name of headerCandidates) {
    const v = getHeaderValue(headers, name);
    if (v && v.trim()) return v.trim();
  }

  const parsed = externalBWebhookEventSchema.safeParse(parsedBody);
  if (parsed.success) return parsed.data.id;

  return null;
}

async function acquireProcessing(redisKey: string, ttlSeconds: number) {
  const redisHealth = getRedisHealth();
  if (!redisHealth.enabled || redisHealth.status !== 'up') {
    throw new AppError('Redis not ready (webhook dedupe unavailable)', 503);
  }
  const redis = getRedisClient();
  const result = await redis.set(redisKey, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

async function releaseProcessing(redisKey: string) {
  const redisHealth = getRedisHealth();
  if (!redisHealth.enabled || redisHealth.status !== 'up') return;
  const redis = getRedisClient();
  await redis.del(redisKey);
}

async function isProcessed(redisKey: string) {
  const redisHealth = getRedisHealth();
  if (!redisHealth.enabled || redisHealth.status !== 'up') {
    throw new AppError('Redis not ready (webhook dedupe unavailable)', 503);
  }
  const redis = getRedisClient();
  const exists = await redis.exists(redisKey);
  return exists === 1;
}

async function markProcessed(redisKey: string, ttlSeconds: number) {
  const redisHealth = getRedisHealth();
  if (!redisHealth.enabled || redisHealth.status !== 'up') {
    throw new AppError('Redis not ready (webhook dedupe unavailable)', 503);
  }
  const redis = getRedisClient();
  await redis.set(redisKey, '1', 'EX', ttlSeconds);
}

async function processEvent(parsedBody: unknown) {
  const event = externalBWebhookEventSchema.parse(parsedBody);
  logger.info({ eventId: event.id, type: event.type }, 'Webhook B processed');
}

export async function handleExternalBWebhook(input: {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}): Promise<WebhookProcessResult> {
  if (!env.WEBHOOK_B_ENABLED) {
    throw new AppError('Webhook B is disabled (WEBHOOK_B_ENABLED=false).', 404);
  }

  verifySignatureIfConfigured(input.rawBody, input.headers);

  let json: unknown;
  try {
    json = JSON.parse(input.rawBody.toString('utf-8'));
  } catch {
    throw new AppError('Invalid JSON body', 400);
  }

  const idempotencyKey = getIdempotencyKey(json, input.headers);
  if (!idempotencyKey) {
    throw new AppError('Missing idempotency key (header or body.id)', 400);
  }

  const processedKey = `webhook:b:processed:${idempotencyKey}`;
  const processingKey = `webhook:b:processing:${idempotencyKey}`;

  if (await isProcessed(processedKey)) {
    return { status: 'duplicate', idempotencyKey };
  }

  const gotLock = await acquireProcessing(processingKey, env.WEBHOOK_B_PROCESSING_TTL_SECONDS);
  if (!gotLock) {
    return { status: 'in_flight', idempotencyKey };
  }

  try {
    await processEvent(json);
    await markProcessed(processedKey, env.WEBHOOK_B_DEDUPE_TTL_SECONDS);
    return { status: 'processed', idempotencyKey };
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), idempotencyKey },
      'Webhook B processing failed',
    );
    await releaseProcessing(processingKey);
    throw err;
  } finally {
    await releaseProcessing(processingKey).catch(() => undefined);
  }
}
