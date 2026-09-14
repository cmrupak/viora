# Viora — MySQL + PHP Migration Plan (Phase 1)

> **Status:** Phase 1 complete (documentation only)  
> **Date:** 2026-09-14  
> **Scope:** Plan & impact — **no** production changes, **no** commits/pushes/deploys unless explicitly requested later.  
> **Database access (locked):** PHP **MySQLi only** (no PDO, no ORM).  
> **Product rule:** Same UI/UX/routes/features; backend implementation changes only.

Related docs: `VIORA_FULL_PROJECT.md`, `VIORA_PROJECT_FLOW.md`, this folder’s later `PHP_MYSQL_ARCHITECTURE.md` / `API_REFERENCE.md` (Phases 2+).

---

## 1. Decisions locked for subsequent phases

| Topic | Decision |
|-------|----------|
| Primary keys | Keep **UUID** (`CHAR(36)`) for continuity with current client IDs |
| DB driver | **MySQLi** exclusively |
| Local host | Laragon (PHP + MySQL) first |
| Realtime | Abstract in `@viora/core` first; implement WebSocket when ready; polling allowed as interim behind same API |
| Dual backend | Support `supabase` \| `php` via config until cutover verified |
| Production | No prod Supabase/MySQL/Netlify mutation until explicit approval |

---

## 2. Current architecture

```
Web (apps/social-web) ─┐
Mobile (apps/social)  ─┼─→ AuthProvider → getVioraSupabase(anon key)
                       ▼
                @viora/core (services)
                       │
         ┌─────────────┼──────────────┐
         ▼             ▼              ▼
   Supabase Auth   Postgres+RLS    Storage (7 buckets)
                   Realtime*
                   
Netlify Functions (service_role + SMTP):
  password-otp · account-export · account-delete
```

\*Realtime today: DM `postgres_changes` + typing **broadcast**. Presence = `user_presence` table + heartbeat.

**Live:** https://vioradev.netlify.app · Supabase ref `cozqexdsqxarznnrojdv`

---

## 3. Target architecture

```
Web (unchanged UI) ─┐
Mobile (unchanged)─┤
                   ▼
            @viora/core (same method names)
                   │
                   ▼
            PHP REST API (/api/v1/...)
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
   MySQL        File storage   SMTP
  (MySQLi)      (disk/CDN)     (OTP)
      │
      └─ optional WebSocket service
         (message insert + typing)
```

Frontend env (Phase 9 — local):

- Web: `VITE_API_BACKEND=php` + `VITE_API_BASE_URL=http://viora.test/backend/public`
- Mobile: `EXPO_PUBLIC_API_BACKEND=php` + `EXPO_PUBLIC_API_BASE_URL=…`
- Flip back: set backend to `supabase` (or remove php lines) and restart the app

Keep existing `VITE_SUPABASE_*` / `EXPO_PUBLIC_SUPABASE_*` until PHP path is verified.

---

## 4. Supabase dependency inventory

### 4.1 Client / core

| Area | Location |
|------|----------|
| Supabase JS client | `packages/social-core/src/supabase.ts` |
| All domain services | `packages/social-core/src/*.service.ts` |
| API façade | `packages/social-core/src/api.ts` → `createVioraApi` |
| Package dep | `@supabase/supabase-js` in `packages/social-core/package.json` |

### 4.2 Auth session

| Surface | Storage |
|---------|---------|
| Web AuthProvider | Default Supabase browser storage (`localStorage`) |
| Mobile AuthProvider | `AsyncStorage` as Supabase auth storage |
| MFA | `api.security.*` → `supabase.auth.mfa.*` |

### 4.3 Storage uploads

| Bucket | Call sites |
|--------|------------|
| `avatars` / `covers` | `profiles.service.ts` |
| `stories` / `reels` | `stories.service.ts` / `reels.service.ts` |
| `post-media` | web `CreatePostPage`, mobile `(tabs)/create` |
| `messages` | web `ConversationPage`, mobile `messages/[id]` |
| `account-exports` | Netlify `account-export.ts` + `settings.getExportDownloadUrl` |

### 4.4 Realtime

| Feature | Implementation |
|---------|----------------|
| New messages | Channel `messages:{id}` · `postgres_changes` INSERT |
| Typing | Channel `typing:{id}` · broadcast |
| Online | `messages.heartbeat` / `getPresence` → `user_presence` |

Files: `apps/social-web/src/pages/ConversationPage.tsx`, `apps/social/app/messages/[id].tsx`

### 4.5 Netlify Functions

