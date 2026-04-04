# CleanChat

## 1. Hero Section

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-Visual%20Audit-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-Edge-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

> **A zero-compromise 0ms interaction model for a calm communication surface on the web.**

---

## 2. Design Philosophy

> The CleanChat frontend does not optimize for spectacle. It optimizes for stability, restraint, and continuity.

### Red Line 1: Calm & Restrained

- No anxiety-driven red-dot spam. Unread state uses breathing micro-glow indicators and compact capsules.
- No abrupt page jumps. Transitions use fluid layout motion with controlled rhythm.
- No interface noise. Information density belongs to conversations, not decorative UI churn.

### Red Line 2: Space-Time Tradeoff

- Keep critical root views resident in memory rather than accepting blank flashes, skeleton rebuilds, or perceptible jitter on return.
- Trade predictable memory footprint for deterministic interaction latency.

### Red Line 3: Absolute Seamlessness

- Model core navigation as native-style physical layering: persistent base layer, overlay detail layer, and on-demand teardown.
- Every back action prioritizes continuity over route-switch visual discontinuity.

---

## 3. Hardcore Architecture

### Hybrid View Stack

CleanChat uses **Immortal Root Views + Ephemeral Detail Views**:

- **Immortal Root Views**: Conversation and profile domains stay mounted as app-level roots and are excluded from regular route teardown.
- **Ephemeral Detail Views**: Chat detail and profile sub-detail views mount on demand, slide out, and unmount completely.
- **CSS Physical Overlay**: The detail layer is rendered on a dedicated higher z-index plane; the base layer enters dormant mode with `pointer-events: none` and `aria-hidden`.
- **0ms Return Path**: Returning from detail unmounts only the top layer, preserving list scroll position and render cache without base-layer rebuild.

```text
Hybrid Stack Topology

Detail Layer (Ephemeral)
  - /chat
  - /profile/edit
  - /profile/purity
  - /profile/vault

Base Layer (Immortal)
  - /conversations
  - /groups
  - /profile
  - /profile/settings
```

### Overscan Virtualization

To sustain high-velocity scroll scenarios, list rendering uses an aggressive pre-render buffer strategy:

- Raise `increaseViewportBy` and `overscan` in `react-virtuoso` to expand front and rear viewport buffers.
- Use stable, traceable keys for conversation and message items to avoid node mismatch under extreme scroll speed.
- Combine with controlled motion and layout stabilization to preserve readability and continuity near the **5000px/s target velocity** without white flashes.

### Memory Leak Prevention

Under dormant-background and high-frequency enter/exit conditions, CleanChat enforces strict resource lifecycle rules:

- On chat detail unmount, `ResizeObserver`, `IntersectionObserver`, `MutationObserver`, and scroll listeners are explicitly detached.
- Socket lifecycle is decoupled from transient detail views, preventing stale listeners after exit.
- Base-layer dormancy reduces non-essential animation and layout disturbance to suppress background reflow pulses.

---

## 4. Key Features

| Feature                          | Technical Strategy                                                                 | Result                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| FLIP-based fluid message pinning | Layout animation + stable keys + deterministic reorder control                     | New messages pin to top with no hard jump                     |
| Hybrid view stack instant return | Persistent root views + overlay detail mount/unmount                               | Returning from chat preserves 0ms perceived continuity        |
| Android 13+ push chain           | Custom Service Worker + `notificationclick` route wake-up                          | Notification taps deep-link directly into target thread       |
| Native-style immersive scrolling | Content-first containers + dynamic top-space release + mobile viewport constraints | List scrolling feels physically closer to native apps         |
| Dormant background updates       | Base layer sleeps while still receiving realtime events                            | Preview text and unread state remain fresh when covered       |
| Playwright visual audit          | Key-path screenshot validation + 20-round-trip stability spec                      | Interaction and memory behavior are reproducible and testable |

---

## 5. Getting Started

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL

### 1) Run Backend

```bash
cd Backend
npm install
npm run db:generate
npm run db:push
npm run dev
```

Backend default: `http://localhost:4000`

### 2) Run Frontend (fixed local port)

```bash
cd Frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5273
```

Frontend local URL: **http://127.0.0.1:5273**

### 3) Playwright Visual Audit

```bash
cd Frontend
npx playwright test tests/conversations-fluid-prepend.spec.ts --config=playwright.conversations.config.ts
npx playwright test tests/hybrid-view-stack.spec.ts --config=playwright.conversations.config.ts
```

### 4) Production Build Check

```bash
cd Frontend
npm run build
```

---

**License**

MIT. See [LICENSE](LICENSE).
