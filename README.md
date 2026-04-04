# CleanChat



<p align="left">
  <img src="Frontend/public/icons/icon-192.png" alt="CleanChat App Icon" width="72" height="72" />
</p>




### Frontend Stack

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React Router](https://img.shields.io/badge/React_Router-7.9-CA4245?style=flat-square&logo=reactrouter&logoColor=white)](https://reactrouter.com/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-12.38-0055FF?style=flat-square&logo=framer&logoColor=white)](https://www.framer.com/motion/)
[![React Virtuoso](https://img.shields.io/badge/React_Virtuoso-4.18-0B1020?style=flat-square&logoColor=white)](https://virtuoso.dev/)

### Backend and Runtime

[![Express](https://img.shields.io/badge/Express-5.1-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-Edge-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

### Testing and Quality

[![Playwright](https://img.shields.io/badge/Playwright-Visual_Audit-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![ESLint](https://img.shields.io/badge/ESLint-9.39-4B32C3?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org/)
[![PWA](https://img.shields.io/badge/PWA-Inject_Manifest-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](https://vite-pwa-org.netlify.app/)

> **CleanChat is built to remove perceived latency, suppress UI anxiety, and keep every major navigation path physically continuous.**

---

## Table of Contents

- [1. Jumbo Hero Section and Shield Matrix](#1-jumbo-hero-section-and-shield-matrix)
- [2. Design Philosophy](#2-design-philosophy)
- [3. The Core Architecture](#3-the-core-architecture)
  - [3.1 Hybrid View Stack](#31-hybrid-view-stack)
  - [3.2 Silent State Reactivity](#32-silent-state-reactivity)
  - [3.3 Memory Layout and Leak Defense](#33-memory-layout-and-leak-defense)
- [4. Performance Benchmarks](#4-performance-benchmarks)
- [5. Project Anatomy](#5-project-anatomy)
- [6. Getting Started](#6-getting-started)
- [7. Playwright Visual Audit](#7-playwright-visual-audit)
- [8. Roadmap and Manifesto](#8-roadmap-and-manifesto)
- [License](#license)

---

## 2. Design Philosophy

> The objective is not visual noise. The objective is composure under load.

### Red Line A: Calm and Restrained

Traditional chat products optimize for attention extraction: bright red counters, urgency loops, and abrupt transitions. That pattern increases cognitive fatigue.

CleanChat inverts that model.

- Unread state is rendered as breathing micro-glow and slim capsule indicators instead of red urgency badges.
- Entry and return transitions are flow-based, not jump-based.
- Decorative motion is deprioritized in favor of semantic motion: only transitions that explain spatial context survive.

### Red Line B: Space-Time Tradeoff

Conventional route-driven architectures often reclaim memory aggressively and then repay it with blank screens, list skeleton flashes, and scroll-position loss.

CleanChat chooses the opposite trade.

- Keep critical root surfaces mounted.
- Spend predictable resident memory.
- Buy deterministic return latency and position continuity.

This is a deliberate systems-level decision: memory budget is cheaper than broken continuity.

### Red Line C: Absolute Seamlessness

Most web stacks treat navigation as document replacement. Native apps treat it as layer choreography.

CleanChat follows native choreography.

- Base layer remains alive.
- Detail layer overlays physically.
- Back action removes only the overlay layer.

The result is immediate return with preserved context, not a rehydrated approximation.

<details>
<summary>Click to expand: pain profile in conventional web routing</summary>

```text
Common web routing pain profile

1) Route changes unmount list view
2) Message list and scroll container destroyed
3) Return navigation remounts list view
4) Async data + skeleton flash + scroll reset
5) User perceives latency and instability
```

</details>

---

## 3. The Core Architecture

> Architecture is judged by what it does under stress, not under demo conditions.

### 3.1 Hybrid View Stack

CleanChat splits navigation into two lifecycle classes:

- **Immortal Layer**: root-level conversation, group, and profile surfaces.
- **Ephemeral Layer**: chat detail and profile detail surfaces.

This separation eliminates route-driven teardown from critical return paths.

#### Lifecycle model

| Layer Type             | Mount Policy                 | Unmount Policy                         | Interaction State                                         |
| ---------------------- | ---------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Immortal Root Views    | Mounted once per app session | Never unmounted during core navigation | Active or dormant (`pointer-events: none`, `aria-hidden`) |
| Ephemeral Detail Views | Mounted on demand            | Fully unmounted on close               | Exclusive interaction ownership                           |

```mermaid
flowchart TB
  A[Hybrid App Shell] --> B[Immortal Base Layer]
  A --> C[Ephemeral Detail Layer]

  B --> B1[/conversations]
  B --> B2[/groups]
  B --> B3[/profile]
  B --> B4[/profile/settings]

  C --> C1[/chat]
  C --> C2[/profile/edit]
  C --> C3[/profile/purity]
  C --> C4[/profile/vault]

  C -.active.-> D[Base enters dormant mode\naria-hidden=true\npointer-events=none]
```

<details>
<summary>Click to expand: code-level orchestration pattern</summary>

```tsx
// Conceptual orchestrator shape
const hasDetailOverlay = detailView !== null;

<div className="hybrid-root-stack">
  <section aria-hidden={!isConversationInteractive}>
    <ConversationsPage isDormant={!isConversationInteractive} />
  </section>

  {hasDetailOverlay && (
    <div className="hybrid-detail-layer">
      <ChatPage onRequestClose={closeOverlay} />
    </div>
  )}
</div>;
```

</details>

### 3.2 Silent State Reactivity

When the detail layer is active, the base list is dormant visually but not dead logically. Realtime state still moves.

Current production paths use local refs plus persisted unread utilities. The architecture contract remains **Zustand-compatible** and can be wired as a global state pool without changing view-layer semantics.

#### Zustand-oriented state contract (architecture interface)

<details>
<summary>Click to expand: Zustand slice blueprint for background inbox updates</summary>

```ts
import { create } from "zustand";

type InboxItem = {
  id: string;
  sortAt: string;
  unreadCount: number;
  preview: string;
};

type InboxStore = {
  items: InboxItem[];
  applyRealtimeMessage: (payload: {
    id: string;
    createdAt: string;
    preview: string;
    incrementUnread: boolean;
  }) => void;
};

export const useInboxStore = create<InboxStore>((set) => ({
  items: [],
  applyRealtimeMessage: ({ id, createdAt, preview, incrementUnread }) =>
    set((state) => {
      const next = state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              sortAt: createdAt,
              preview,
              unreadCount: incrementUnread
                ? item.unreadCount + 1
                : item.unreadCount,
            }
          : item,
      );

      next.sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt));
      return { items: next };
    }),
}));
```

</details>

The key property is **silent reorder**: state updates happen while the base surface is dormant, so reopening detail reveals already-updated list ordering with no additional hydration path.

```mermaid
sequenceDiagram
  participant WS as WebSocket
  participant SP as State Pool (Zustand-compatible)
  participant BL as Base List View
  participant DL as Detail View

  WS->>SP: inbox:new / group:message:new
  SP->>SP: update unread + preview + sort key
  Note over BL: BL can be dormant\naria-hidden=true, pointer-events=none
  SP-->>BL: reactive data change (no remount)
  DL->>DL: user presses back
  DL-->>DL: overlay unmount
  BL->>BL: instantly visible with updated ordering
```

### 3.3 Memory Layout and Leak Defense

Performance stability is enforced across both render and lifecycle dimensions.

#### Overscan policy

- Aggressively raise viewport buffers (`increaseViewportBy`, `overscan`) to avoid fast-scroll white gaps.
- Keep key identity deterministic for list items to prevent virtualization mismatch under high velocity.

#### Leak prevention policy

- Unmounting detail views detaches `ResizeObserver`, `IntersectionObserver`, `MutationObserver`, and scroll listeners.
- Socket subscriptions are scoped and cleaned at view teardown.
- Dormant base mode suppresses unnecessary interaction and background layout disturbance.

<details>
<summary>Click to expand: leak-prevention checklist used in code review</summary>

```text
[x] No observer survives detail unmount
[x] No stale socket callback survives room exit
[x] No hidden-layer click path remains active
[x] Back navigation never triggers list remount
```

</details>

---

## 4. Performance Benchmarks

> These are engineering guardrails, not marketing numbers.

| Metric                                    | Stress Profile                                | Target                              | Validation Path                                         |
| ----------------------------------------- | --------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| Detail -> list return latency (perceived) | 20 consecutive chat round-trips               | 0ms perceived switch                | `tests/hybrid-view-stack.spec.ts`                       |
| Chat overlay teardown residue             | 20 consecutive chat exits                     | 0 residual chat shells              | `document.querySelectorAll('.chat-shell').length === 0` |
| List scroll continuity                    | repeated open/close at varying scroll offsets | <= 2px drift                        | Playwright round-trip assertion                         |
| High-speed list readability               | aggressive overscan + rapid swipe profile     | no white flash events               | virtualization + visual audit                           |
| Background state freshness                | detail active while messages arrive           | unread/preview must update silently | realtime inbox event assertions                         |
| Build integrity                           | CI production bundle + SW inject manifest     | deterministic build pass            | `npm run build`                                         |

---

## 5. Project Anatomy

### Frontend architecture tree

```text
Frontend/
  src/
    App.tsx                     # hybrid-view-stack orchestrator (immortal vs ephemeral routing)
    pages/
      ConversationPage.tsx      # immortal conversation surface with fluid reorder
      GroupConversationPage.tsx # immortal group surface
      profile.tsx               # immortal profile surface
      profileSettings.tsx       # immortal settings surface
      chatPage.tsx              # ephemeral chat detail surface
      profileEdit.tsx           # ephemeral profile edit surface
      purityDetail.tsx          # ephemeral purity detail surface
      identityVault.tsx         # ephemeral identity vault surface
    utils/
      unreadCounts.ts           # persistent unread state utility (store contract anchor)
      notifications.ts          # notification payload + deep-link targeting logic
    hooks/
      useViewportOverscan.ts    # overscan and viewport pressure tuning
    components/
      BottomNav.tsx             # root navigation shell
  tests/
    conversations-fluid-prepend.spec.ts  # visual reorder and unread polish audit
    hybrid-view-stack.spec.ts            # lifecycle, layering, and continuity audit
```

### Architectural lenses

| Lens         | Concrete Paths                                          | Responsibility                                             |
| ------------ | ------------------------------------------------------- | ---------------------------------------------------------- |
| `view-stack` | `src/App.tsx`, `src/pages/*`                            | Layer ownership, route choreography, dormancy control      |
| `store`      | `src/utils/unreadCounts.ts`, realtime handlers in pages | Silent state persistence and deterministic list projection |
| `ephemeral`  | `src/pages/chatPage.tsx`, profile detail pages          | On-demand mount, strict cleanup, zero-residue teardown     |

---

## 6. Getting Started

### Environment Requirements

- Node.js 20+
- npm
- PostgreSQL
- SMTP credentials for verification code delivery

### Backend Setup

```bash
cd Backend
npm install
npm run db:generate
npm run db:push
npm run dev
```

Backend default endpoint: `http://localhost:4000`

### Frontend Setup

```bash
cd Frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5273
```

Frontend local endpoint: **http://127.0.0.1:5273**

### `.env.example` reference

| Variable            | Scope                | Example                                        | Purpose                                                 |
| ------------------- | -------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`      | Backend              | `postgresql://user:pass@host:5432/db`          | Prisma database connection                              |
| `LOGIN_CODE_SECRET` | Backend              | `replace_with_strong_secret`                   | Verification-code token signing                         |
| `JWT_SECRET`        | Backend              | `replace_with_strong_secret`                   | JWT signing and validation                              |
| `SMTP_USER`         | Backend              | `mailer@example.com`                           | SMTP auth username                                      |
| `SMTP_PASS`         | Backend              | `app_password`                                 | SMTP auth password                                      |
| `SMTP_FROM`         | Backend              | `CleanChat <no-reply@example.com>`             | Outbound email sender                                   |
| `FRONTEND_URLS`     | Backend              | `http://127.0.0.1:5273,https://your.pages.dev` | Allowed origins for CORS and socket handshake           |
| `UPLOADTHING_TOKEN` | Backend              | `ut_token_here`                                | Optional image upload channel                           |
| `VITE_API_URL`      | Frontend             | `/api`                                         | Browser API base URL                                    |
| `VITE_SOCKET_URL`   | Frontend             | `/` or `https://your.pages.dev`                | Socket.IO connection base                               |
| `KOYEB_ORIGIN`      | Cloudflare Functions | `https://your-koyeb-service.koyeb.app`         | Upstream backend origin for `/api/*` and `/socket.io/*` |

<details>
<summary>Click to expand: minimal environment bootstrap order</summary>

```text
1) Configure Backend .env
2) Start PostgreSQL
3) Run prisma generate + db push
4) Start backend dev server
5) Configure Frontend env (if needed)
6) Start frontend on 127.0.0.1:5273
```

</details>

---

## 7. Playwright Visual Audit

> Functional correctness is required. Perceptual quality is also required.

CleanChat test strategy treats visual continuity, layering safety, and lifecycle hygiene as first-class regression criteria.

### Run fluid prepend and unread polish audit

```bash
cd Frontend
npx playwright test tests/conversations-fluid-prepend.spec.ts --config=playwright.conversations.config.ts
```

### Run high-frequency lifecycle and layering audit

```bash
cd Frontend
npx playwright test tests/hybrid-view-stack.spec.ts --config=playwright.conversations.config.ts
```

### Run the full visual suite

```bash
cd Frontend
npx playwright test --config=playwright.conversations.config.ts
```

<details>
<summary>Click to expand: what the hybrid view stack test asserts</summary>

```text
- Detail layer is mounted and visually opaque
- Base layer is dormant (aria-hidden=true, pointer-events=none)
- Back action unmounts detail layer fully
- Scroll position remains stable across repeated round-trips
- DOM and memory proxies remain inside guardrail bounds
```

</details>

---

## 8. Roadmap and Manifesto

### Roadmap

- [ ] Dedicated Zustand production store with slice-level performance telemetry
- [ ] WebGL-assisted bubble rendering for high-density message timelines
- [ ] End-to-end encryption channel for direct threads
- [ ] Delivery-quality analytics for push wake-up and deep-link completion
- [ ] Frame-budget CI gate with trace-based performance thresholds
- [ ] Predictive prefetch for conversation detail hydration on intent signals

### Manifesto

> We do not ship interfaces that merely look modern.
>
> We ship systems that remain calm under pressure, maintain continuity under stress, and preserve user context as a hard guarantee.
>
> CleanChat is a commitment to architectural discipline: fewer remounts, fewer surprises, fewer excuses.

---

## License

MIT. See [LICENSE](LICENSE).
