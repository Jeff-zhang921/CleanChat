# CleanChat 部署问题记录（Cloudflare 反向代理）

## 1. 背景

当前部署架构：

- 前端：Cloudflare Pages（`https://cleanchat.pages.dev`）
- 后端：Koyeb（Frankfurt）
- 数据库：Neon（Singapore）

前端需要携带登录会话（cookie）访问后端 API 和 Socket.IO。

## 2. 出现的问题

线上环境曾出现以下典型问题：

1. 浏览器 CORS 报错（跨域请求被拦截）。
2. 手机端会话不稳定，登录后跳回登录页。
3. Cloudflare Functions 返回 `Missing KOYEB_ORIGIN env var`。

## 3. 根因

1. 前端曾直接请求 `http://localhost:4000` 或跨域后端地址，导致生产环境跨域。
2. 前后端域名不同，浏览器对跨站 cookie 更严格（尤其移动端）。
3. Cloudflare Pages Functions 未配置 `KOYEB_ORIGIN` 时，代理不知道要转发到哪。

## 4. 解决方案（已采用）

使用 Cloudflare Pages Functions 做同域反向代理：

- `/api/*` -> Koyeb 后端 HTTP API
- `/socket.io/*` -> Koyeb 后端 Socket.IO

这样浏览器看起来是同域请求，减少 CORS 与跨站 cookie 问题。

## 5. 代码改动

关键文件：

- `Frontend/functions/api/[[path]].ts`
- `Frontend/functions/socket.io/[[path]].ts`
- `Frontend/src/config.ts`

关键点：

1. 生产环境 API 使用 `/api`（`VITE_API_URL=/api`）。
2. 生产环境 Socket 默认走当前站点域名。
3. Functions 优先使用 `KOYEB_ORIGIN`，未配置时回退到默认 Koyeb 地址。

## 6. Cloudflare Pages 环境变量

建议在 Cloudflare Pages 的 `Production` 与 `Preview` 都配置：

```env
KOYEB_ORIGIN=https://clinical-ursulina-cleanchan-eb6e1ee6.koyeb.app
VITE_API_URL=/api
```

可选：

```env
VITE_SOCKET_URL=https://cleanchat.pages.dev
```

注意：`VITE_*` 是构建时变量，修改后必须重新部署。

## 7. 验证清单

1. 打开站点并登录，不再出现 CORS 报错。
2. 请求地址应为同域 `/api/...`，不是 `localhost`。
3. 移动端登录后访问 `/profile` 不应被重定向回 `/login`。
4. 会话接口（如 `/auth/me`、`/profile/me`）返回已登录用户。

## 8. 常见排查

1. 报 `Missing KOYEB_ORIGIN env var`：检查 Cloudflare 环境变量是否在当前环境生效并已重新部署。
2. 仍请求 `localhost`：检查 `VITE_API_URL` 是否为 `/api`，并确认前端是最新构建。
3. Socket 不连通：检查 `/socket.io/*` function 是否部署成功，Koyeb 服务是否健康。

## 9. 如何把 Session 变长

当前后端会话时长配置在：

- `Backend/src/session.ts`

关键配置：

- `const SESSION_TTL_MS = 24 * 60 * 60 * 1000;` 表示 24 小时。
- `cookie.maxAge = SESSION_TTL_MS` 决定浏览器 cookie 过期时间。

如果你想改成更长，例如 7 天：

```ts
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
```

改完后需要：

1. 重新部署后端（Koyeb）。
2. 用户重新登录一次，拿到新 cookie 过期时间。

线上稳定登录还要确保：

1. `sameSite: "none"`（跨域前后端场景）。
2. `secure: true`（HTTPS）。
3. `app.set("trust proxy", 1)` 已启用（Koyeb/Cloudflare 场景）。

本项目当前已经在生产模式下自动使用上述配置。

## 10. Further Reading

- Notification + photo upload implementation details:
  [NOTIFICATION_UPLOAD_README.md](NOTIFICATION_UPLOAD_README.md)
- Backend API details:
  [API_README.md](API_README.md)
- Release notes / changelog:
  [CHANGELOG_README.md](CHANGELOG_README.md)
