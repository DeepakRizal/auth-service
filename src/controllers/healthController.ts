import { getDbHealth } from '../services/db';
import { getAuth0M2MTokenHealth } from '../services/auth0M2MToken';
import { getExternalAHealth } from '../services/externalApiA';
import { getRedisHealth } from '../services/redis';

export async function getHealth() {
  const db = getDbHealth();
  const redis = getRedisHealth();
  const auth0M2M = await getAuth0M2MTokenHealth();
  const externalA = getExternalAHealth();

  const isDbOk = !db.enabled || db.status === 'up';
  const isRedisOk = !redis.enabled || redis.status === 'up';
  const isAuth0M2MOk =
    !auth0M2M.enabled || auth0M2M.status === 'ok' || auth0M2M.status === 'disabled';

  const status = isDbOk && isRedisOk && isAuth0M2MOk ? 'ok' : 'degraded';

  return {
    httpStatus: status === 'ok' ? 200 : 503,
    body: {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        db,
        redis,
        auth0M2M,
        externalA,
      },
    },
  };
}
