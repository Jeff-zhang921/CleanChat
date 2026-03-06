# CleanChat: Passwordless Real-Time Messaging

Passwordless real-time chat with clean IDs, profiles, direct messages, and group conversations.

**CleanChat is made for the moment when you only need a quick chat, without friend requests, without account friction, and without forcing anyone to install an app.**

<p>
  <img alt="React" src="https://img.shields.io/badge/Frontend-React%2018-61DAFB?logo=react&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Runtime-Node.js-339933?logo=nodedotjs&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Backend-Express%205-000000?logo=express&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Cloudflare Pages" src="https://img.shields.io/badge/Hosting-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white" />
  <img alt="Koyeb" src="https://img.shields.io/badge/Backend%20Hosting-Koyeb-121212?logoColor=white" />
  <img alt="Neon Postgres" src="https://img.shields.io/badge/Database-Neon%20Postgres-00E699?logo=postgresql&logoColor=white" />
  <img alt="Realtime" src="https://img.shields.io/badge/Realtime-Socket.IO-010101?logo=socketdotio&logoColor=white" />
</p>

## Live Demo
### Computer
<img alt="demo" src="Docs/clean.gif"/>

### Phone

<img alt="demos" src="Docs/cleans.gif">
**[Open CleanChat](https://cleanchat.pages.dev)**

## Table Of Contents

- [Why This Project](#why-this-project)
- [Highlights](#highlights)
- [Product Flow](#product-flow)
- [Stack And Hosting](#stack-and-hosting)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Production Notes](#production-notes)
- [PWA (Install on Phone)](#pwa-install-on-phone)
- [Avatar Guide](#avatar-guide)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [Docs](#docs)

## Why This Project

CleanChat is a full-stack messaging app focused on simple onboarding and reliable real-time chat.
Users sign in with email code, create identity (`cleanId`, nickname, avatar), and start conversations immediately.
That focus drives a low-friction onboarding and instant messaging flow.

## Highlights

| Area | What You Get |
| --- | --- |
| Passwordless Auth | Email-code login (`/auth/email/start`, `/auth/email/verify`) |
| Identity Setup | `cleanId`, nickname, avatar selection, profile edit/delete |
| Conversation UX | Search users by `cleanId`, preview last message, open chat quickly |
| Group Chat | Create groups, join/leave groups, creator-only delete group |
| Real-Time Messaging | Socket.IO room-based messaging and live updates |
| Media Support | Optional image upload via UploadThing token |
| Mobile Ready | PWA installable on phone + Cloudflare same-origin proxy |

## Product Flow

1. User enters email at `/login`.
2. User verifies code at `/verify`.
3. New users finish onboarding at `/basic-info`.
4. User opens `/conversations` and can search people by `cleanId`.
5. User opens `/groups` to create, join, or leave group chats.
6. User opens `/chat` to message in real time (direct or group).

## Stack And Hosting

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, Socket.IO Client |
| Backend | Express 5, TypeScript, Prisma, Express Session, Nodemailer, Socket.IO |
| Database | PostgreSQL (Neon) |

| Service | Platform | Region |
| --- | --- | --- |
| Frontend | Cloudflare Pages | Global Edge |
| Backend | Koyeb | Frankfurt (Germany) |
| Database | Neon | Singapore (AWS AP Southeast 1) |

## Architecture

```text
Browser/PWA (cleanchat.pages.dev)
  -> /api/* and /socket.io/* (same origin)
Cloudflare Pages Functions
  -> proxy to Koyeb backend (Frankfurt)
Koyeb Express + Socket.IO
  -> Neon Postgres (Singapore)
```

## Quick Start

### 1. Prerequisites

- Node.js 20+ and npm
- A PostgreSQL database (Neon recommended)
- SMTP account (Gmail app password recommended) for email verification

### 2. Backend Setup

```bash
cd CleanChat/Backend
npm install
npm run db:generate
npm run db:push
npm run dev
```

Backend runs on `http://localhost:4000` by default.

### 3. Frontend Setup

```bash
cd CleanChat/Frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

## Environment Variables

### Backend (Koyeb or local `Backend/.env`)

| Name | Required | Example | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | `postgresql://...` | Prisma connection string |
| `LOGIN_CODE_SECRET` | Yes | `strong-random-secret` | Signs email verification code |
| `SESSION_SECRET` | Recommended | `another-strong-secret` | Express session signing |
| `SMTP_USER` | Yes | `you@gmail.com` | SMTP username |
| `SMTP_PASS` | Yes | `xxxxxxxxxxxxxxxx` | SMTP app password |
| `SMTP_FROM` | Yes | `CleanChat <you@gmail.com>` | Sender identity |
| `FRONTEND_URL` or `FRONTEND_URLS` | Yes (prod) | `https://cleanchat.pages.dev` | CORS + cookie origin allowlist |
| `UPLOADTHING_TOKEN` | Optional | `eyJ...` | Enables image upload route |
| `NODE_ENV` | Yes (prod) | `production` | Production cookie/security mode |
| `PORT` | Optional | `4000` | Backend port |

### Frontend Build Variables (Cloudflare Pages)

| Name | Required | Example | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | Yes | `/api` | Frontend API base URL |
| `VITE_SOCKET_URL` | Optional | `https://cleanchat.pages.dev` | Socket.IO base URL |

### Cloudflare Pages Functions Variables

| Name | Required | Example | Purpose |
| --- | --- | --- | --- |
| `KOYEB_ORIGIN` | Yes | `https://your-service.koyeb.app` | Upstream backend origin for `/api/*` and `/socket.io/*` proxy |

## Production Notes

1. Keep browser requests same-origin through Cloudflare proxy paths (`/api/*`, `/socket.io/*`).
2. Frontend requests must include `credentials: "include"` for session cookie auth.
3. In production, cookie mode should stay `sameSite: "none"` and `secure: true`.
4. Session max age is set to 24 hours in backend session config.
5. If phone still shows old UI after deploy, remove old PWA and clear browser cache.

## PWA (Install on Phone)

CleanChat is installable on mobile and desktop as a PWA.

Install steps:

1. Open `https://cleanchat.pages.dev` on mobile browser.
2. Android Chrome: menu -> `Install app` or `Add to Home screen`.
3. iPhone Safari: Share -> `Add to Home Screen`.

Update behavior:

- PWA service worker is enabled with auto update.
- After a new deployment, clients fetch the new version on next open/refresh while online.
- Some browsers (especially iOS Safari) may require closing and reopening once.

PWA config files:

- `Frontend/vite.config.ts` (VitePWA plugin + manifest)
- `Frontend/src/main.tsx` (service worker registration)
- `Frontend/public/icons/icon-192.svg`
- `Frontend/public/icons/icon-512.svg`
- `Frontend/index.html` (mobile meta tags)

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
4. Add the new option in frontend avatar lists: `Frontend/src/pages/basicInfo.tsx`, `Frontend/src/pages/profile.tsx`, `Frontend/src/pages/ConversationPage.tsx` (avatar URL map).

### Cloudflare Proxy Setup

To keep auth/session stable on mobile browsers, this project proxies backend requests through Cloudflare Pages Functions:

- `/api/*` -> Koyeb backend
- `/socket.io/*` -> Koyeb backend socket endpoint

Recommended Cloudflare environment variable:

- `KOYEB_ORIGIN=https://your-koyeb-service.koyeb.app`
- If not set, the proxy currently falls back to:
  `https://clinical-ursulina-cleanchan-eb6e1ee6.koyeb.app`

Recommended frontend build variables:

- `VITE_API_URL=/api`
- `VITE_SOCKET_URL=https://your-pages-domain.pages.dev` (optional, default is current site origin in production)

## Troubleshooting

| Problem | Fast Check |
| --- | --- |
| Verification email send fails | Validate `SMTP_USER`/`SMTP_PASS` and provider app password |
| CORS or cookie issues on phone | Confirm frontend uses `/api`, set `KOYEB_ORIGIN`, include credentials |
| `public.User does not exist` | Run `npm run db:generate` and `npm run db:push` |
| `EADDRINUSE` port conflict | Stop previous process using port `4000` |
| Uploaded image disappears | Confirm `UPLOADTHING_TOKEN` is set on backend deployment |
| Group list resets after backend restart | Current group system is in-memory (`Backend/src/groupStore.ts`), not persisted in DB |
| Android notifications not showing | Verify browser notification permission and PWA install state |

## Project Structure

```text
CleanChat/
  Backend/
    index.ts                   # Express app entry
    prisma/
      schema.prisma            # Data model + enums (User/Thread/Message/Avatar...)
    src/
      routes/
        auth.ts
        profile.ts
        chat.ts
      socket/
        index.ts               # Socket.IO server logic
      groupStore.ts            # In-memory group chat store + membership
      avatar.ts                # Avatar enum -> DiceBear URL mapping
      session.ts               # Session configuration
  Frontend/
    vite.config.ts             # Vite + PWA plugin config
    public/
      icons/
        icon-192.svg           # PWA app icon
        icon-512.svg           # PWA app icon
    functions/                 # Cloudflare Pages Functions (reverse proxy)
      api/[[path]].ts          # /api/* -> Koyeb
      socket.io/[[path]].ts    # /socket.io/* -> Koyeb
    src/
      config.ts                # BACKEND_URL/SOCKET_URL config
      main.tsx                 # React root + service worker register
      components/
        BottomNav.tsx
      pages/
        login.tsx
        verify.tsx
        basicInfo.tsx
        ConversationPage.tsx
        GroupConversationPage.tsx
        chatPage.tsx
        profile.tsx
  Docs/
    README.md                  # Deployment/Proxy issue report and fix guide
```

## Docs

- Reverse proxy issue + solution: [Docs/README.md](Docs/README.md)
- Backend API reference: [Docs/API_README.md](Docs/API_README.md)
- Notifications + photo upload deep dive: [Docs/NOTIFICATION_UPLOAD_README.md](Docs/NOTIFICATION_UPLOAD_README.md)

## License

MIT (see `LICENSE`)
