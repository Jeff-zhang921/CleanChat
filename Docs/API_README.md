# CleanChat Backend API

## Base URL

- Local backend: `http://localhost:4000`
- Production backend (Koyeb): `https://clinical-ursulina-cleanchan-eb6e1ee6.koyeb.app`
- Production via Cloudflare proxy (recommended from frontend): `https://cleanchat.pages.dev/api`

All authenticated endpoints require session cookie (`credentials: "include"`).

## Auth APIs

### POST `/auth/email/start`

Send verification code to email.

Response status:

- `202 Accepted` (email dispatch queued)

Request body:

```json
{
  "email": "user@example.com"
}
```

Success response:

```json
{
  "message": "Verification code is being sent"
}
```

### POST `/auth/email/verify`

Verify email code and create/login user session.

Request body:

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

Success response:

```json
{
  "message": "Login code verified",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "user",
    "avatar": "AVATAR_LEO",
    "cleanId": "u_ab12cd34ef56"
  },
  "isNewUser": true
}
```

### GET `/auth/me`

Get current session user.

Success response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "user",
    "cleanId": "u_ab12cd34ef56",
    "provider": "email"
  }
}
```

### POST `/auth/logout`

Destroy current session.

Success response:

```json
{
  "message": "Logged out successfully"
}
```

## Profile APIs

### GET `/profile/me`

Get full profile for current user.

Success response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "Jeff",
    "cleanId": "jeff_01",
    "avatar": "AVATAR_SOPHIE"
  }
}
```

### PATCH `/profile/me`

Update nickname and/or avatar.

Request body (at least one field):

```json
{
  "name": "Jeff",
  "avatar": "AVATAR_MAX"
}
```

Success response:

```json
{
  "message": "Profile updated.",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "Jeff",
    "cleanId": "jeff_01",
    "avatar": "AVATAR_MAX"
  }
}
```

### PATCH `/profile/clean-id`

Update `cleanId` (must match `^[a-z0-9_]{3,20}$`).

Request body:

```json
{
  "cleanId": "new_clean_id"
}
```

Success response:

```json
{
  "message": "cleanId updated.",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "Jeff",
    "cleanId": "new_clean_id",
    "avatar": "AVATAR_MAX"
  }
}
```

### GET `/profile/me/overview`

Get lightweight session user from server session.

