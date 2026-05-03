# CleanChat

<p align="left">
  <img src="Frontend/public/icons/icon-192.png" alt="CleanChat App Icon" width="72" height="72" />
</p>

### Frontend Stack

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React Router](https://img.shields.io/badge/React_Router-7.9-CA4245?style=flat-square&logo=reactrouter&logoColor=white)](https://reactrouter.com/)
[![PWA](https://img.shields.io/badge/PWA-Inject_Manifest-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](https://vite-pwa-org.netlify.app/)

### Backend and Runtime

[![Express](https://img.shields.io/badge/Express-5.1-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![JWT](https://img.shields.io/badge/JWT-Single_Token-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-Edge-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

### Testing and Quality

[![Playwright](https://img.shields.io/badge/Playwright-Visual_Audit-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![ESLint](https://img.shields.io/badge/ESLint-9.39-4B32C3?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org/)

Warning: Virtual list performance issue (pending fix) - white-screen and misalignment during fast scrolling are still under investigation.

---

## Table of Contents

- [1. Deep Technical Audit](#1-deep-technical-audit)
  - [1.1 Session Stability and JWT Lifecycle](#11-session-stability-and-jwt-lifecycle)
  - [1.2 Notification Wake Chain](#12-notification-wake-chain)
  - [1.3 Zero-Remount Rendering Diagnosis](#13-zero-remount-rendering-diagnosis)
- [2. Architecture + Anatomy (Unified)](#2-architecture--anatomy-unified)
- [3. Hybrid View Stack Memory Management](#3-hybrid-view-stack-memory-management)
- [4. PWA Push Wake Flow](#4-pwa-push-wake-flow)
- [5. Performance Benchmarks](#5-performance-benchmarks)
- [6. Project Structure](#6-project-structure)
- [7. Getting Started](#7-getting-started)
- [8. Environment Variables](#8-environment-variables)
- [9. Test and Audit Commands](#9-test-and-audit-commands)
- [10. Deployment and Reverse Proxy Notes](#10-deployment-and-reverse-proxy-notes)
- [11. East Asia i18n Mesh](#11-east-asia-i18n-mesh)
- [License](#license)

---

## 1. Deep Technical Audit

### 1.1 Session Stability and JWT Lifecycle

#### Root Cause Analysis

The main risk pattern is a single long-lived JWT stored in localStorage. It creates three categories of issues:

1. Security risk: a leaked token has a large abuse window.
2. Stability risk: when the token expires, Socket and API can fail at the same time, causing forced re-login cascades.
3. UX risk: after process kill or cold restart, session restoration is fragile if it only depends on volatile runtime state.

#### Applied Fixes

1. Returned to a single-token architecture: Bearer JWT only, with no Refresh Token or cookie rotation flow.
2. Unified frontend auth behavior: both fetch and axios inject the same Authorization header.
3. Login page startup restore now checks local token plus /auth/me only; on 401/403 it clears token and returns to login.
4. Socket authentication uses local JWT only; if Not authenticated is returned, session is treated as expired immediately.
5. Backend refresh-session model and routes were removed; production now requires only JWT_SECRET.

#### Why This Is Stable in Production

- The auth path is short and deterministic, which reduces failure surface and simplifies incident debugging.
- Session expiry behavior is consistent across API and Socket, avoiding partial-online drift states.
- Reverse proxy still keeps /api/_ and /socket.io/_ same-origin from the browser perspective.

```mermaid
sequenceDiagram
  participant App as Frontend App
  participant API as /api/auth/* Proxy
  participant Auth as Backend Auth

  App->>API: /auth/me (Bearer JWT)
  API->>Auth: Forward request
  alt token valid
    Auth-->>App: 200 authenticated
  else token invalid/expired
    Auth-->>App: 401 unauthorized
    App->>App: clear local token
    App->>API: /auth/email/start (re-login)
  end
```

#### Implementation Files

- Backend/src/auth.ts
- Backend/src/routes/auth.ts
- Backend/index.ts
- Frontend/src/utils/auth.ts
- Frontend/src/utils/apiClient.ts
- Frontend/src/pages/login.tsx
- Frontend/src/pages/ConversationPage.tsx
- Frontend/src/pages/chatPage.tsx

---

### 1.2 Notification Wake Chain

#### Core Mechanism

The key to Web Push is not the page thread, but the browser push service and service worker process.

Even when the browser UI is closed:

1. Push service can still deliver payloads to the browser background channel.
2. Browser wakes the service worker and dispatches the push event.
3. Service worker calls showNotification and hands it to the OS notification center.
4. On notification click, service worker routes users via clients.openWindow or navigate.

#### Hardening Improvements

1. Backend VAPID delivery chain is implemented: sendPushToUser is triggered for offline recipients.
2. Right after login verification, frontend requests permission, subscribes, and binds subscription to backend.
3. Profile page supports subscription rebinding to recover from device or browser changes.
4. Notification click handler supports accurate deep-links for both direct and group chat paths.

```mermaid
sequenceDiagram
  participant Sender as Sender Client
  participant Socket as Backend Socket Layer
  participant Push as Backend Web Push
  participant SW as Service Worker
  participant OS as OS Notification Center
  participant App as Chat Route

  Sender->>Socket: message:send
  Socket->>Push: offline recipient detected
  Push-->>SW: push payload (VAPID)
  SW->>OS: showNotification(title, body, data.url)
  OS-->>SW: notificationclick
  SW->>App: focus/navigate /chat/:id or /chat/group/:groupId
```

#### Implementation Files

- Backend/src/push.ts
- Backend/src/socket/index.ts
- Backend/src/routes/profile.ts
- Frontend/src/utils/notifications.ts
- Frontend/src/sw.js
- Frontend/public/sw.js
- Frontend/src/pages/verify.tsx
- Frontend/src/pages/profile.tsx
- Frontend/src/pages/chatPage.tsx

---

### 1.3 Zero-Remount Rendering Diagnosis

#### Goal

Get physically instant list visibility on return, instead of remounting and rehydrating first.

#### Mechanism

1. Immortal root views stay mounted.
2. Ephemeral detail views mount on demand and are fully destroyed on close.
3. When detail opens, root enters dormancy only (aria-hidden + pointer-events: none) and is not unmounted.
4. State updates continue during dormancy, so return path does not need second hydration.

#### Result

- Return latency feels near 0ms.
- List scroll position remains stable.
- Interaction context is not reset by route transitions.
- Through timestamp grouping (Time Grouping), redundant DOM nodes are reduced to improve long-list scrolling performance.
- 通过时间戳分组（Time Grouping）减少 DOM 节点冗余，提升长列表滚动性能。

---

## 2. Architecture + Anatomy (Unified)

```mermaid
flowchart TB
  subgraph Frontend[src/]
    A[App.tsx\nHybrid Orchestrator]

    subgraph Immortal[Immortal Root Views]
      B1[pages/ConversationPage.tsx]
      B2[pages/GroupConversationPage.tsx]
      B3[pages/profile.tsx]
      B4[pages/profileSettings.tsx]
    end

    subgraph Ephemeral[Ephemeral Detail Views]
      C1[pages/chatPage.tsx]
      C2[pages/profileEdit.tsx]
      C3[pages/feedback.tsx]
    end

    S1[utils/unreadCounts.ts]
    S2[utils/notifications.ts]
    S3[utils/auth.ts]
    SW[src/sw.js + public/sw.js]

    A --> Immortal
    A --> Ephemeral
    Immortal --> S1
    Ephemeral --> S1
    Immortal --> S2
    Ephemeral --> S2
    A --> S3
    S2 --> SW
  end

  subgraph Backend[Backend/src/]
    R1[routes/auth.ts]
    R2[routes/profile.ts]
    R3[socket/index.ts]
    P1[push.ts]
    AU[auth.ts]
  end

  subgraph DB[PostgreSQL via Prisma]
    D1[User]
    D2[PushSubscription]
  end

  S3 --> R1
  S2 --> R2
  S2 --> R3
  R1 --> AU
  R2 --> D2
  R3 --> P1
  P1 --> D2
  R1 --> D1
```

### Directory and Responsibility Map

| Layer                    | Directory/File                               | Responsibility                                |
| ------------------------ | -------------------------------------------- | --------------------------------------------- |
| View orchestration layer | Frontend/src/App.tsx                         | Root/detail lifecycle and route orchestration |
| Root view layer          | Frontend/src/pages/ConversationPage.tsx etc. | Always-on views that preserve context         |
| Detail view layer        | Frontend/src/pages/chatPage.tsx etc.         | Disposable detail surfaces                    |
| Session layer            | Frontend/src/utils/auth.ts, apiClient.ts     | Bearer JWT injection and expiry handling      |
| Push layer               | Backend/src/push.ts + Frontend/src/sw.js     | Offline notifications and deep-link wake      |
| Auth layer               | Backend/src/auth.ts, routes/auth.ts          | JWT issuing and verification                  |
| Data layer               | prisma/schema.prisma                         | User and PushSubscription models              |

---

## 3. Hybrid View Stack Memory Management

1. Always-mounted view pool
   - conversation/group/profile/settings initialize once and remain alive.
2. Detail view lifecycle
   - chat/profile-edit/feedback/request detail views mount on entry and unmount on exit.
3. Dormant mode
   - root keeps DOM and state but blocks interaction hit targets to prevent hidden-state clicks.
4. Observer and subscription cleanup
   - on detail exit, socket listeners, observers, and timers are released.
5. Cost and benefit
   - Cost: higher baseline memory due to always-mounted roots.
   - Benefit: no return-path rebuild, no skeleton flash, predictable scroll persistence.

---

## 4. PWA Push Wake Flow

1. After login verification completes, permission + subscription are requested.
2. Subscription payload (endpoint + keys) is written to backend via /profile/push/subscription.
3. On message send, backend checks if recipient is offline and sends Web Push.
4. After push service delivery, service worker push event calls showNotification.
5. On click, service worker parses payload and routes to:
   - Direct chat: /chat/:threadId
   - Group chat: /chat/group/:groupId
6. If an app window exists, focus + navigate first; otherwise open a new window.

---

## 5. Performance Benchmarks

| Metric                           | Target              | Current Strategy                            | Verification Path                                      |
| -------------------------------- | ------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Route return latency             | 0ms perceived       | Root stays mounted + disposable detail      | Frontend/tests/hybrid-view-stack.spec.ts               |
| Viewport edge-fit rate           | 100% edge-to-edge   | Profile shell sizing and animation de-scale | Frontend/tests/profile-native-shell.spec.ts            |
| Message visibility in background | Always updated      | Silent reorder while dormant                | Frontend/src/pages/ConversationPage.tsx                |
| Offline notification reach       | System-level wake   | VAPID + SW push + click deep-link           | Backend/src/push.ts, Frontend/src/sw.js                |
| Session restore stability        | Consistent behavior | Single-token validation + explicit re-login | Backend/src/routes/auth.ts, Frontend/src/utils/auth.ts |

---

## 6. Project Structure

```text
Backend/
  index.ts
  prisma/
    schema.prisma
  src/
    auth.ts
    push.ts
    routes/
      auth.ts
      profile.ts
      chat.ts
    socket/
      index.ts

Frontend/
  functions/
    api/[[path]].ts
    socket.io/[[path]].ts
  src/
    App.tsx
    sw.js
    utils/
      auth.ts
      apiClient.ts
      notifications.ts
    pages/
      ConversationPage.tsx
      GroupConversationPage.tsx
      profile.tsx
      profileSettings.tsx
      chatPage.tsx
      profileEdit.tsx
      feedback.tsx
  public/
    sw.js
  tests/
    hybrid-view-stack.spec.ts
    profile-native-shell.spec.ts
```

---

## 7. Getting Started

### Backend

```bash
cd Backend
npm install
npm run db:generate
npm run db:push
npm run dev
```

### Frontend

```bash
cd Frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5273
```

---

## 8. Environment Variables

| Variable              | Scope                | Example                                      | Purpose                          |
| --------------------- | -------------------- | -------------------------------------------- | -------------------------------- |
| DATABASE_URL          | Backend              | postgresql://user:pass@host:5432/db          | Prisma connection                |
| JWT_SECRET            | Backend              | replace_with_strong_secret                   | JWT signing secret               |
| ACCESS_TOKEN_TTL      | Backend              | 1y                                           | JWT expiration policy            |
| LOGIN_CODE_SECRET     | Backend              | replace_with_strong_secret                   | Login-code hashing secret        |
| SMTP_USER             | Backend              | mailer@example.com                           | SMTP username                    |
| SMTP_PASS             | Backend              | app_password                                 | SMTP password                    |
| SMTP_FROM             | Backend              | CleanChat <no-reply@example.com>             | Outbound sender identity         |
| FRONTEND_URLS         | Backend              | http://127.0.0.1:5273,https://your.pages.dev | CORS allowlist                   |
| VAPID_PUBLIC_KEY      | Backend              | base64url_public_key                         | Web Push public key              |
| VAPID_PRIVATE_KEY     | Backend              | base64url_private_key                        | Web Push private key             |
| VAPID_SUBJECT         | Backend              | mailto:no-reply@example.com                  | VAPID subject                    |
| KOYEB_ORIGIN          | Cloudflare Functions | https://your-service.koyeb.app               | Upstream for /api and /socket.io |
| VITE_API_URL          | Frontend             | /api                                         | API base URL                     |
| VITE_SOCKET_URL       | Frontend             | /                                            | Socket base URL                  |
| VITE_VAPID_PUBLIC_KEY | Frontend (optional)  | base64url_public_key                         | Optional client VAPID key        |

Push validation after environment setup:

1. Ensure backend `.env` (or Koyeb environment variables) has both `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
2. Never expose `VAPID_PRIVATE_KEY` to frontend or git history.
3. Check backend diagnostics endpoint after deploy:

- `GET /ops/push-config` should return `ok: true`

4. If VAPID keys are rotated, clients must rebuild subscriptions once (the in-app notification enable action now forces resubscribe).

---

## 9. Test and Audit Commands

```bash
cd Frontend
npx playwright test tests/hybrid-view-stack.spec.ts --config=playwright.conversations.config.ts
npx playwright test tests/profile-native-shell.spec.ts --config=playwright.conversations.config.ts
npx playwright test --config=playwright.conversations.config.ts
```

---

## 10. Deployment and Reverse Proxy Notes

1. In production, same-origin proxying is recommended:
   - /api/\* -> Backend
   - /socket.io/\* -> Backend
2. This keeps browser-side networking same-origin:
   - Authorization header and Socket path behavior stay predictable
   - Cross-origin policy complexity is reduced
3. Backend uses conditional trust proxy configuration for accurate source detection behind reverse proxies.

---

## 11. East Asia i18n Mesh

### Supported Locales

| Code  | Label    | Tone Goal                        |
| ----- | -------- | -------------------------------- |
| zh-TW | 繁體中文 | 極簡、冷靜、留白感               |
| zh    | 简体中文 | 極簡、冷靜、留白感               |
| en    | English  | Minimal, calm, low-noise surface |
| ko    | 한국어   | 절제된 문장, 조용한 리듬         |
| ja    | 日本語   | 余白を残した静かな語感           |

### Canonical Lexicon (Cross-Locale)

- Read the quiet ledger
  - zh-TW: 閱覽靜謐賬本
  - zh: 查阅宁静账本
  - ko: 고요한 장부를 읽다
  - ja: 静かな帳簿を読む
- Identity
  - zh-TW: 身份憑證
  - zh: 身份凭证
  - ko: 신원
  - ja: 身元

### Global Toggle Chain

1. Login page (`Frontend/src/pages/login.tsx`): top-right compact language strip (繁 / 簡 / EN / 한 / 日).
2. Settings page (`Frontend/src/pages/profileSettings.tsx`): full language picker with the same locale set.
3. Core i18n runtime (`Frontend/src/i18n.ts`): shared locale normalization and switch options for both entry points.

### Persistence Contract

The language state is synchronized to both keys:

- `i18nextLng`
- `cleanchat:language`

Initialization precedence:

1. `i18nextLng`
2. `cleanchat:language`
3. default `zh`

This prevents login-stage language drift when entering post-login surfaces.

### Locale Resource Files

- `Frontend/src/locales/zh.json`
- `Frontend/src/locales/zh-TW.json`
- `Frontend/src/locales/en.json`
- `Frontend/src/locales/ko.json`
- `Frontend/src/locales/ja.json`

---

## License

MIT. See [LICENSE](LICENSE).
