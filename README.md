# CleanChat

CleanChat is a full-stack messaging app focused on simple onboarding and identity-first chat.  
Users sign in with email verification codes, set up a profile (`avatar`, `nickname`, `cleanId`), and continue into conversations and direct chat.

## Highlights

- Passwordless sign-in with email verification code (no password flow).
- New-user onboarding flow to complete profile before entering chat.
- Custom identity system with `cleanId`, nickname, and avatar selection.
- Profile page for editing `cleanId`, nickname, and avatar later.
- Conversation list with latest-message preview and search.
- Express + Prisma backend with session-based authentication.
- Socket.IO chat infrastructure for real-time messaging flow.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, React Router
- Backend: Express 5, TypeScript, Prisma, Nodemailer, Socket.IO
- Database: PostgreSQL (Neon-compatible)

## Project Structure

```text
CleanChat/
  Backend/    # Express + Prisma API
  Frontend/   # React + Vite client
  Docs/
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL database URL
- SMTP account (for email verification codes)

### 1) Backend Setup

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

Initialize Prisma and run API:

```bash
npm run db:generate
npm run db:push
npm run dev
```

Backend runs on `http://localhost:4000`.

### 2) Frontend Setup

```bash
cd Frontend
npm install
npm run dev
```

Frontend runs on Vite (usually `http://localhost:5173` or `http://localhost:5273`).

## Frontend Routes

- `/login` - email input
- `/verify` - verification code input
- `/basic-info` - first-time profile setup
- `/conversations` - conversation list
- `/chat` - message thread
- `/profile` - view/edit profile

## API Overview

Auth:
- `POST /auth/email/start`
- `POST /auth/email/verify`
- `GET /auth/me`
- `POST /auth/logout`

Profile:
- `GET /profile/me`
- `PATCH /profile/me`
- `PATCH /profile/clean-id`

Chat:
- `GET /chat/threads`
- `POST /chat/threads`
- `GET /chat/threads/:threadId/messages`

## License

MIT (see `LICENSE`)