| Function | Secrets |
|----------|---------|
| `password-otp` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_*` |
| `account-export` | service role + user Bearer JWT |
| `account-delete` | service role + user Bearer JWT + phrase `DELETE` |

### 4.6 SQL surface

Migrations `001`–`016` under `packages/social-core/supabase/migrations/` (~70 tables, RLS helpers, triggers, RPCs). **Do not delete** these files during migration.

---

## 5. MySQL tables required (full model)

Do not omit tables for complexity. Prefer `CHAR(36)` UUID PKs.

### Identity / account

`users` (new — replaces Supabase Auth), `profiles`, `password_reset_otps`, `mfa_factors`, `mfa_challenges` (or equivalent), `user_settings`, `login_events`, `activity_log`, `data_export_requests`, `account_deletion_requests`

### Graph / privacy

`follows`, `follow_requests`, `friend_requests`, `friendships`, `blocked_users`, `user_mutes`, `user_restricts`, `user_snoozes`, `close_friends`, `feed_favorites`, `audience_lists`, `audience_list_members`, `post_audience`

### Posts / engagement

`posts`, `post_media`, `post_likes`, `post_reactions`, `comments`, `comment_likes`, `saved_posts`, `saved_collections`, `post_shares`, `post_tags`, `post_revisions`, `post_views`, `comment_keyword_filters`, `hidden_posts`, `hashtags`, `post_hashtags`, `reports`

### Stories / reels

`stories`, `story_media`, `story_views`, `story_sticker_responses`, `story_highlights`, `story_highlight_items`, `reels`, `reel_media`, `reel_likes`, `reel_comments`, `reel_saves`

### Messaging

`conversations`, `conversation_members`, `messages`, `message_attachments`, `message_reactions`, `user_presence`

### Groups / events

`groups`, `group_members`, `group_posts`, `group_join_questions`, `group_join_answers`, `broadcast_channels`, `broadcast_messages`, `events`, `event_members`, `event_invites`

### Notifications

`notifications`, `notification_prefs`, `push_tokens`

### Media metadata

Optional `media_files` table mapping bucket/path/mime/size/owner — or store paths on existing media tables as today.

**Schema deliverable (Phase 2):** ✅ **DONE** — `backend/database/schema.sql` (+ `backend/database/README.md`, empty `migrations/`). Applied locally on Laragon DB `viora` (70 tables: domain + `users` + `auth_sessions` + `media_objects`). PK/FK/UNIQUE/INDEX, utf8mb4, `DATETIME(6)`, ON DELETE rules.

---

## 6. PHP API modules required

```
backend/
├── config/           # database.php (mysqli), app, jwt, mail, storage
├── database/
│   ├── schema.sql
│   └── migrations/
├── middleware/       # auth JWT, CORS, rate limit
├── controllers/
├── services/         # business + authorization (RLS replacement)
├── repositories/     # MySQLi prepared statements ONLY
├── validators/
├── routes/
├── helpers/
├── auth/
├── storage/
└── README.md
```

Map controllers/services 1:1 to `@viora/core`:

auth · profiles · posts · likes · comments · saves · shares · follows · friends · relationships · audiences · blocks · reports · messages · notifications · stories · reels · groups · events · reactions · discovery · settings · security · media

### Example route families (final list follows core methods, not this sketch alone)

- `POST /api/v1/auth/register|login|logout|refresh`
- `POST /api/v1/auth/password/otp/send|reset`
- `GET|PATCH /api/v1/profile`, `GET /api/v1/users/{username}`
- `GET /api/v1/feed`, CRUD posts, likes, comments, saves, shares
- Messaging, notifications, stories, reels, groups, events, discovery, settings, MFA, export/delete

**Response shape:** Keep JSON close to existing `@viora/core` TypeScript types (`Profile`, `Post`, etc.) to minimize mapper churn.

---

## 7. Preserve `@viora/core` service API

Existing façade (`createVioraApi`) method names stay stable, including:

`auth.login/register/...`, `posts.create/listFeed/...`, `likes.toggleLike`, `comments.create`, `messages.send`, `notifications.list`, `settings.*`, `security.*`, …

Internal change:

```
Service method
  → HttpClient (Bearer access token)
  → PHP /api/v1/...
  → Repository (mysqli)
