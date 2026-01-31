import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getRedisClient, getRedisHealth } from '../services/redis';

type RateLimitResult = {
  count: number;
  ttlSeconds: number;
};

const rateLimitLua = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
`;

async function incrementWithTtl(key: string, windowSeconds: number): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const res = (await redis.eval(rateLimitLua, 1, key, String(windowSeconds))) as [number, number];
  return { count: Number(res[0] ?? 0), ttlSeconds: Number(res[1] ?? windowSeconds) };
}

function getClientIp(req: Parameters<RequestHandler>[0]) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimitMiddleware(): RequestHandler {
  return async (req, res, next) => {
    if (!env.RATE_LIMIT_ENABLED) return next();
    if (req.method === 'OPTIONS') return next();
    if (req.originalUrl.startsWith('/health')) return next();

    const redisHealth = getRedisHealth();
    if (!redisHealth.enabled || redisHealth.status !== 'up') {
      res.setHeader('x-rate-limit', 'BYPASS');
      return next();
    }

    const ip = getClientIp(req);
    const windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS;
    const max = env.RATE_LIMIT_MAX;

    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `${env.RATE_LIMIT_KEY_PREFIX}:${bucket}:${ip}`;

    try {
      const { count, ttlSeconds } = await incrementWithTtl(key, windowSeconds);

      res.setHeader('x-rate-limit', 'ON');
      res.setHeader('x-rate-limit-limit', String(max));
      res.setHeader('x-rate-limit-remaining', String(Math.max(0, max - count)));
      res.setHeader('x-rate-limit-reset-seconds', String(Math.max(0, ttlSeconds)));

      if (count > max) {
        res.setHeader('retry-after', String(Math.max(1, ttlSeconds)));
        logger.warn({ ip, path: req.originalUrl, count, max }, 'Rate limit exceeded');
        return res.status(429).json({
          error: {
            message: 'Too many requests',
            statusCode: 429,
          },
        });
      }

      return next();
    } catch (err) {
      logger.warn({ err }, 'Rate limiter failed; bypassing');
      res.setHeader('x-rate-limit', 'BYPASS');
      return next();
    }
  };
}
