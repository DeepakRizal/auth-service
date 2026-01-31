import 'dotenv/config';
import { z } from 'zod';

const emptyStringToUndefined = (val: unknown) => {
  if (val === undefined) return undefined;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return val;
};

const booleanFromEnv = z.preprocess((val) => {
  if (val === undefined) return undefined;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const normalized = val.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return val;
}, z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).catch('development'),
    PORT: z.coerce.number().int().positive().catch(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).catch('info'),

    BOOTSTRAP_STRICT: booleanFromEnv.catch(false),

    MYSQL_ENABLED: booleanFromEnv.catch(false),
    MYSQL_URL: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MYSQL_POOL_LIMIT: z.coerce.number().int().positive().catch(10),
    MYSQL_QUEUE_LIMIT: z.coerce.number().int().nonnegative().catch(0),
    MYSQL_MAX_IDLE: z.coerce.number().int().positive().catch(10),
    MYSQL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().catch(60_000),
    MYSQL_ENABLE_KEEP_ALIVE: booleanFromEnv.catch(true),
    MYSQL_KEEP_ALIVE_INITIAL_DELAY_MS: z.coerce.number().int().nonnegative().catch(0),

    REDIS_ENABLED: booleanFromEnv.catch(false),
    REDIS_URL: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),

    EXTERNAL_A_ENABLED: booleanFromEnv.catch(false),
    EXTERNAL_A_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    EXTERNAL_A_TIMEOUT_MS: z.coerce.number().int().positive().catch(3000),
    EXTERNAL_A_RETRIES: z.coerce.number().int().nonnegative().catch(2),
    EXTERNAL_A_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().catch(200),
    EXTERNAL_A_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().catch(2000),
    EXTERNAL_A_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().catch(5),
    EXTERNAL_A_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().catch(15_000),

    WEBHOOK_B_ENABLED: booleanFromEnv.catch(false),
    WEBHOOK_B_SECRET: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    WEBHOOK_B_DEDUPE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .catch(60 * 60 * 24 * 7),
    WEBHOOK_B_PROCESSING_TTL_SECONDS: z.coerce.number().int().positive().catch(60),
    WEBHOOK_B_IDEMPOTENCY_HEADER: z.string().min(1).catch('idempotency-key'),
    WEBHOOK_B_SIGNATURE_HEADER: z.string().min(1).catch('x-webhook-signature'),

    CACHE_ENABLED: booleanFromEnv.catch(true),
    CACHE_LOCK_TTL_MS: z.coerce.number().int().positive().catch(2000),
    PRODUCTS_LIST_CACHE_TTL_SECONDS: z.coerce.number().int().positive().catch(30),
    PRODUCTS_STATS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().catch(60),
    CACHE_ADMIN_ENABLED: booleanFromEnv.catch(false),

    RATE_LIMIT_ENABLED: booleanFromEnv.catch(false),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().catch(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().catch(120),
    RATE_LIMIT_KEY_PREFIX: z.string().min(1).catch('rl'),

    METRICS_ENABLED: booleanFromEnv.catch(false),
    METRICS_PATH: z.string().min(1).catch('/metrics'),

    AUTH0_ENABLED: booleanFromEnv.catch(false),
    AUTH0_SECRET: z.preprocess(emptyStringToUndefined, z.string().min(32).optional()),
    AUTH0_BASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    AUTH0_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    AUTH0_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    AUTH0_ISSUER_BASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),

    AUTH0_M2M_ENABLED: booleanFromEnv.catch(false),
    AUTH0_M2M_TOKEN_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    AUTH0_M2M_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    AUTH0_M2M_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    AUTH0_M2M_AUDIENCE: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    AUTH0_M2M_SCOPE: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    AUTH0_M2M_TOKEN_CACHE_KEY: z.string().min(1).catch('auth0:m2m:access_token'),
    AUTH0_M2M_TOKEN_LOCK_KEY: z.string().min(1).catch('auth0:m2m:access_token:lock'),
    AUTH0_M2M_TOKEN_LOCK_TTL_MS: z.coerce.number().int().positive().catch(10_000),
    AUTH0_M2M_REFRESH_SKEW_SECONDS: z.coerce.number().int().nonnegative().catch(60),
    AUTH0_M2M_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().catch(10_000),
  })
  .superRefine((val, ctx) => {
    if (val.EXTERNAL_A_ENABLED) {
      if (!val.EXTERNAL_A_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'EXTERNAL_A_URL is required when EXTERNAL_A_ENABLED=true.',
          path: ['EXTERNAL_A_URL'],
        });
      }
    }

    if (val.WEBHOOK_B_ENABLED) {
      if (!val.REDIS_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'WEBHOOK_B_ENABLED=true requires REDIS_ENABLED=true (deduplication storage).',
          path: ['REDIS_ENABLED'],
        });
      }
    }

    if (val.CACHE_ENABLED && val.CACHE_ADMIN_ENABLED && val.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CACHE_ADMIN_ENABLED should not be true in production.',
        path: ['CACHE_ADMIN_ENABLED'],
      });
    }

    if (val.RATE_LIMIT_ENABLED && !val.REDIS_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'RATE_LIMIT_ENABLED=true requires REDIS_ENABLED=true (Redis-based limiter).',
        path: ['REDIS_ENABLED'],
      });
    }

    if (val.AUTH0_ENABLED) {
      if (!val.AUTH0_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH0_SECRET is required when AUTH0_ENABLED=true (use a long random string).',
          path: ['AUTH0_SECRET'],
        });
      }
      if (!val.AUTH0_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH0_BASE_URL is required when AUTH0_ENABLED=true.',
          path: ['AUTH0_BASE_URL'],
        });
      }
      if (!val.AUTH0_CLIENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH0_CLIENT_ID is required when AUTH0_ENABLED=true.',
          path: ['AUTH0_CLIENT_ID'],
        });
      }
      if (!val.AUTH0_ISSUER_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH0_ISSUER_BASE_URL is required when AUTH0_ENABLED=true.',
          path: ['AUTH0_ISSUER_BASE_URL'],
        });
      }
    }

    if (val.AUTH0_M2M_ENABLED) {
      if (!val.REDIS_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH0_M2M_ENABLED=true requires REDIS_ENABLED=true (token caching/locking).',
          path: ['REDIS_ENABLED'],
        });
      }
      if (!val.AUTH0_M2M_TOKEN_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH0_M2M_TOKEN_URL is required when AUTH0_M2M_ENABLED=true.',
          path: ['AUTH0_M2M_TOKEN_URL'],
        });
      }
      if (!val.AUTH0_M2M_CLIENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH0_M2M_CLIENT_ID is required when AUTH0_M2M_ENABLED=true.',
          path: ['AUTH0_M2M_CLIENT_ID'],
        });
      }
      if (!val.AUTH0_M2M_CLIENT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH0_M2M_CLIENT_SECRET is required when AUTH0_M2M_ENABLED=true.',
          path: ['AUTH0_M2M_CLIENT_SECRET'],
        });
      }
      if (!val.AUTH0_M2M_AUDIENCE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'AUTH0_M2M_AUDIENCE is required when AUTH0_M2M_ENABLED=true (Auth0 requires audience).',
          path: ['AUTH0_M2M_AUDIENCE'],
        });
      }
    }
  });

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  MYSQL_ENABLED: parsed.MYSQL_ENABLED ?? false,
  MYSQL_URL: parsed.MYSQL_URL,
} as const;

export type Env = z.infer<typeof envSchema>;