```

Optional dual mode:

```ts
// conceptual
BACKEND = 'supabase' | 'php'  // from env
```

---

## 8. Authentication migration

| Current | Target |
|---------|--------|
| Supabase Auth users | `users`: email + `password_hash` |
| Hashing | `password_hash` / `password_verify` (PASSWORD_DEFAULT) |
| Session | Short-lived **access JWT** + **refresh token** (HttpOnly cookie optional for web; mobile stores tokens securely via existing AsyncStorage adapter in core) |
| Register | Same fields; auto-username logic ported from `allocateUniqueUsername` |
| OTP reset | Move from Netlify → PHP; hash OTP; expiry; attempt limits; SMTP |
| MFA TOTP | PHP TOTP library + factor storage; keep `security.*` method names |
| Soft / hard delete | Same semantics; hard delete transactional with FK order |

**Never** expose DB/SMTP/JWT secrets via `VITE_*` / `EXPO_PUBLIC_*`.

---

## 9. Storage migration

| Concern | Plan |
|---------|------|
| Public media | `STORAGE_PATH/{bucket}/{userId}/file` + public base URL |
| Private messages / exports | Auth-gated download or signed URL with expiry |
| Validation | MIME, extension, size, ownership (match current limits) |
| Data move | Script: pull Supabase objects → write disk → update URL columns |
| No BLOBs in MySQL | Paths/URLs + metadata only |

Buckets to support: `avatars`, `covers`, `post-media`, `stories`, `reels`, `messages`, `account-exports`.

---

## 10. Realtime migration

| Feature | Near-term | Ideal |
|---------|-----------|-------|
| New DMs | Core `realtime` abstraction; polling OK interim | WebSocket push on message insert |
| Typing | Same channel name `typing:{conversationId}` | WS broadcast |
| Presence | Keep heartbeat → `user_presence` | Unchanged pattern |

**Do not** remove typing/live inserts from UX. Conversation UIs should call abstraction, not `api.client.channel` directly (refactor in Phase 8).

---

## 11. RLS → PHP authorization mapping

Reimplement these as PHP service checks (authenticated user from JWT only):

| SQL / rule | PHP responsibility |
|------------|-------------------|
| `can_view_post` | Visibility, audience lists, follow/friend, blocks, live/scheduled |
| `can_view_story` | Audience (public / close friends), mute/block |
| `can_view_group` / `is_group_member` / `is_group_admin` | Group access & moderation |
| `is_conversation_member` | Message access |
| `feed_hidden_author_ids` / `story_hidden_author_ids` | Mute/snooze/restrict |
| Block cleanup trigger | Transaction: remove follows/friends/requests both ways |
| Friend accept → mutual follows | Transaction on accept |
| Notification triggers | Create notification rows in same use-case transactions |
| Hashtag sync | On post body write |
| Counter bumps | Maintain like/comment/save counts in transactions |

---

## 12. Email / OTP / export / delete

| Flow | Target |
|------|--------|
| Password OTP | PHP + SMTP (same 6-digit UX) |
| Account export | Authenticated job → JSON file in private storage → download URL |
| Account delete | Confirm phrase `DELETE` → transactional wipe / auth user removal |

Netlify Functions remain until PHP parity + explicit cutover.

---

## 13. Data migration strategy (manual)

1. Export Postgres data (read-only).  
2. Transform/load into staging MySQL (`tools/migrate-supabase-to-mysql/` — Phase 2+).  
3. Align `auth.users` → `users` with same UUIDs as `profiles.id` where possible.  
4. Copy storage; rewrite URLs.  
5. Validate row counts + spot-check relationships.  
6. Production cutover only with explicit approval and rollback window.

**Never** auto-run destructive migration against production.

---

## 14. Frontend impact

### Must change (minimal)

- `@viora/core` HTTP layer + service internals  
- AuthProviders to new session API (preserve React context shape: `user`, `profile`, `api`, `login`, …)  
- Direct Storage uploads → core upload helpers  
- Conversation realtime → abstraction  
- Env examples for API base URL  

### Must NOT change

- Routes in `App.tsx` / Expo `_layout` path names  
- Page layouts, tokens, colors, spacing, components (no redesign)  
- Business rules / validation intent  
- Feature set  

---

## 15. Files plan

### Will be added

- `docs/MYSQL_PHP_MIGRATION_PLAN.md` (this file)  
- Later: `docs/PHP_MYSQL_ARCHITECTURE.md`, `docs/API_REFERENCE.md`  
- `backend/**` (Phases 2–7)  
- `packages/social-core/src/http/**` (Phase 8)  
- `backend/.env.example`  
- Optional realtime service + migration tools  

### Will be modified (later)

- `packages/social-core/src/*.service.ts`, `api.ts`  
- AuthProviders; upload call sites; conversation realtime  
- Env examples; eventually `VIORA_FULL_PROJECT.md` / `VIORA_PROJECT_FLOW.md`  

### Must not touch now

- Production env/DB/Netlify  
- Deleting Supabase migrations or live Supabase project  
- UI redesign files  

---

## 16. MySQLi standards (mandatory)

```php
$db = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, (int)DB_PORT);
$db->set_charset('utf8mb4');

$stmt = $db->prepare('SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1');
$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();
```

- Every user-influenced query: prepared statements  
- Multi-table writes: `$db->begin_transaction()` / `commit` / `rollback`  
- Never return raw DB errors to clients  
- Pre-ship search: ban `PDO`, `new PDO`, `PDOException`

---

## 17. Testing matrix (Phase 10 gate)

**Status: DONE (local Laragon, 2026-09-14)** — raw results: `docs/PHASE10_MATRIX_RESULTS.json`

| Result | Count |
|--------|-------|
| PASS | 56 (+4 re-verified after fixes) |
| FAIL (initial) | 4 — all resolved (see below) |
| SKIP (known gaps) | 8 |

Covered:

**Auth:** register, login, logout, bad credentials, OTP send, refresh, MFA enroll/verify/unenroll  
**Profile:** get/update/search (avatar/cover upload skipped)  
**Social:** follow, friend request/accept, mute (`posts|stories|all`), restrict, snooze, close-friend, favorite, relationship, block  
**Posts:** create/get/feed/watch/update/like/comment/comment-like/pin/archive  
**Stories / Reels / Groups / Events** (URL media arrays; events accept ISO-8601)  
**Messaging:** DM, send/list, reactions, read, presence (attachments + typing WS skipped)  
**Notifications / discovery / settings / report / export / deactivate / hard-delete**

### Fixes during Phase 10
- `EventsService`: normalize `startsAt`/`endsAt` ISO-8601 → MySQL UTC datetime

### Remaining gaps (pre-prod)
| Gap | Notes |
|-----|-------|
| Typing realtime | `api.realtime` polls messages; typing broadcast deferred |
| UI soak | Restart Vite/Expo and walk production routes manually on PHP |
| Staging/prod cutover | Explicit ask only |

### Feature parity filled (post–Phase 10)
- Media upload `POST /api/v1/media/upload` (avatars, covers, post-media, stories, reels, messages) + `api.media.upload` in core
- Saves/collections, reactions, shares, keyword filters, comment pin
- Relationship lists (blocks/mutes/restricts/snoozes/close-friends/favorites), audiences CRUD
- Drafts, post tags (create + respond), revisions on body edit, repost_count bump
- App create-post / message attachment flows use `api.media` when on PHP

UI regression: same routes and flows as current production UX (dual-mode; default prod = Supabase).

---

## 18. Risks & rollback

| Risk | Mitigation |
|------|------------|
| Auth lockout | Dual-mode + staging soak |
| Privacy regression | Port RLS helpers before public cutover |
| Media URL break | URL rewrite map + CDN |
| Realtime gap | Abstraction + polling interim |
| Accidental prod write | Local/staging only until asked |

**Rollback:** Flip core backend flag / API base URL back to Supabase; keep Netlify Functions; do not drop Supabase until soak complete.

---

## 19. Phased execution order

| Phase | Deliverable | Prod? |
|-------|-------------|-------|
| **1** | This plan doc | No — **DONE** |
| **2** | `backend/database/schema.sql` (+ empty migration folder) | No — **DONE** (local Laragon `viora`) |
| **3** | PHP auth + JWT middleware + OTP (MySQLi) | Local — **DONE** |
| **4** | Profiles, posts, feed, likes, comments, follows, friends, relationships | Local — **DONE** |
| **5** | Stories, reels, watch, groups, events | Local — **DONE** |
| **6** | Messaging, notifications, discovery | Local — **DONE** |
| **7** | Settings, MFA, reports, export/delete, safety | Local — **DONE** |
| **8** | Refactor `@viora/core` → PHP HTTP (dual-mode) | Local — **DONE** |
| **9** | Local web/mobile env → PHP API | Local — **DONE** |
| **10** | Full test matrix | Local — **DONE** |
| **Later** | Staging → production (explicit ask only) | Ask first |

---

## 20. Next step (requires your approval)

**Phase 10 complete (local).** Migration Phases 1–10 are done on Laragon.

Remaining before any prod cutover (explicit ask only):

1. Typing / true realtime (or accept polling)  
2. Manual UI soak with `VITE_API_BACKEND=php` (create post media, DMs, stories/reels)  
3. Staging soak → production cutover **only when you ask**

Feature parity for saves/reactions/shares/audiences/lists/media/tags/revisions is implemented on the PHP backend + dual-mode core.

Say **continue** only if you want work on a specific gap above — or ask explicitly to plan staging/prod.

---

## 21. Impact report cross-reference (A–Q)

| Item | Section in this doc |
|------|---------------------|
| A Current architecture | §2 |
| B Target architecture | §3 |
| C Supabase dependencies | §4 |
| D MySQL tables | §5 |
| E PHP modules | §6 |
| F Auth plan | §8 |
| G Storage plan | §9 |
| H Realtime plan | §10 |
| I RLS → PHP | §11 |
| J Data migration | §13 |
| K Frontend changes | §14 |
| L Files added | §15 |
| M Files modified | §15 |
| N Files not touched | §15 |
| O Risks | §18 |
| P Rollback | §18 |
| Q Phases | §19 |
