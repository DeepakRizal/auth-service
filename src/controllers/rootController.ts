import type { RequestHandler } from 'express';

export const getRootController: RequestHandler = (req, res) => {
  const authenticated = req.oidc?.isAuthenticated?.() ?? false;
  if (!authenticated) {
    res.status(200).json({
      authenticated: false,
      loginUrl: '/login',
      profileUrl: '/profile',
      uiUrl: '/ui',
    });
    return;
  }

  const user = req.oidc?.user as unknown;
  const u = typeof user === 'object' && user !== null ? (user as Record<string, unknown>) : {};
  const name = typeof u.name === 'string' ? u.name : null;
  const email = typeof u.email === 'string' ? u.email : null;

  res.status(200).json({
    authenticated: true,
    name,
    email,
    user: u,
  });
};
