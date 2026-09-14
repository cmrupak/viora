# Viora — Full Project Documentation (Live / Production)

> **Purpose:** Single source of truth for architecture, features, env, migrations, deploy, routes, and go-live checklist.  
> **Product:** Original Facebook + Instagram hybrid social app (not the old CRUD/Firebase demo).  
> **Last updated:** 2026-09-14  
> **Keep this file updated** whenever auth, deploy, migrations, or major features change.  
> **Backend migration:** Phases 1–10 done locally (PHP API + dual-mode core + local env + test matrix). Production remains Supabase until you explicitly approve staging/cutover. Open gaps: media upload, typing WS, saves/shares/reactions/audiences stubs. See [`docs/MYSQL_PHP_MIGRATION_PLAN.md`](./docs/MYSQL_PHP_MIGRATION_PLAN.md) §17.

---

## 0. Quick links

| Item | Value |
|------|--------|
| GitHub | https://github.com/cmrupak/viora |
| Live web | https://vioradev.netlify.app |
| APK download page | https://vioradev.netlify.app/app |
| Update manifest | https://vioradev.netlify.app/app-update.json |
| Supabase project ref | `cozqexdsqxarznnrojdv` |
| Supabase URL | `https://cozqexdsqxarznnrojdv.supabase.co` |
| Expo / EAS | `@rupak99/viora` · projectId `7eed2a5a-5dd6-4c63-b3d6-9b8a6beadc37` |
| Android package | `app.viora.mobile` |
| Local disk path (example) | `c:\laragon\www\viora` |

**Do not confuse with:** `Build a Full-Stack CRUD Application Using React, React Native & Firebase.md` (legacy tutorial / unrelated stack).

---

## 1. What Viora is

Viora is a full social network (FB + IG style) with:

- Auth, profiles, feed, posts/media, likes, comments, reactions, saves, shares/reposts  
- Friends + follows, blocks, mutes, restricts, snooze, close friends, favorites  
- Private accounts, post visibility, audience lists  
- Stories, Reels, Watch (long-form video)  
- Groups + Events  
- DMs (1:1 + groups), notifications, Explore/hashtags/places  
- Safety: reports, MFA, login activity, data export, hard delete, sensitive content  

**Out of current scope (by design):** live video streaming, ads/monetization, Marketplace.

---

## 2. Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│  apps/social-web    │     │  apps/social (Expo)  │
│  @viora/web         │     │  @viora/mobile       │
│  Vite React Router  │     │  Expo Router         │
└─────────┬───────────┘     └──────────┬───────────┘
          │                            │
          └────────────┬───────────────┘
                       ▼
          ┌────────────────────────┐
          │  packages/social-core  │
          │  @viora/core           │
          │  services + types      │
          └────────────┬───────────┘
                       ▼
          ┌────────────────────────┐
          │  Supabase              │
          │  Auth · Postgres+RLS   │
          │  Storage · Realtime    │
          └────────────────────────┘

Netlify Functions (server only):
  /api/password-otp
  /api/account-export
  /api/account-delete
```

### Monorepo workspaces

| Path | Package | Role |
|------|---------|------|
| `packages/social-core` | `@viora/core` | Shared Supabase API, types, optimistic UI, i18n, app-update helpers |
| `apps/social-web` | `@viora/web` | Production web client |
| `apps/social` | `@viora/mobile` | Production mobile client |
| `apps/api` | `@viora/api` | Legacy Express API — **not required** for social core features |
| `packages/shared` | `@viora/shared` | Legacy CRUD shared code — **not used** by social clients |

Root package: `viora` · Node **≥ 20**.

**Security rule:** Clients use **anon key only**. Never put `service_role` or SMTP passwords in `VITE_*` / `EXPO_PUBLIC_*` or commit them to git.

---

## 3. Go-live checklist (do in order)

### A. Supabase (already in use — do **not** create a new project)

1. Use project `cozqexdsqxarznnrojdv`.
2. Ensure migrations **001 → 016** are applied (see §5).
3. Confirm Auth email confirmation settings match product choice (OTP reset does **not** use Supabase reset email).
4. Copy **anon** and **service_role** keys from Supabase → Project Settings → API.

### B. Netlify env (Site → Environment variables)

**Do not upload a `.env` file.** Add variables in the Netlify UI.

#### Client (required for web)

| Variable | Example / notes |
|----------|-----------------|
| `VITE_SUPABASE_URL` | `https://cozqexdsqxarznnrojdv.supabase.co` ✅ already set |
| `VITE_SUPABASE_ANON_KEY` | anon JWT ✅ already set |
| `VITE_ANDROID_APK_URL` | optional CDN override |
| `VITE_IOS_APP_URL` | optional App Store link |

