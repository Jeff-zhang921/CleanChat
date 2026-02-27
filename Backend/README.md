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

Server URL: `http://localhost:3000`

## Current npm scripts status

- `npm run dev` points to `./src/index.ts` (that file does not exist yet)
- `npm run build` runs `tsc --build` (requires a `tsconfig.json`, which is not present yet)
- `npm run start` expects `./dist/src/index.js` (not produced by current layout)
- `npm test` expects `jest.config.js` (not present yet)

## Notes

- `src/auth.ts`, `src/chat.ts`, and `src/profile.ts` currently exist as placeholders.
- Prisma client output is configured to `src/generated/prisma`.
