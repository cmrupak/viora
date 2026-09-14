# Viora PHP API (Phase 3)

Local REST API for the MySQL/MySQLi backend. Supabase remains production until cutover.

## Requirements

- Laragon PHP 8+ with `mysqli`, `openssl`, `json`, `mbstring`
- MySQL DB `viora` with schema from `database/schema.sql`

## Setup

```bash
cp backend/.env.example backend/.env
# Edit DB_* and JWT_SECRET as needed

# Schema (if not already applied)
mysql -u root -e "CREATE DATABASE IF NOT EXISTS viora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root viora < backend/database/schema.sql
```

## Base URL (Laragon)

`http://viora.test/backend/public`

Health: `GET /api/v1/health`

## Auth endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/auth/register` | No |
| POST | `/api/v1/auth/login` | No |
| POST | `/api/v1/auth/refresh` | No (`refresh_token`) |
| POST | `/api/v1/auth/logout` | Optional bearer / `refresh_token` |
| GET | `/api/v1/auth/me` | Bearer access JWT |
| POST | `/api/v1/auth/password/otp` | No (`action`: `send` \| `reset`) |
| POST | `/api/v1/auth/password/otp/send` | No |
| POST | `/api/v1/auth/password/otp/reset` | No |

## Phase 4 social endpoints (summary)

| Area | Examples |
|------|----------|
| Profile | `GET/PATCH /api/v1/profile`, `GET /api/v1/users/{username}`, `GET /api/v1/users/search?q=` |
| Follows | `POST /api/v1/users/{userId}/follow`, followers/following, follow-requests accept/reject |
| Friends | friend-request, accept/reject, list friends, `GET .../relationship` |
| Relationships | mute, restrict, snooze, close-friend, favorite, block |
| Posts | `GET /api/v1/feed`, `POST /api/v1/posts`, get/patch/delete, pin/archive/hide |
| Engagement | `POST .../like`, comments CRUD + comment like |

Authorization ports: `can_view_post`, `feed_hidden_author_ids` (blocks + mutes + snoozes), follow/friend visibility.

## Phase 5 endpoints (summary)

| Area | Examples |
|------|----------|
| Stories | `POST/GET /api/v1/stories`, view/viewers, stickers, highlights |
| Reels | `POST/GET /api/v1/reels`, like/save/view, comments |
| Watch | `GET /api/v1/watch` (video posts feed — Phase 4) |
| Groups | CRUD, join/leave, members, posts + approval, join-questions, broadcast channels |
| Events | CRUD, RSVP, members, invites + respond |

Story auth: `close_friends` audience + `story_hidden_author_ids`. Group auth: visibility + active membership / admin checks.

## Phase 6 endpoints (summary)

| Area | Examples |
|------|----------|
| Messaging | DM/group conversations, messages, reactions, read/prefs, search, presence heartbeat |
| Notifications | prefs, push tokens, list/mark-read, unread-count (message send creates notifs) |
| Discovery | trending hashtags, explore, places, birthdays, memories |

Realtime: REST + polling for now; typing/WS deferred.

## Phase 7 endpoints (summary)

| Area | Examples |
|------|----------|
| Settings | `GET/PATCH /api/v1/settings`, activity, login-events |
| Account | deactivate/reactivate, export requests, deletion requests |
| Workers | `POST /api/v1/account-export`, `POST /api/v1/account-delete` (`confirmationPhrase: "DELETE"`) |
| MFA | enroll / verify / unenroll / factors / AAL under `/api/v1/security/mfa/...` (TOTP, pure PHP) |
| Reports | `POST /api/v1/reports` |

Exports write JSON under `backend/storage/uploads/account-exports/`. Hard delete cascades from `users`.

## Phase 8 — dual-mode `@viora/core`

| Piece | Location |
|-------|----------|
| HTTP client + session store | `packages/social-core/src/http/` |
| PHP façade | `packages/social-core/src/http/php/api.ts` → `createPhpVioraApi` |
| Factory | `createVioraBackend({ backend: 'php', baseUrl })` or existing `createVioraApi(supabase)` |
| Realtime | `api.realtime` (Supabase channels / PHP polling interim) |
| Env (Phase 9 wires defaults) | Web: `VITE_API_BACKEND=php`, `VITE_API_BASE_URL=http://viora.test/backend/public` · Mobile: `EXPO_PUBLIC_API_BACKEND`, `EXPO_PUBLIC_API_BASE_URL` |

Default remains Supabase when backend env is unset.

## Phase 9 — local app env → PHP

Local `.env` (gitignored) on this machine:

| App | Vars |
|-----|------|
| `apps/social-web` | `VITE_API_BACKEND=php`, `VITE_API_BASE_URL=http://viora.test/backend/public` |
| `apps/social` | `EXPO_PUBLIC_API_BACKEND=php`, `EXPO_PUBLIC_API_BASE_URL=http://viora.test/backend/public` |

Restart Vite / Expo after changing env. Physical devices need your LAN IP instead of `viora.test`.

## Phase 10 — local test matrix

Ran against Laragon PHP: **56 PASS**, **8 SKIP** (media/typing/stubs), **0 open FAIL** after event datetime + payload fixes. Details in `docs/PHASE10_MATRIX_RESULTS.json` and `docs/MYSQL_PHP_MIGRATION_PLAN.md` §17.

### Register body

```json
{
  "email": "you@example.com",
  "password": "password123",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "dateOfBirth": "1990-01-01",
  "gender": "female"
}
```

### Login / session response

```json
{
  "user": { "id": "…", "email": "…" },
  "session": {
    "access_token": "…",
    "refresh_token": "…",
    "expires_in": 3600,
    "token_type": "bearer",
    "user": { "id": "…", "email": "…" }
  },
  "profile": { "id": "…", "username": "…", "displayName": "…" }
}
```

Use header: `Authorization: Bearer <access_token>`

### Password OTP

Same contract as the Netlify function:

```json
{ "action": "send", "email": "you@example.com" }
{ "action": "reset", "email": "you@example.com", "otp": "123456", "password": "newpassword" }
```

Without SMTP in local env, codes are appended to `backend/storage/logs/otp.log`.

## Layout

```
backend/
├── public/index.php      # front controller
├── bootstrap.php
├── config/               # app, database, jwt, mail
├── controllers/
├── services/             # AuthService, JwtService, MailService
├── repositories/         # MySQLi prepared statements only
├── middleware/           # CORS, JWT auth
├── routes/api.php
├── helpers/
├── database/schema.sql
└── storage/logs/
```

## Notes

- Passwords: `password_hash` / `password_verify` (PASSWORD_DEFAULT)
- Refresh tokens: hashed (SHA-256) in `auth_sessions`
- Access tokens: HS256 JWT (no Composer dependency)
- No production deploy / Netlify / Supabase changes in this phase
