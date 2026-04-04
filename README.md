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
[![JWT](https://img.shields.io/badge/JWT-Access_Refresh-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-Edge-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

### Testing and Quality

[![Playwright](https://img.shields.io/badge/Playwright-Visual_Audit-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![ESLint](https://img.shields.io/badge/ESLint-9.39-4B32C3?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org/)

⚠️ Warning: Virtual List Performance Issue (Pending Fix) - 快速滑动下的白屏/错位问题尚在攻坚中。

---

## 目录

- [1. 深度技术诊断 (Deep Technical Audit)](#1-深度技术诊断-deep-technical-audit)
  - [1.1 Session 稳定性与 JWT 续期](#11-session-稳定性与-jwt-续期)
  - [1.2 Notification 系统级唤醒链路](#12-notification-系统级唤醒链路)
  - [1.3 Zero-Remount Rendering 诊断](#13-zero-remount-rendering-诊断)
- [2. Architecture + Anatomy (Unified)](#2-architecture--anatomy-unified)
- [3. Hybrid View Stack 内存管理逻辑](#3-hybrid-view-stack-内存管理逻辑)
- [4. PWA Push Wake 流程详解](#4-pwa-push-wake-流程详解)
- [5. Performance Benchmarks](#5-performance-benchmarks)
- [6. Project Structure](#6-project-structure)
- [7. Getting Started](#7-getting-started)
- [8. Environment Variables](#8-environment-variables)
- [9. Test and Audit Commands](#9-test-and-audit-commands)
- [10. Deployment and Reverse Proxy Notes](#10-deployment-and-reverse-proxy-notes)
- [License](#license)

---

## 1. 深度技术诊断 (Deep Technical Audit)

### 1.1 Session 稳定性与 JWT 续期

#### 底层问题诊断

当前典型风险是「单一长期 JWT + localStorage」。这会引发三类问题：

1. 安全面：长期 Access Token 泄露窗口过大。
2. 稳定面：Token 过期后 Socket 与 API 可能同时失效，触发连锁重登。
3. 体验面：App 进程被杀后，若仅依赖内存态凭证，恢复链路脆弱。

#### 修复方案（已落地）

1. Access Token 改为短期（默认 15m），仅用于业务 API 与 Socket 鉴权。
2. Refresh Token 改为高熵随机串，保存于 HttpOnly Cookie，前端 JS 不可读。
3. 后端新增 RefreshSession 持久化表：保存 tokenHash、过期时间、设备元信息、撤销状态。
4. 刷新接口采用轮换（rotation）：每次 refresh 都废弃旧 session 并签发新 refresh。
5. 前端 fetch 与 axios 拦截器统一接入 401/403 自动 refresh + 原请求重放。
6. Socket connect_error 命中 Not authenticated 时触发强制 refresh 并 reconnect。

#### 为什么这能形成“永久登录感”

- App 被杀后：Refresh Cookie 仍在（受浏览器持久存储与过期策略保护）。
- 新启动时：即使本地 Access Token 失效，也能通过 refresh 无感换新并恢复会话。
- 反向代理将浏览器侧请求统一为同源路径 /api/*，Cookie 发送策略更稳定，避免跨域 SameSite 抖动。

```mermaid
sequenceDiagram
  participant App as Frontend App
  participant API as /api/auth/* Proxy
  participant Auth as Backend Auth
  participant DB as RefreshSession Table

  App->>API: /auth/me (Bearer access)
  API->>Auth: Forward request
  Auth-->>API: 401 Token expired
  App->>API: /auth/refresh (Cookie: cleanchat_rt)
  API->>Auth: Forward refresh
  Auth->>DB: validate tokenHash, not revoked, not expired
  Auth->>DB: revoke old session + create new session
  Auth-->>API: new access token + Set-Cookie(new refresh)
  App->>API: retry original request with new access
  API->>Auth: /auth/me
  Auth-->>App: 200 authenticated
```

#### 对应实现文件

- Backend/src/auth.ts
- Backend/src/routes/auth.ts
- Backend/prisma/schema.prisma
- Backend/index.ts
- Frontend/src/utils/auth.ts
- Frontend/src/utils/apiClient.ts
- Frontend/src/pages/login.tsx
- Frontend/src/pages/ConversationPage.tsx
- Frontend/src/pages/chatPage.tsx

---

### 1.2 Notification 系统级唤醒链路

#### 底层逻辑

Web Push 的关键不是页面线程，而是 Browser Push Service + Service Worker 进程。

即使浏览器 UI 关闭：

1. 推送服务仍可将消息投递给浏览器后台通道。
2. 浏览器唤起 Service Worker 执行 push 事件。
3. SW 调用 showNotification 交给操作系统通知中心。
4. 用户点击通知后，SW 通过 clients.openWindow / navigate 定向拉起 chat 路由。

#### 修复与强化点

1. 后端 VAPID 发送链路完成：离线用户触发 sendPushToUser。
2. 登录成功后立即执行权限申请 + push subscription + 后端绑定。
3. Profile 页面支持重新绑定订阅，避免换设备或换浏览器后静默失效。
4. SW 点击回调支持 /chat/:threadId 与 /chat/group/:groupId 精准路由。

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

#### 对应实现文件

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

### 1.3 Zero-Remount Rendering 诊断

#### 目标

返回列表时达到“物理层即时可见”，而不是“重挂载后再恢复”。

#### 机制

1. 不死根视图（Immortal Root Views）常驻挂载。
2. 即抛详情页（Ephemeral Detail Views）按需挂载并在关闭时彻底销毁。
3. 详情页打开时，根层仅进入 dormancy（aria-hidden + pointer-events: none），不 unmount。
4. 状态更新在 dormant 期间继续推进，返回时无需二次 hydration。

#### 结果

- 返回响应接近 0ms 体感。
- 列表滚动位置可保持。
- 交互上下文不会因路由切换被重置。

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
      C3[pages/purityDetail.tsx]
      C4[pages/identityVault.tsx]
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
    D2[RefreshSession]
    D3[PushSubscription]
  end

  S3 --> R1
  S2 --> R2
  S2 --> R3
  R1 --> AU
  R1 --> D2
  R2 --> D3
  R3 --> P1
  P1 --> D3
  R1 --> D1
```

### 目录与职责映射

| 层级 | 目录/文件 | 职责 |
| --- | --- | --- |
| 视图编排层 | Frontend/src/App.tsx | Root/Detail 生命周期与路由编排 |
| 根视图层 | Frontend/src/pages/ConversationPage.tsx 等 | 常驻视图，保持上下文 |
| 详情视图层 | Frontend/src/pages/chatPage.tsx 等 | 即抛详情，退出即释放 |
| 会话层 | Frontend/src/utils/auth.ts, apiClient.ts | Access/Refresh 自动续期 |
| 推送层 | Backend/src/push.ts + Frontend/src/sw.js | 离线通知与深链唤醒 |
| 鉴权层 | Backend/src/auth.ts, routes/auth.ts | JWT 签发、刷新、撤销 |
| 数据层 | prisma/schema.prisma | User/RefreshSession/PushSubscription |

---

## 3. Hybrid View Stack 内存管理逻辑

1. 常驻视图池
   - conversation/group/profile/settings 仅初始化一次，后续不销毁。
2. 详情页对象生命周期
   - chat/profile-edit/purity/vault 进入时 mount，退出时 unmount。
3. Dormant 模式
   - 根层保留 DOM 与状态，但停止交互命中，避免“隐藏态误触”。
4. 观测器与订阅清理
   - 详情页离开时清理 socket listener、observer、临时 timer。
5. 代价与收益
   - 代价：常驻内存增加。
   - 收益：返回路径无重建、无骨架闪烁、滚动位置可预测。

---

## 4. PWA Push Wake 流程详解

1. 登录链路完成后（verify 页面）触发 permission + subscribe。
2. 订阅对象（endpoint + keys）写入 Backend /profile/push/subscription。
3. 消息发送时，后端判断 recipient 离线，调用 Web Push 发送。
4. Push Service 投递后，SW push 事件执行 showNotification。
5. 用户点击通知，SW notificationclick 解析 payload，跳转：
   - 直聊：/chat/:threadId
   - 群聊：/chat/group/:groupId
6. 若已有窗口，优先 focus + navigate；否则 openWindow 新开。

---

## 5. Performance Benchmarks

| 指标 | 目标 | 当前策略 | 验证路径 |
| --- | --- | --- | --- |
| 路由返回感知延迟 | 0ms 体感 | Root 常驻 + Detail 即抛 | Frontend/tests/hybrid-view-stack.spec.ts |
| 视口贴合率 | 100% 贴边无缝 | profile 壳层尺寸与动画去 scale | Frontend/tests/profile-native-shell.spec.ts |
| 消息到达可见性 | 后台即更新 | dormant 状态下 silent reorder | Frontend/src/pages/ConversationPage.tsx |
| 离线通知可达率 | 系统级唤醒 | VAPID + SW push + click deep link | Backend/src/push.ts, Frontend/src/sw.js |
| 会话恢复稳定性 | 无感续期 | Access 短期 + Refresh 轮换 | Backend/src/routes/auth.ts, Frontend/src/utils/auth.ts |

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
      purityDetail.tsx
      identityVault.tsx
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

| 变量 | 作用域 | 示例 | 用途 |
| --- | --- | --- | --- |
| DATABASE_URL | Backend | postgresql://user:pass@host:5432/db | Prisma 连接 |
| JWT_SECRET | Backend | replace_with_strong_secret | Access Token 签名 |
| REFRESH_TOKEN_SECRET | Backend | replace_with_strong_secret | Refresh Token 哈希签名 |
| ACCESS_TOKEN_TTL | Backend | 15m | Access Token 过期策略 |
| REFRESH_TOKEN_TTL_DAYS | Backend | 30 | Refresh Session 生命周期 |
| AUTH_COOKIE_SAMESITE | Backend | lax | Refresh Cookie SameSite |
| AUTH_COOKIE_DOMAIN | Backend | .yourdomain.com | 可选 Cookie 域 |
| LOGIN_CODE_SECRET | Backend | replace_with_strong_secret | 验证码哈希 |
| SMTP_USER | Backend | mailer@example.com | SMTP 用户名 |
| SMTP_PASS | Backend | app_password | SMTP 密码 |
| SMTP_FROM | Backend | CleanChat <no-reply@example.com> | 邮件发件人 |
| FRONTEND_URLS | Backend | http://127.0.0.1:5273,https://your.pages.dev | CORS 白名单 |
| VAPID_PUBLIC_KEY | Backend | base64url_public_key | Web Push 公钥 |
| VAPID_PRIVATE_KEY | Backend | base64url_private_key | Web Push 私钥 |
| VAPID_SUBJECT | Backend | mailto:no-reply@example.com | VAPID Subject |
| KOYEB_ORIGIN | Cloudflare Functions | https://your-service.koyeb.app | /api 与 /socket.io 上游 |
| VITE_API_URL | Frontend | /api | API 基地址 |
| VITE_SOCKET_URL | Frontend | / | Socket 基地址 |
| VITE_VAPID_PUBLIC_KEY | Frontend (optional) | base64url_public_key | 前端直配 VAPID 公钥 |

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

1. 前端生产环境推荐使用同源代理：
   - /api/* -> Backend
   - /socket.io/* -> Backend
2. 这样浏览器视角保持同源：
   - Refresh Cookie 传输稳定
   - 降低跨域策略复杂度
3. Backend 已启用 trust proxy 条件配置，兼容反代后的真实来源判定。

---

## License

MIT. See [LICENSE](LICENSE).
