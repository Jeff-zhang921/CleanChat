# CleanChat

<p>
  <img alt="Frontend" src="https://img.shields.io/badge/Frontend-React%2018-61DAFB?logo=react&logoColor=white" />
  <img alt="Backend" src="https://img.shields.io/badge/Backend-Express%205-000000?logo=express&logoColor=white" />
  <img alt="Language" src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Database" src="https://img.shields.io/badge/Database-PostgreSQL-336791?logo=postgresql&logoColor=white" />
  <img alt="ORM" src="https://img.shields.io/badge/ORM-Prisma-2D3748?logo=prisma&logoColor=white" />
  <img alt="Realtime" src="https://img.shields.io/badge/Realtime-Socket.IO-010101?logo=socketdotio&logoColor=white" />
</p>

CleanChat is a full-stack messaging app with passwordless sign-in, clean identity setup, and real-time chat.  
Users log in by email code, create profile identity (`cleanId`, nickname, avatar), and continue into conversations.

## Highlights

| Area | What You Get |
| --- | --- |
| Authentication | Passwordless email verification code (`/auth/email/start`, `/auth/email/verify`) |
| Identity | Custom `cleanId`, nickname, avatar picker, profile editing |
| Conversation UX | Conversation list with previews and global user search by `cleanId` |
| Real-time Chat | Socket.IO messaging + thread-based room join |
| Backend | Express + Prisma + session auth + PostgreSQL |

## Product Flow

1. User enters email at `/login`.
2. User verifies code at `/verify`.
3. New users finish onboarding at `/basic-info`.
4. User opens `/conversations` and can search people by `cleanId`.
5. User opens `/chat` to message in real time.

## Tech Stack

| Layer | Stack |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend | Express 5, TypeScript, Prisma, Nodemailer, Socket.IO |
| Database | PostgreSQL (Neon-compatible) |

## Hosting

| Service | Platform | Region |
| --- | --- | --- |
| Frontend | Cloudflare Pages | Global Edge |
| Backend | Koyeb | Frankfurt (Germany) |
| Database | Neon | Singapore (AWS AP Southeast 1) |

## Live Website

- Frontend: `https://cleanchat.pages.dev`
- Backend API origin: `https://clinical-ursulina-cleanchan-eb6e1ee6.koyeb.app`
- Browser requests in production use Cloudflare proxy paths (`/api/*`, `/socket.io/*`) for better cookie/session compatibility.

## Avatar Guide

### How avatars are used

1. New users choose an avatar on `/basic-info`.
2. Existing users can change avatar on `/profile`.
3. The selected avatar key (for example `AVATAR_LEO`) is stored in database.
4. Frontend converts the key to a DiceBear image URL and displays it in conversations/chat/profile.

Current avatar set:

- `AVATAR_LEO`
- `AVATAR_SOPHIE`
- `AVATAR_MAX`
- `AVATAR_BELLA`
- `AVATAR_CHARLIE`

### How to add a new avatar

1. Add the new value to Prisma `Avatar` enum in `Backend/prisma/schema.prisma`.
2. Run Prisma update commands (`npm run db:generate` and migration/push).
3. Add URL mapping in `Backend/src/avatar.ts`.
4. Add the new option in frontend avatar lists:
   - `Frontend/src/pages/basicInfo.tsx`
   - `Frontend/src/pages/profile.tsx`
   - `Frontend/src/pages/ConversationPage.tsx` (avatar URL map)

### Cloudflare Proxy Setup

To keep auth/session stable on mobile browsers, this project proxies backend requests through Cloudflare Pages Functions:

- `/api/*` -> Koyeb backend
- `/socket.io/*` -> Koyeb backend socket endpoint

Required Cloudflare environment variable:

- `KOYEB_ORIGIN=https://your-koyeb-service.koyeb.app`

Recommended frontend build variables:

- `VITE_API_URL=/api`
- `VITE_SOCKET_URL=https://your-pages-domain.pages.dev` (optional, default is current site origin in production)

## Project Structure

```text
CleanChat/
  Backend/     # Express + Prisma API
  Frontend/    # React + Vite app
  Docs/
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL database
- SMTP account for verification emails

### 1) Backend

```bash
cd Backend
npm install
```

Create `Backend/.env`:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require
PORT=4000
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=CleanChat <no-reply@example.com>
LOGIN_CODE_SECRET=replace_with_a_long_random_secret
NODE_ENV=development
```

Run migrations and start dev server:

```bash
npm run db:generate
npm run db:push
npm run dev
```

Backend URL: `http://localhost:4000`

### 2) Frontend

```bash
cd Frontend
npm install
npm run dev
```

Frontend URL: usually `http://localhost:5173` or `http://localhost:5273`

## Frontend Routes

| Route | Purpose |
| --- | --- |
| `/login` | Enter email |
| `/verify` | Enter verification code |
| `/basic-info` | First-time profile setup |
| `/conversations` | Conversation list + cleanId search |
| `/chat` | Thread messages |
| `/profile` | View/Edit profile |

## Backend API

### Auth

- `POST /auth/email/start`
- `POST /auth/email/verify`
- `GET /auth/me`
- `POST /auth/logout`

### Profile

- `GET /profile/me`
- `PATCH /profile/me`
- `PATCH /profile/clean-id`

### Chat

- `GET /chat/threads`
- `POST /chat/threads`
- `GET /chat/threads/:threadId/messages`
- `GET /chat/users/search?cleanId=<query>`

## Scripts

### Backend

- `npm run dev` - start backend with nodemon + ts-node
- `npm run build` - compile TypeScript
- `npm run db:generate` - generate Prisma client
- `npm run db:push` - push schema to database
- `npm run db:seed` - seed data

### Frontend

- `npm run dev` - start Vite dev server
- `npm run build` - build production bundle
- `npm run preview` - preview build

## License

MIT (see `LICENSE`)
