# CleanChat

**Quiet, passwordless messaging with a layout people actually want to keep open.**

CleanChat is a full-stack chat app built around low-friction entry, calm identity, and a polished interface across phone and desktop. No password maze. No noisy dashboard energy. Just email-code sign-in, a memorable `CleanID`, real-time conversations, and an interface designed to feel composed the moment it loads.

<p>
  <img alt="Frontend" src="https://img.shields.io/badge/Frontend-React%2018-61DAFB?logo=react&logoColor=white" />
  <img alt="Backend" src="https://img.shields.io/badge/Backend-Express%205-000000?logo=express&logoColor=white" />
  <img alt="Language" src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Realtime" src="https://img.shields.io/badge/Realtime-Socket.IO-010101?logo=socketdotio&logoColor=white" />
  <img alt="Database" src="https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Hosting" src="https://img.shields.io/badge/Frontend-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white" />
  <img alt="Hosting" src="https://img.shields.io/badge/Backend-Koyeb-121212?logoColor=white" />
</p>

**Live:** [cleanchat.pages.dev](https://cleanchat.pages.dev)

## Why It Hits Different

- **Passwordless from the first screen.** Users enter an email, verify a code, and get straight into chat.
- **Identity is part of the product.** `CleanID`, Trust Score, Purity, and short-handle claims turn profiles into social assets instead of filler settings.
- **The layout is deliberate.** Mobile stays content-first, desktop gets a quieter docked feel, and the UI avoids loud CRUD-style clutter.
- **Real-time is the default.** Direct messages and group chats update live over Socket.IO.
- **It feels installable.** The frontend ships as a PWA so the experience works well on phones and can live on the home screen.

## Product Snapshot

| Area | What CleanChat Does |
| --- | --- |
| Auth | Email-code login with no password reset flow |
| Identity | `CleanID`, nickname, avatar tiers, Trust Score, Purity detail, Identity Vault |
| Direct Chat | Search by `CleanID`, open a private line fast, send text and images |
| Groups | Discover, join, leave, create groups, and review owner-side join requests |
| Realtime | Live messaging and inbox updates via Socket.IO rooms |
| UI System | Mobile-first navigation, calm surfaces, desktop dock, soft motion, PWA installability |

## Signature Product Ideas

### 1. CleanID

Every account gets a `CleanID`, which acts as the social handle throughout the app.

### 2. Trust Score

CleanChat avoids loud gamified levels. Instead, it calculates a quieter signal:

- `Blurred`
- `Forming`
- `Steady`
- `Clear`

That score influences how identity is presented and what unlocks over time.

### 3. Short ID Claim

Higher-trust users can unlock scarce 3-4 character handles, and the clearest accounts can claim 1-2 character IDs.

Examples:

- `zen`
- `sky`
- `7`

### 4. Avatar Tiers

Avatar access also follows the identity system:

- **Starter:** Minimalist Characters
- **Active:** Classical Marble Portraits
- **Trusted:** Ethereal Light Forms

The art direction is intentionally subdued so avatars sit inside the product tone instead of fighting it.

## Core User Flow

1. Open `/login`
2. Enter email
3. Verify the code on `/verify`
4. New users finish onboarding on `/basic-info`
5. Open `/conversations` for direct chats
6. Open `/groups` to discover or create rooms
7. Open `/chat` for direct or group messaging
8. Open `/profile`, `/profile/purity`, `/profile/vault`, or `/profile/settings` to manage identity and account state

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, Socket.IO Client |
| Backend | Express 5, TypeScript, Prisma, Express Session, Nodemailer, Socket.IO |
| Database | PostgreSQL |
| Edge Proxy | Cloudflare Pages Functions |
| Deployment | Cloudflare Pages + Koyeb + Neon |

## Architecture

```text
Browser / PWA
  -> /api/* and /socket.io/* on the same origin
Cloudflare Pages Functions
  -> proxy to the Koyeb backend
Express + Socket.IO backend
  -> PostgreSQL via Prisma
```

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL database
- SMTP credentials for verification email delivery

### Backend

```bash
cd Backend
npm install
npm run db:generate
npm run db:push
npm run dev
```

The backend runs on `http://localhost:4000`.

### Frontend

```bash
cd Frontend
npm install
npm run dev
```

Vite defaults to `http://localhost:5173` and will move to the next open port if needed.

## Environment Variables

### Backend (`Backend/.env`)

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma connection string |
| `LOGIN_CODE_SECRET` | Yes | Signs the email verification flow |
| `SESSION_SECRET` | Recommended | Session signing |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password or app password |
| `SMTP_FROM` | Yes | Sender identity |
| `FRONTEND_URL` or `FRONTEND_URLS` | Yes in production | Allowed frontend origins for CORS and cookies |
| `UPLOADTHING_TOKEN` | Optional | Enables image upload |
| `NODE_ENV` | Yes in production | Enables production security behavior |
| `PORT` | Optional | Backend port override |

### Frontend build variables

| Name | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | Yes | API base URL, usually `/api` in production |
| `VITE_SOCKET_URL` | Optional | Socket.IO base URL |

### Cloudflare Pages Functions

| Name | Required | Purpose |
| --- | --- | --- |
| `KOYEB_ORIGIN` | Yes | Upstream backend origin used by `/api/*` and `/socket.io/*` proxies |

## Deployment Notes

- Keep browser traffic same-origin through Cloudflare proxy routes.
- Frontend requests should use `credentials: "include"` for session auth.
- In production, session cookies are expected to run in secure cross-site mode.
- The PWA updates automatically, but some mobile browsers need a close-and-reopen cycle after deploy.

## Current Caveats

- Group state still relies on [`Backend/src/groupStore.ts`](Backend/src/groupStore.ts), so the group layer is not yet modeled as full persistent relational data.
- Image upload is optional and only active when `UPLOADTHING_TOKEN` is configured.

## Project Structure

```text
CleanChat/
  Backend/
    prisma/
      schema.prisma
    src/
      routes/
        auth.ts
        chat.ts
        profile.ts
      socket/
        index.ts
      avatar.ts
      cleanIdClaim.ts
      cleanIdTrust.ts
      groupStore.ts
      session.ts
  Frontend/
    functions/
      api/[[path]].ts
      socket.io/[[path]].ts
    public/
      icons/
    src/
      components/
        BottomNav.tsx
      constants/
        avatarCatalog.ts
      hooks/
      pages/
        login.tsx
        verify.tsx
        basicInfo.tsx
        ConversationPage.tsx
        GroupConversationPage.tsx
        chatPage.tsx
        profile.tsx
        profileEdit.tsx
        profileSettings.tsx
        purityDetail.tsx
        identityVault.tsx
      utils/
        cleanIdTrust.ts
        cleanIdClaim.ts
```

## Docs

- [Docs/README.md](Docs/README.md)
- [Docs/API_README.md](Docs/API_README.md)
- [Docs/NOTIFICATION_UPLOAD_README.md](Docs/NOTIFICATION_UPLOAD_README.md)

## License

MIT. See [`LICENSE`](LICENSE).