#### Server (required for OTP + export + hard delete)

| Variable | Notes |
|----------|--------|
| `SUPABASE_URL` | Same URL as `VITE_SUPABASE_URL` (**no** `VITE_` prefix) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — **server only** |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `587` |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | App password (not normal Gmail password) |
| `SMTP_FROM` | e.g. `Viora <you@example.com>` |

After changing server env → **Redeploy** Netlify so Functions pick them up.

### C. Deploy web

- Push to `main` on GitHub triggers Netlify (connected site).  
- Build command: `npm install && npm run build --workspace=@viora/web`  
- Publish: `apps/social-web/dist`  
- Config: root `netlify.toml` · `NODE_VERSION=20` · `GIT_LFS_ENABLED=true`

### D. Mobile APK (optional for each release)

APK does **not** auto-update. Sideloaded installs need a new download.

```powershell
cd apps\social
npx eas-cli build -p android --profile preview
```

Then:

1. Bump `apps/social/app.json` → `expo.version`  
2. Update `apps/social-web/public/app-update.json` (`latestVersion`, `apkUrl`)  
3. Replace `apps/social-web/public/downloads/viora-android.apk` (Git LFS) **or** set `VITE_ANDROID_APK_URL`  
4. Deploy web  

Mobile checks `{EXPO_PUBLIC_WEB_API_URL}/app-update.json` on launch and prompts to download.

### E. Smoke test after go-live

- [ ] https://vioradev.netlify.app loads  
- [ ] Register → login → feed loads (no “relationship / schema cache” error)  
- [ ] Create post with image  
- [ ] Like / comment  
- [ ] Forgot password OTP email (needs SMTP + service role)  
- [ ] Settings → MFA enroll (optional)  
- [ ] `/app` APK download  
- [ ] Profile, messages, explore  

---

## 4. Environment files (local — never commit secrets)

| File | Purpose |
|------|---------|
| `apps/social-web/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `apps/social/.env` | `EXPO_PUBLIC_SUPABASE_*`, optional `EXPO_PUBLIC_WEB_API_URL` |
| `.env.smtp` (repo root, gitignored) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_*` for local OTP/export |
| `apps/api/.env` | `DATABASE_URL` for applying SQL migrations |

Examples: `.env.smtp.example`, `apps/social-web/.env.example`, `apps/social/.env.example`, `apps/api/.env.example`.

### Apply migrations

```powershell
cd <project-root>
node packages/social-core/supabase/apply-migration.mjs 001_phase2_auth_profiles.sql
# … through …
node packages/social-core/supabase/apply-migration.mjs 016_reload_posts_repost_fk.sql
```

Uses `DATABASE_URL` from `apps/api/.env`. Migrations are mostly idempotent (`IF NOT EXISTS`).

---

## 5. Database migrations (must apply in order)

Path: `packages/social-core/supabase/migrations/`

