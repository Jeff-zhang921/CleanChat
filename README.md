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

## PWA (Install on Phone)

CleanChat can be installed to phone home screen as a PWA.

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
4. Add the new option in frontend avatar lists:
   - `Frontend/src/pages/basicInfo.tsx`
   - `Frontend/src/pages/profile.tsx`
   - `Frontend/src/pages/ConversationPage.tsx` (avatar URL map)

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
