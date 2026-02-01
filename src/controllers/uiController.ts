import type { RequestHandler } from 'express';
import { env } from '../config/env';

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export const getUiController: RequestHandler = (req, res) => {
  const isAuthenticated = req.oidc?.isAuthenticated?.() ?? false;
  const user = req.oidc?.user;

  const rows: Array<{ name: string; enabled: boolean }> = [
    { name: 'AUTH0_ENABLED', enabled: env.AUTH0_ENABLED },
    { name: 'AUTH0_M2M_ENABLED', enabled: env.AUTH0_M2M_ENABLED },
    { name: 'EXTERNAL_A_ENABLED', enabled: env.EXTERNAL_A_ENABLED },
    { name: 'WEBHOOK_B_ENABLED', enabled: env.WEBHOOK_B_ENABLED },
    { name: 'CACHE_ENABLED', enabled: env.CACHE_ENABLED },
    { name: 'RATE_LIMIT_ENABLED', enabled: env.RATE_LIMIT_ENABLED },
    { name: 'METRICS_ENABLED', enabled: env.METRICS_ENABLED },
  ];

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Farmlokal – Browser Test UI</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; line-height: 1.45; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
      a { color: #2563eb; }
      table { border-collapse: collapse; width: 100%; max-width: 760px; }
      td, th { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
      .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; }
      .on { background: #dcfce7; color: #166534; }
      .off { background: #fee2e2; color: #991b1b; }
      .section { margin: 18px 0 26px; }
    </style>
  </head>
  <body>
    <h2>Browser Test UI</h2>

    <div class="section">
      <h3>Feature flags</h3>
      <table>
        <thead><tr><th>Flag</th><th>Status</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr><td><code>${escapeHtml(r.name)}</code></td><td><span class="pill ${
                  r.enabled ? 'on' : 'off'
                }">${r.enabled ? 'ON' : 'OFF'}</span></td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h3>Auth0 user login (browser)</h3>
      <ul>
        <li><a href="/login">/login</a></li>
        <li><a href="/logout">/logout</a></li>
        <li><a href="/profile">/profile</a> (requires login)</li>
        <li><a href="/auth/status">/auth/status</a></li>
      </ul>
      <div>
        <strong>Authenticated:</strong> <code>${isAuthenticated ? 'true' : 'false'}</code>
      </div>
      ${
        isAuthenticated && user
          ? `<pre style="white-space:pre-wrap;background:#0b1020;color:#e5e7eb;padding:12px;border-radius:10px;max-width:760px;overflow:auto;">${escapeHtml(
              JSON.stringify(
                {
                  name: 'Jane Doe',
                  email: 'jane.doe@example.com',
                  email_verified: true,
                  sub: 'provider|user_id',
                },
                null,
                2,
              ),
            )}</pre>`
          : ''
      }
    </div>

    <div class="section">
      <h3>OAuth2 client credentials (Auth0 M2M)</h3>
      <ul>
        <li><a href="/auth0/m2m/status">/auth0/m2m/status</a></li>
      </ul>
    </div>

    <div class="section">
      <h3>External API A</h3>
      <ul>
        <li><a href="/external-a/health">/external-a/health</a></li>
        <li><a href="/external-a/sync">/external-a/sync</a></li>
      </ul>
    </div>

    <div class="section">
      <h3>Products</h3>
      <ul>
        <li><a href="/products">/products</a></li>
        <li><a href="/products/stats">/products/stats</a></li>
      </ul>
    </div>

    <div class="section">
      <h3>Other</h3>
      <ul>
        <li><a href="/health">/health</a></li>
        <li><a href="/metrics">/metrics</a> (only if enabled)</li>
      </ul>
    </div>
  </body>
</html>`;

  res.setHeader('cache-control', 'no-store');
  res.status(200).type('html').send(html);
};
