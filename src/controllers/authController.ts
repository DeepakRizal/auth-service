import type { RequestHandler } from 'express';

export const getAuthStatusController: RequestHandler = (req, res) => {
  res.json({
    authenticated: req.oidc?.isAuthenticated?.() ?? false,
  });
};

export const getProfileController: RequestHandler = (req, res) => {
  res.json({
    user: req.oidc.user,
  });
};
