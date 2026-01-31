import type { ConfigParams } from 'express-openid-connect';
import { env } from './env';

export function getAuth0Config(): ConfigParams {
  const isProd = env.NODE_ENV === 'production';
  const hasClientSecret = Boolean(env.AUTH0_CLIENT_SECRET);

  return {
    authRequired: false,
    auth0Logout: true,
    secret: env.AUTH0_SECRET!,
    baseURL: env.AUTH0_BASE_URL!,
    clientID: env.AUTH0_CLIENT_ID!,
    issuerBaseURL: env.AUTH0_ISSUER_BASE_URL!,

    clientSecret: env.AUTH0_CLIENT_SECRET,

    authorizationParams: {
      response_type: hasClientSecret ? 'code' : 'id_token',
      response_mode: hasClientSecret ? 'query' : 'form_post',
      scope: 'openid profile email',
    },

    session: {
      cookie: {
        secure: isProd,
        sameSite: isProd ? 'None' : 'Lax',
      },
    },

    transactionCookie: {
      sameSite: isProd ? 'None' : 'Lax',
    },

    routes: {
      login: '/login',
      callback: '/callback',
      logout: '/logout',
    },
  };
}