| # | File | Purpose |
|---|------|---------|
| 001 | `001_phase2_auth_profiles.sql` | `profiles` + signup trigger + RLS |
| 002 | `002_phase3_profile_storage.sql` | Wider profile read + `avatars` bucket |
| 003 | `003_full_social_schema.sql` | Posts, follows, likes, comments, DMs, `post-media` |
| 004 | `004_extended_social.sql` | Stories, reels, groups, events, friends, reactions, covers + buckets |
| 005 | `005_gender_and_password_otps.sql` | `gender` + `password_reset_otps` |
| 006 | `006_phase_a_social_graph.sql` | Friend-accept → mutual follows; block cleans graph |
| 007 | `007_phase_b_relationship_edges.sql` | Mute / restrict / snooze / close friends / favorites |
| 008 | `008_phase_c_privacy.sql` | Private accounts, follow requests, visibility, audience lists |
| 009 | `009_phase_e_post_composition.sql` | Drafts/schedule, location/feeling, tags, pin/archive, views, alt text |
| 010 | `010_phase_f_engagement.sql` | Comment controls, hide, collections, shares, **reposts** |
| 011 | `011_phase_g_messaging.sql` | Messaging v2 (reply, reactions, presence, groups, requests) |
| 012 | `012_phase_h_stories_reels.sql` | Story stickers/highlights; reel audio/saves; Watch duration |
| 013 | `013_phase_i_groups_events.sql` | Group visibility/mods; event invites/recurrence |
| 014 | `014_phase_j_notifications_discovery.sql` | Notif prefs, push tokens, hashtags, birthdays/memories |
| 015 | `015_phase_k_safety_account.sql` | User settings, login/activity, export/delete requests, sensitive, `account-exports` |
| 016 | `016_reload_posts_repost_fk.sql` | Ensure `posts_repost_of_id_fkey` + reload PostgREST schema |

**Product decisions baked into schema/services:**

- Friend accept → auto-follow both ways  
- Block → remove follows both ways, friendship, requests; hide content  
- Remove follower → delete follow edge only  
- Private account posts → approved followers only  
- Default post visibility → public (private accounts default create to followers)  
- Custom audience lists → arbitrary (FB-style)  
- Group **hidden** = unlisted/invite-only; **private** = visible card + join approval  

---

## 6. Storage buckets

| Bucket | Public | Typical limit | Used for |
|--------|--------|---------------|----------|
| `avatars` | yes | 5 MB | Profile photos |
| `covers` | yes | 10 MB | Profile covers |
| `post-media` | yes | 50 MB | Feed images/videos |
| `stories` | yes | 50 MB | Stories |
| `reels` | yes | 100 MB | Reels |
| `messages` | **no** | 50 MB | DM attachments |
| `account-exports` | **no** | 50 MB | GDPR-style JSON exports |

---

## 7. Netlify Functions & redirects

Config: `netlify.toml` · directory `netlify/functions/`

| Route | Function | Auth | Purpose |
|-------|----------|------|---------|
| `POST /api/password-otp` | `password-otp` | none (email+OTP) | Send / verify password OTP |
| `POST /api/account-export` | `account-export` | Bearer user JWT | Build JSON export in Storage |
| `POST /api/account-delete` | `account-delete` | Bearer + phrase `DELETE` | Auth Admin hard delete |

Also present (legacy): `api.ts` (Express wrap), `warm-api.ts` (cron ping) — not required for social core.

Local Vite mirrors OTP + account APIs:

- `apps/social-web/server/passwordOtpDevPlugin.ts`  
- `apps/social-web/server/accountApiDevPlugin.ts`  

---

## 8. `@viora/core` API surface

`createVioraApi(supabase)` exposes:

| Service | Responsibility |
|---------|----------------|
| `auth` | Register/login/logout/session/profile ensure; username allocation |
| `profiles` | Get/update/search profiles |
| `posts` | Create/list/update/pin/archive/views; Watch feed; sensitive flag |
| `likes` / `reactions` | Likes + emoji reactions |
| `comments` | Threaded comments, pin, keyword filters |
| `saves` | Saves + collections |
| `shares` | Share / repost / DM share targets |
| `follows` / `friends` | Follow graph + friend requests |
| `relationships` | Mute / restrict / snooze / close friends / favorites |
| `audiences` | Custom audience lists |
| `blocks` / `reports` | Block list + reports |
| `messages` | Conversations, attachments, reactions, presence |
| `notifications` | Inbox, prefs, push token register, grouping |
| `discovery` | Explore, hashtags, places, birthdays, memories |
| `stories` / `reels` | Stories depth + reels |
| `groups` / `events` | Groups/events depth |
| `settings` | Soft deactivate, user settings, login/activity, export/delete requests |
| `security` | TOTP MFA enroll/verify/unenroll |
| `client` | Raw Supabase client |

