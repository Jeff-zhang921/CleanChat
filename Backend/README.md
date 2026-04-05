# CleanChat Backend

Backend service for CleanChat using Express, TypeScript, Prisma, and PostgreSQL.

## Prerequisites

1. Install Node.js (npm is included with Node). Recommended: Node 20+.
2. Install PostgreSQL and create a database.
3. Open a terminal in this folder:

```powershell
cd C:\Users\Jeff\CleanChat\CleanChat\Backend
```

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Create or update `.env` in this folder:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/cleanchat?schema=public"
PORT=3000
```

3. Generate Prisma client:

```powershell
npx prisma generate
```

4. Push the current schema to your database:

```powershell
npx prisma db push
```

Optional (if you want migration files):

```powershell
npx prisma migrate dev --name init
```

## Run the backend now

Based on the current file layout, this is the working command:

```powershell
npx ts-node index.ts
```

With auto-reload during development:

```powershell
npx nodemon --exec ts-node index.ts
```

Server URL: `http://localhost:4000`

## Current npm scripts status

- `npm run dev` points to `./src/index.ts` (that file does not exist yet)
- `npm run build` runs `tsc --build` (requires a `tsconfig.json`, which is not present yet)
- `npm run start` expects `./dist/src/index.js` (not produced by current layout)
- `npm test` expects `jest.config.js` (not present yet)

## Notes

- `src/auth.ts`, `src/chat.ts`, and `src/profile.ts` currently exist as placeholders.
- Prisma client output is configured to `src/generated/prisma`.

## Runtime Durability And Keepalive

The backend now persists in-memory runtime state (group store, mute store, unread read-checkpoints) into PostgreSQL and hydrates it at startup.

Available ops endpoints:

- `GET /ops/healthz` (alias: `/healthz`)
- `GET /ops/readyz` (alias: `/readyz`)
- `GET /ops/keepalive` (alias: `/keepalive`)
- `GET /ops/push-config` (alias: `/push-config`)
- `POST /ops/runtime-state/flush` (optional `x-ops-token` header when `OPS_TOKEN` is set)

Optional environment variables:

```env
# Runtime state snapshot flush debounce window (milliseconds)
RUNTIME_STATE_FLUSH_DEBOUNCE_MS=2000

# Keepalive loop controls
KEEPALIVE_ENABLED=true
KEEPALIVE_INTERVAL_MS=240000
KEEPALIVE_TIMEOUT_MS=8000
KEEPALIVE_TARGET_URL="https://your-backend-host/ops/keepalive?source=internal-loop"

# Optional token to protect operational write endpoints
OPS_TOKEN="change-this"
```

If you use GitHub Actions keepalive, configure repository secrets:

- `BACKEND_KEEPALIVE_URL`
- `BACKEND_OPS_TOKEN` (optional, only when `OPS_TOKEN` is set)

Workflow file: `.github/workflows/backend-keepalive.yml`

### Push Configuration Validation Checklist

1. Local `.env` or Koyeb env must define both `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
2. `VAPID_PRIVATE_KEY` must stay backend-only. Never expose it in frontend env or client code.
3. Verify backend status after deployment:

```powershell
curl https://your-backend-domain/ops/push-config
```

Expected result: `ok: true` and no format errors.

4. Verify frontend can fetch the public key while authenticated:

```powershell
curl -H "Authorization: Bearer <JWT>" https://your-backend-domain/profile/push/public-key
```

5. If you rotate VAPID keys, force clients to rebuild subscriptions by using the in-app notification enable flow once.
