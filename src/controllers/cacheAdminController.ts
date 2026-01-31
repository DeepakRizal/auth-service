import { env } from '../config/env';
import { bumpProductsCacheVersion } from '../services/productsCache';

export async function invalidateProductsCacheController() {
  if (!env.CACHE_ADMIN_ENABLED) {
    return { httpStatus: 404, body: { error: { message: 'Cache admin disabled' } } };
  }
  if (env.NODE_ENV === 'production') {
    return { httpStatus: 403, body: { error: { message: 'Not allowed in production' } } };
  }

  await bumpProductsCacheVersion();
  return { httpStatus: 200, body: { ok: true } };
}