Helpers: `optimistic`, `i18n`, `account-api`, `app-update`, `theme`, `brand`, `errors`.

---

## 9. Auth flows

### Register (web — source of truth)

**Fields:** First name, Last name, Date of birth, Gender (Male / Female / Custom), Email, Password.  

**Username:** auto-generated in `auth.service.ts` (`allocateUniqueUsername`) from name (fallback email), uniqueness checked against `profiles`.

### Login

Email + password. Google OAuth button is a **disabled placeholder**.

### Forgot password (OTP — custom, not Supabase email reset)

1. `POST /api/password-otp` `{ action: "send", email }`  
2. SMTP sends 6-digit OTP; hash stored in `password_reset_otps`  
3. `{ action: "reset", email, otp, password }` → service role updates Auth password  

### MFA (TOTP)

Supabase Auth MFA via `api.security.*`. UI: web Settings; mobile `/account-security`.

### Soft deactivate vs hard delete

- Soft: `profiles.is_deactivated` via `settings.deactivateAccount`  
- Hard: create `account_deletion_requests` row → `POST /api/account-delete` with phrase `DELETE` → Auth Admin deletes user (cascades)

---

## 10. Web routes

Entry: `/` and `/login` → Login (no marketing landing).

| Path | Access | Page |
|------|--------|------|
| `/app` | Public | Download APK |
| `/setup` | Public | Env setup help |
| `/`, `/login` | Guest | Login |
| `/register` | Guest | Register |
| `/forgot-password` | Guest | OTP reset |
| `/reset-password` | Public | Legacy link page |
| `/feed`, `/home` | Auth | Feed |
| `/explore` | Auth | Explore |
| `/hashtags/:tag` | Auth | Hashtag |
| `/places/:name` | Auth | Place |
| `/search` | Auth | Search |
| `/reels`, `/reels/create` | Auth | Reels |
| `/watch` | Auth | Watch |
| `/highlights` | Auth | Highlights |
| `/friends` | Auth | Friends |
| `/stories/create` | Auth | Create story |
| `/messages`, `/messages/:id` | Auth | DMs |
| `/notifications` | Auth | Notifications |
| `/groups`, `/groups/:id` | Auth | Groups |
| `/events`, `/events/:id` | Auth | Events |
| `/saved` | Auth | Saved |
| `/create` | Auth | Create post |
| `/posts/:id` | Auth | Post detail |
| `/u/:username` | Auth | User profile |
| `/u/:username/connections` | Auth | Followers/following |
| `/audience-lists` | Auth | Audience lists |
| `/profile` | Auth | Edit own profile |
| `/settings` | Auth | Settings / safety / MFA / export |

Shell: sidebars static; middle column scrolls; `.scrollbar-hide`.

Auth UX: centered card; first visit typing intro Hi → Welcome (`sessionStorage` `viora-auth-intro-seen`).

Local: `npm run dev:social-web` → http://localhost:5174

---

## 11. Mobile routes

**Tabs:** feed · explore · create · notifications · profile  

**Also:** login, register, forgot/reset password, setup, post/[id], user/[username], messages, friends, connections, relationship-lists, groups, group/[id], events, event/[id], reels, reels/create, watch, highlights, hashtag/[tag], place/[name], saved, search, stories/create, notification-prefs, safety, account-security, settings  

Scheme: `viora` · NativeWind + brand tokens · theme preference (system/light/dark) via AsyncStorage.

Local: `npm run dev:social-mobile`

EAS:

```powershell
cd apps\social
npx eas-cli build -p android --profile preview
```

---

## 12. Feature status matrix

