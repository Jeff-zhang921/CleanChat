# CleanChat Notifications and Photo Upload Deep Dive

This document explains in detail:

1. How in-app notifications were implemented and why they work.
2. How photo upload in chat was implemented using UploadThing token on backend.
3. Exact setup/deployment steps and troubleshooting.

## 1. Feature Goals

### Notifications

- Show notification when a new message arrives.
- Work from conversations page and chat page.
- Support mobile/PWA behavior as much as browser platform allows.

### Photo Upload

- Let users choose a photo from chat input bar.
- Upload securely without exposing UploadThing secret in frontend.
- Send uploaded photo in chat thread and render it as image bubble.
- Allow tap-to-preview larger and save/open image.

## 2. Architecture Overview

### Notification Flow (Current)

1. Frontend asks browser permission (`Notification.requestPermission`).
2. User opens socket connection with session cookie.
3. Backend socket attaches each connection to personal room `user:{id}`.
4. On `message:send`, backend emits:
   - `message:new` to thread room (`thread:{threadId}`), and
   - `inbox:new` to both user rooms (`user:{AID}`, `user:{BID}`).
5. Conversations page listens to `inbox:new`, updates list preview, and calls notification utility.
6. Notification utility prefers service worker `registration.showNotification(...)`; falls back to `new Notification(...)`.

### Photo Upload Flow (Current)

1. User taps `Photo` in chat input.
2. Frontend opens hidden file input and reads selected image file.
3. Frontend sends `multipart/form-data` to backend `POST /chat/upload-image`.
4. Backend validates auth, type, and size; uploads to UploadThing using server-side token.
5. Backend returns permanent file URL.
6. Frontend emits socket message with body format:
   - `IMG::<uploaded_url>`
7. Existing message pipeline stores it in `ChatMessage.body`.
8. Frontend detects `IMG::` prefix and renders `<img>` bubble.
9. User can tap image to open full-screen preview and click `Save / Open`.

## 3. Backend Implementation Details

### 3.1 Notification Routing in Socket Server

File: `Backend/src/socket/index.ts`

- On connection:
  - Auth is checked from session middleware.
  - Connection joins `user:{sessionUser.id}`.
- On `message:send`:
  - Validate thread ID and membership.
  - Save message in Prisma `ChatMessage`.
  - Update `lastMessageAt` in `ChatThread`.
  - Emit:
    - `message:new` -> `thread:{threadId}`
    - `inbox:new` -> `user:{AID}` and `user:{BID}`

Why this matters:

- Thread room only works if a client already joined that thread.
- User room guarantees receiver still gets event for conversation list refresh + notification.

### 3.2 Upload Endpoint

File: `Backend/src/routes/chat.ts`

Route:

- `POST /chat/upload-image`

Behavior:

1. Validates session auth (`401` if not logged in).
2. Validates `UPLOADTHING_TOKEN` exists on backend env (`500` if missing).
3. Parses file with `multer.memoryStorage()`.
4. Restricts size to 8 MB.
5. Restricts file type to `image/*`.
6. Converts buffer to `Uint8Array`.
7. Creates `UTFile` and uploads via `UTApi.uploadFiles`.
8. Returns:
   - `{ url, key }` on success
   - descriptive errors on failure.

Packages used:

- `uploadthing`
- `multer`
- `@types/multer`

## 4. Frontend Implementation Details

### 4.1 Notification Utility

File: `Frontend/src/utils/notifications.ts`

Key functions:

- `getNotificationPermission()`
- `requestNotificationPermission()`
- `showMessageNotification(title, body, tag)`

Logic:

1. If permission is not granted -> return false.
2. Try to get service worker registration.
3. If registration exists, use `registration.showNotification(...)`.
4. Otherwise fallback to `new Notification(...)`.

Reason:

- Service worker display path is more stable across mobile/PWA contexts.

### 4.2 Conversations Page Notification Trigger

File: `Frontend/src/pages/ConversationPage.tsx`

What was added:

1. Notification enable button with status text.
2. Socket connection to listen `inbox:new`.
3. On incoming message:
   - Update local thread preview/time.
   - Fallback refresh threads if thread not in cache.
   - Trigger browser notification (with image-aware text like `sent a photo`).

### 4.3 Chat Page Upload + Image Preview

File: `Frontend/src/pages/chatPage.tsx`

What was added:

1. Hidden file input (`accept="image/*"`).
2. `Photo` button in input bar.
3. Upload handler sends form-data to `/chat/upload-image`.
4. On success emits socket message with `IMG::<url>`.
5. Message render path:
   - if body starts with `IMG::` -> render image bubble.
6. Image viewer modal:
   - tap image to open larger preview.
   - `Save / Open` action.
   - close by button, outside click, or `Esc`.

Style changes are in:

- `Frontend/src/pages/chatPage.css`

## 5. Environment Variables

### Required for Upload Feature

Set only on backend runtime environments:

- Local `Backend/.env`
- Koyeb backend env

Variable:

```env
UPLOADTHING_TOKEN=eyJ...
```

Important:

- Use UploadThing SDK token (usually starts with `eyJ...`) for this integration.
- Do not place secret/token in frontend.
- Cloudflare frontend project does not need this variable for current architecture.

## 6. Why No Prisma Schema Change for Images

Current implementation stores image as special text message (`IMG::<url>`) in existing `ChatMessage.body`.

Pros:

- No migration required.
- Faster rollout.
- Works with current message pipeline and socket payload.

Tradeoff:

- Message type is encoded in string prefix.
- A stricter long-term schema can add:
  - `messageType` enum (`TEXT`, `IMAGE`)
  - `imageUrl` nullable string

## 7. Deployment Steps (Exact)

1. Backend:
   - Add/update `UPLOADTHING_TOKEN` in Koyeb env.
   - Deploy backend.
2. Frontend:
   - Deploy frontend (Cloudflare Pages) after code changes.
3. Verify in app:
   - Open a chat thread.
   - Tap `Photo`, choose image, send.
   - Receiver sees image bubble + conversation preview updates.
4. Verify notifications:
   - Open `/conversations`.
   - Click `Enable Notifications`.
   - Send message from another account/device.
   - Confirm system notification appears.

## 8. Troubleshooting

### A. Upload returns `UPLOADTHING_TOKEN is not configured`

- Backend env missing token. Add in Koyeb/local backend and redeploy/restart.

### B. Upload fails with `Failed to upload image to UploadThing`

- Token type may be wrong.
- Verify token is valid and active in UploadThing dashboard.

### C. Backend crashes on startup

- Check port conflict (`EADDRINUSE`) and stop old node process.
- Then restart backend.

### D. Notification says blocked/unsupported on mobile

- iOS requires PWA context in many cases.
- Install to home screen and open from app icon.
- Re-check OS/browser notification settings.

### E. New message not triggering conversation notification

- Ensure backend with `inbox:new` emit is deployed.
- Ensure frontend is listening to `inbox:new`.

## 9. Security Notes

1. Rotate exposed UploadThing secrets/tokens immediately if leaked.
2. Keep all upload credentials server-side only.
3. Keep `credentials: "include"` on auth-protected requests.
4. Keep HTTPS in production for cookies + notifications.
