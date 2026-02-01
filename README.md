## Farmlokal Assignment Backend

This is a simple backend written in **Node.js + TypeScript** using **MySQL** and **Redis**.

It includes:
- A fast product listing API (`/products`) built for large datasets
- Redis caching + rate limiting (optional)
- Two external integrations:
  - **External API A (sync)** with timeout/retry + circuit breaker
  - **External API B (webhook)** with idempotency + deduplication
- Authentication using **Auth0**:
  - **Auth0 Login (browser)** for demo
  - **OAuth2 Client Credentials (M2M)** (required by the assignment)

---

## Setup

### Requirements
- Node.js (recommended **Node 20+**)
- MySQL
- Redis

### Install
```bash
npm install
```

### Configure `.env`
Copy the example file:
```bash
cp .env.example .env
```

Fill in your real MySQL/Redis/Auth0 values inside `.env`.

Important:
- Do **not** commit `.env` (it contains secrets).
- If you change `.env`, restart the server.

### Run
```bash
npm run dev
```

---

## Useful scripts
- `npm run dev`: run in development (ts-node-dev)
- `npm run build`: build TypeScript to `dist/`
- `npm start`: run the built server
- `npm run seed:products`: seed 1M+ products
- `npm run bench:queries`: run EXPLAIN + latency checks

---

## Architecture (high level)

- `src/server.ts`: bootstrap (server → MySQL → Redis → Auth0 M2M auto-refresh)
- `src/app.ts`: Express app + middleware + routes
- `src/routes/`: HTTP routes
- `src/controllers/`: request handlers
- `src/services/`: DB, Redis, caching, Auth0 M2M tokens, external API logic
- `src/repositories/`: MySQL queries (products)
- `src/modules/`: webhook module (External API B)

---

## Caching strategy (Redis)

### What is cached
- `GET /products`
- `GET /products/stats`

### How cache keys work
Cache keys include a Redis “version” (`products:cache_version`).  
When we invalidate cache we **increase the version** so new requests use new keys.

### Cache stampede protection
If a cache entry is missing, one request computes it while others wait briefly (Redis lock + short wait).

### Manual invalidation endpoint
- `POST /admin/cache/products/invalidate`

---

## Performance optimizations

### MySQL indexes
The `products` table is created (if missing) with indexes:
- `category`
- `price`
- `createdAt`
- FULLTEXT on `(name, description)` for search

### Cursor pagination
`GET /products` uses cursor pagination and returns one extra row (`limit + 1`) to know if there is a next page without a `COUNT(*)`.

---

## Trade-offs (simple)
- Cache invalidation uses a version bump. Old keys are left in Redis until TTL (simple + fast).
- Request dedupe is in-memory, so it works per instance (not shared across multiple servers).
- Webhook “business logic” is minimal (the focus is exactly-once processing).
- Auth0 “Initiate Login URI” cannot be localhost (Auth0 requires HTTPS), so we leave it empty for local dev.

---

## Testing

### Browser test UI
- `http://localhost:3000/ui`

### Auth0 login (browser only)
- `http://localhost:3000/login`
- `http://localhost:3000/profile`
- `http://localhost:3000/logout`

Auth0 Dashboard settings for local dev (Application → Settings):
- Allowed Callback URLs: `http://localhost:3000/callback`
- Allowed Logout URLs: `http://localhost:3000/logout`
- Allowed Web Origins: `http://localhost:3000`

### Postman / curl endpoints
- Health: `GET http://localhost:3000/health`
- Auth status: `GET http://localhost:3000/auth/status`
- Auth0 M2M status: `GET http://localhost:3000/auth0/m2m/status`
- External A health: `GET http://localhost:3000/external-a/health`
- External A sync: `GET http://localhost:3000/external-a/sync`
- Products: `GET http://localhost:3000/products`
- Product stats: `GET http://localhost:3000/products/stats`
- Webhook: `POST http://localhost:3000/webhooks/external-b`

Webhook example:
```bash
curl -i -X POST http://localhost:3000/webhooks/external-b \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: evt_123" \
  --data-binary "{\"id\":\"evt_123\",\"type\":\"ping\",\"data\":{\"hello\":\"world\"}}"
```

---

## Enable Auth0 M2M (OAuth2 client credentials)

In `.env`:
- `AUTH0_M2M_ENABLED=true`
- `AUTH0_M2M_TOKEN_URL=https://<your-auth0-domain>/oauth/token`
- `AUTH0_M2M_CLIENT_ID=...`
- `AUTH0_M2M_CLIENT_SECRET=...`
- `AUTH0_M2M_AUDIENCE=...`
- `REDIS_ENABLED=true`

Then restart the server.

---

## Enable External API A

In `.env`:
- `EXTERNAL_A_ENABLED=true`
- `EXTERNAL_A_URL=https://jsonplaceholder.typicode.com/todos/1`

Then restart the server.

---

## Seeding 1,000,000+ products
```bash
SEED_RESET=true SEED_COUNT=1000000 SEED_BATCH_SIZE=2000 npm run seed:products
```

---

## Deploy to Render (quick notes)
- Build command: `npm run build`
- Start command: `npm start`
- Add env vars in Render using `.env.example` as a guide (never paste secrets into Git).