| Area | Status |
|------|--------|
| Auth (register/login/logout/OTP/session) | ✅ Web + Mobile |
| Profiles (edit, avatar, cover) | ✅ |
| Feed + optimistic create | ✅ |
| Posts media / carousel / alt text | ✅ |
| Likes / comments / reactions / saves / shares | ✅ |
| Friends + follows + PYMK | ✅ Phase A |
| Block graph cleanup | ✅ Phase A |
| Mute / restrict / snooze / CF / favorites | ✅ Phase B |
| Private account + visibility + audience lists | ✅ Phase C |
| Drafts / schedule / edit / pin / archive / views | ✅ Phase E |
| Engagement (hide, collections, repost, keyword filters) | ✅ Phase F |
| Messaging v2 | ✅ Phase G |
| Stories + Reels + Watch | ✅ Phase H |
| Groups + Events depth | ✅ Phase I |
| Notifications prefs + discovery | ✅ Phase J |
| Safety / MFA / export / hard delete / a11y prefs | ✅ Phase K |
| Dark mode | ✅ Web + Mobile preference |
| Android soft update prompt | ✅ (needs new APK to include checker) |
| RLS + storage | ✅ |
| Google OAuth | ❌ Placeholder only |
| Expo push *delivery* | ❌ Tokens stored; sender not wired |
| Event reminder push jobs | ❌ |
| Login alert *email* | ❌ In-app notify only |
| Live video / Ads / Marketplace | ❌ Out of scope |
| Comment media attachments | ❌ Polish |
| Full list virtualization | ❌ Polish |
| Phase D profile About/pronouns/verified | ⏭ Optional / skipped |

Longer checklist also in `apps/social/VIORA_STATUS.md`.

---

## 13. Local development commands

```powershell
cd c:\laragon\www\viora

npm install
npm run dev:social-web      # http://localhost:5174
npm run dev:social-mobile  # Expo
npm run build:social-web   # production build
npm run typecheck -w @viora/core
```

Copy env examples before first run. For local OTP: copy `.env.smtp.example` → `.env.smtp`.

---

## 14. Android update system

| File | Role |
|------|------|
| `apps/social-web/public/app-update.json` | Latest version + APK URL |
| `apps/social/components/AppUpdateChecker.tsx` | Prompt on launch |
| `packages/social-core/src/app-update.ts` | Fetch + semver compare |

Current manifest targets version `1.0.0`. Installed APKs **do not** receive JS updates until a new APK is installed. Web updates on every Netlify deploy. Backend/schema changes apply to all clients immediately.

---

## 15. Known production issues & fixes

| Issue | Fix |
|-------|-----|
| `Could not find a relationship between 'posts' and 'posts'` | Migration `016` + client uses `posts!repost_of_id` with fallback (`170ec71`) |
| OTP / export / delete fail on live | Add Netlify **server** env (`SUPABASE_*` without VITE + SMTP) and redeploy |
| Mobile missing new features | Rebuild EAS APK + update `app-update.json` + redeploy web |
| Feed empty after migrations | Confirm 001–016 applied; hard-refresh web |

---

## 16. Rules for humans & AI agents

1. Extend `@viora/core` + existing UI — don’t rebuild parallel stacks.  
2. Never expose `service_role` or SMTP secrets to clients or git.  
3. Don’t commit/push/deploy/mutate production DB unless explicitly asked.  
4. When changing auth/register/reset/deploy/migrations → update **this file** and `VIORA_PROJECT_FLOW.md`.  
5. Prefer additive SQL migrations; reload PostgREST (`NOTIFY pgrst, 'reload schema'`) after FK changes.  

---

## 17. Mental model (one page)

```
User → vioradev.netlify.app
  → Login / Register (username auto) / Forgot (SMTP OTP)
  → AppShell → feed & social features via Supabase + @viora/core
  → Settings: prefs, MFA, export, hard delete
  → /app → Android APK (manual update via app-update.json)

Mobile Expo app → same @viora/core → same Supabase
  → Optional EXPO_PUBLIC_WEB_API_URL for Functions + update check
```

---

## 18. Related docs in repo

| File | Role |
|------|------|
| **`VIORA_FULL_PROJECT.md`** (this file) | Complete live/production bible |
| `VIORA_PROJECT_FLOW.md` | Shorter AI handoff |
| `apps/social/VIORA_STATUS.md` | Feature checkbox status |
| `apps/social/VIORA.md` | Mobile-oriented notes |
| `README.md` | Repo overview |
| `netlify.toml` | Deploy + redirects |
| `.env.smtp.example` | Server secrets template |

---

*End of document. If something is missing for go-live, add it here before the next deploy.*
