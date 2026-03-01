# CleanChat Changelog

## v1.1.0 (2026-03-01)

### Summary

v1.1 focuses on production stability (Cloudflare + Koyeb + Neon), mobile usability, and core chat experience upgrades:

- Same-origin API/socket proxy through Cloudflare Functions
- Better session/cookie behavior for cross-device login
- Notification reliability improvements on Android/iOS
- Profile/account management completed (including delete account)
- Chat image sending and display flow stabilized
- Conversation and chat UI layout fixes for mobile

---

### New Features

1. Cloudflare reverse proxy paths
- Added `/api/*` and `/socket.io/*` forwarding to backend origin.
- Frontend production API defaults to same-origin `/api`.
- Reduced CORS/cookie issues on mobile browsers.

2. Profile management upgrades
- Users can edit nickname, CleanID, and avatar.
- Added `Delete Account` in profile page (two-step confirmation).
- Deleting account now removes related messages/threads/user data and clears session.

3. Avatar set expanded
- Added 5 more avatars (total 10 options).
- Frontend and backend avatar mapping aligned.

4. Chat image support
- Added image upload endpoint and message image rendering.
- Supports preview/open/save flow in chat UI.

5. Conversation search
- Search users globally by CleanID.
- Start/open chat directly from search result.

---

### Reliability / Bug Fixes

1. Notification behavior
- Added permission state sync when page regains focus/visibility.
- Improved notification fallback logic:
  - Try Service Worker notification first
  - Fallback to `new Notification(...)` if SW path fails
- Added debug logs for notification failures.

2. Chat UI overflow fixes
- Fixed long English/number messages overflowing chat bubbles.
- Added safer wrapping and width constraints for message content.
- Fixed mobile input bar overlap issues (`Photo` / `Send` button visibility).

3. Conversation page layout fixes
- Removed problematic negative margins causing overlap/cut issues.
- Fixed notification button being covered.
- Fixed list divider/line cutting visual issue.

4. Verification/SEO/deployment support
- Added Google site verification file support via `Frontend/public`.
- Improved `index.html` metadata (`title`, `description`, OpenGraph/Twitter tags, canonical).
- Added intro content on login page to improve crawlable content.

---

### Backend/API Changes (v1.1)

1. `PATCH /profile/me`
- Improved validation and error reporting for avatar updates.
- Returns clearer `error/details` for enum mismatch situations.

2. `DELETE /profile/me`
- New endpoint for account deletion.
- Transaction deletes:
  - user-sent messages
  - messages in related threads
  - related threads
  - login code records
  - user record
- Destroys session and clears cookie.

3. `POST /chat/upload-image`
- Improved upload error handling.
- Better file-size and request validation responses.

---

### Frontend Behavior Changes (v1.1)

1. Login/verify flow
- Cleaner status handling and better backend error display.

2. Profile/basic info pages
- Improved server error message display (`error`, `message`, `details`, raw response fallback).

3. Conversation page
- Current user name placement and layout refinements.
- Better search/result readability and stable spacing.

---

### Deployment / Ops Notes

1. Required Cloudflare vars
```env
KOYEB_ORIGIN=https://<your-koyeb-service>.koyeb.app
VITE_API_URL=/api
```

2. Required backend vars (Koyeb)
```env
DATABASE_URL=...
LOGIN_CODE_SECRET=...
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
FRONTEND_URL=https://cleanchat.pages.dev
NODE_ENV=production
```

3. Avatar enum sync (important)
- If new avatars fail to save on production profile page, production DB enum is likely outdated.
- Run:
```bash
npx prisma db push --skip-generate
npx prisma generate
```
- Then redeploy backend.

---

### Known Limitations

1. Browser notification permission cannot be auto-granted by code.
- User must approve notification permission once per browser context.

2. Current notification model is online/session-based.
- For true background/offline push, Web Push (VAPID + subscription storage + push send flow) is still needed.

---

### Upgrade Checklist (to v1.1)

1. Deploy backend with updated routes and env vars.
2. Run Prisma schema sync for production DB.
3. Deploy frontend with latest PWA and layout fixes.
4. If mobile still shows old UI, clear site data / reinstall PWA.
5. Verify:
- Login + verify flow
- Profile edit + avatar update
- Image upload + image render
- Conversation search by CleanID
- Notification prompt + display behavior

