import { getAuth0M2MTokenHealth } from '../services/auth0M2MToken';

export async function getAuth0M2MTokenStatusController() {
  return await getAuth0M2MTokenHealth();
}