Success response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "Jeff",
    "cleanId": "new_clean_id",
    "provider": "email"
  }
}
```

## Chat APIs

### GET `/chat/groups`

Get all group summaries for current user.

Success response:

```json
{
  "groups": [
    {
      "id": "frontend-lab",
      "name": "Frontend Lab",
      "description": "UI ideas, React tricks, and CSS polishing.",
      "avatarUrl": "https://api.dicebear.com/9.x/shapes/svg?seed=FrontendLab",
      "creatorId": null,
      "createdAt": "2026-03-06T00:00:00.000Z",
      "joined": true,
      "isOwner": false,
      "memberCount": 4,
      "lastMessagePreview": "No messages yet.",
      "lastMessageAt": null
    }
  ]
}
```

### POST `/chat/groups`

Create a new group and auto-join as creator.

Request body:

```json
{
  "name": "Project Phoenix",
  "description": "Sprint planning and updates"
}
```

Rules:

- `name`: 2-48 characters
- `description`: max 180 characters (optional)

Success response:

```json
{
  "group": {
    "id": "project-phoenix",
    "name": "Project Phoenix",
    "description": "Sprint planning and updates",
    "avatarUrl": "https://api.dicebear.com/9.x/shapes/svg?seed=project-phoenix",
    "creatorId": 7,
    "createdAt": "2026-03-06T09:10:00.000Z",
    "joined": true,
    "isOwner": true,
    "memberCount": 1,
    "lastMessagePreview": "No messages yet.",
    "lastMessageAt": null
  }
}
```

### POST `/chat/groups/:groupId/join`

Join one group.

Success response:

```json
{
  "group": {
    "id": "frontend-lab",
    "name": "Frontend Lab",
    "description": "UI ideas, React tricks, and CSS polishing.",
    "avatarUrl": "https://api.dicebear.com/9.x/shapes/svg?seed=FrontendLab",
    "creatorId": null,
    "createdAt": "2026-03-06T00:00:00.000Z",
    "joined": true,
    "isOwner": false,
    "memberCount": 5,
    "lastMessagePreview": "No messages yet.",
    "lastMessageAt": null
  }
}
```

### POST `/chat/groups/:groupId/leave`

Leave one group.

Success response:

```json
{
  "group": {
    "id": "frontend-lab",
    "name": "Frontend Lab",
    "description": "UI ideas, React tricks, and CSS polishing.",
    "avatarUrl": "https://api.dicebear.com/9.x/shapes/svg?seed=FrontendLab",
    "creatorId": null,
    "createdAt": "2026-03-06T00:00:00.000Z",
    "joined": false,
    "isOwner": false,
    "memberCount": 4,
    "lastMessagePreview": "No messages yet.",
    "lastMessageAt": null
  },
  "alreadyLeft": false
}
```

### DELETE `/chat/groups/:groupId`

Delete one group.

Permissions:

- Only creator can delete the group.

Success response:

```json
{
  "message": "Group deleted."
}
```

### GET `/chat/groups/:groupId/messages`

Get group message history (ascending by time). User must be a member.

Success response:

```json
{
  "messages": [
    {
      "id": 101,
      "groupId": "project-phoenix",
      "senderId": 7,
      "senderName": "Jeff",
      "body": "Welcome to the group",
      "createdAt": "2026-03-06T09:12:00.000Z"
    }
  ]
}
```

### GET `/chat/users/search?cleanId=<query>`

Search users by `cleanId` (case-insensitive, partial match, excludes self).

Example:

`/chat/users/search?cleanId=jeff`

Success response:

```json
{
  "users": [
    {
      "id": 2,
      "name": "Alice",
      "email": "alice@example.com",
      "cleanId": "jeff_alice",
      "avatar": "AVATAR_BELLA"
    }
  ]
}
```

### POST `/chat/threads`

Create 1-to-1 thread with another user.

Request body supports one of:

- `BId`
- `targetUserId`
- `userId`
- `hostId`

Example:

```json
{
  "targetUserId": 2
}
```

Success response (new):

```json
{
  "thread": {
    "id": 10,
    "AID": 1,
    "BID": 2,
    "createdAt": "2026-02-28T10:00:00.000Z",
    "updatedAt": "2026-02-28T10:00:00.000Z",
    "lastMessageAt": null
  },
  "alreadyExists": false
}
```

Success response (already exists):

```json
{
  "thread": {
    "id": 10,
    "AID": 1,
    "BID": 2,
    "createdAt": "2026-02-28T10:00:00.000Z",
    "updatedAt": "2026-02-28T10:00:00.000Z",
    "lastMessageAt": "2026-02-28T10:05:00.000Z"
  },
  "alreadyExists": true
}
```

### GET `/chat/threads`

Get all threads for current user, including opposite user info and latest message preview.

Success response:

```json
[
  {
    "id": 10,
    "AID": 1,
    "BID": 2,
    "UserA": { "id": 1, "name": "Jeff", "email": "jeff@example.com", "cleanId": "jeff_01", "avatar": "AVATAR_MAX" },
    "UserB": { "id": 2, "name": "Alice", "email": "alice@example.com", "cleanId": "alice_01", "avatar": "AVATAR_BELLA" },
    "Messages": [
      {
        "id": 55,
        "body": "hello",
        "createdAt": "2026-02-28T10:05:00.000Z",
        "senderId": 1
      }
    ],
    "lastMessageAt": "2026-02-28T10:05:00.000Z",
    "updatedAt": "2026-02-28T10:05:00.000Z"
  }
]
```

### GET `/chat/threads/:threadId/messages`

Get message history of one thread (ascending by time).

Success response:

```json
[
  {
    "id": 54,
    "threadId": 10,
    "senderId": 2,
    "body": "hi",
    "createdAt": "2026-02-28T10:04:00.000Z"
  },
  {
    "id": 55,
    "threadId": 10,
    "senderId": 1,
    "body": "hello",
    "createdAt": "2026-02-28T10:05:00.000Z"
  }
]
```

### POST `/chat/upload-image`

Upload one image file to UploadThing for chat messages.

Backend env requirement:

- `UPLOADTHING_TOKEN=<your_secret_token>`

Request:

- Content-Type: `multipart/form-data`
- Field name: `image`
- Max size: 15 MB

Success response:

```json
{
  "url": "https://utfs.io/f/...",
  "key": "fileKey"
}
```

Message format note:

- To send an uploaded image in socket message body, frontend uses:
  `IMG::<uploaded_url>`
- UI renders that body as an image bubble.

## Socket.IO Events

Socket endpoint:

- Local: `http://localhost:4000`
- Production (proxy): `https://cleanchat.pages.dev` (path `/socket.io`)

Client -> Server:

- `thread:join` (payload: `threadId` or `{ threadId }`)
- `Thread:join` (legacy alias)
- `message:send` (payload: `{ threadId, content }` or `{ threadId, body }`)
- `group:join` (payload: `groupId` or `{ groupId }`)
- `group:message:send` (payload: `{ groupId, content }` or `{ groupId, body }`)

Server -> Client:

- `message:new` (new message broadcast in thread room)
- `group:message:new` (new message broadcast to current group members)
- `chat:error`
- `message:error`
- `thread:error`
- `Thread:error`

## Common Error Responses

- `401` unauthorized / not authenticated
- `403` forbidden (thread not owned by user)
- `404` not found (user/thread missing)
- `400` bad request (invalid input, invalid group ID)
- `409` conflict (`cleanId` already taken)
- `429` too many attempts or active code exists
- `500` internal server error
