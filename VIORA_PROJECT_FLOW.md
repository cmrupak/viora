# Viora — Project Flow (AI handoff)

> **Purpose:** Paste this file into another AI so it understands the current product, architecture, and flows.  
> **Keep updated** whenever auth, routing, deploy, or major features change.  
> **Last updated:** 2026-09-11 (Phase K: safety / MFA / activity / export / hard delete / a11y prefs)

---

## 1. What this product is

**Viora** is an original social app (Facebook/Instagram-style hybrid), **not** the old CRUD demo.

| Surface | Path | Package | Stack |
|---------|------|---------|--------|
| Shared logic | `packages/social-core` | `@viora/core` | Supabase client services, types, optimistic helpers |
| Web | `apps/social-web` | `@viora/web` | Vite + React Router + Tailwind v4 + Lucide |
| Mobile | `apps/social` | `@viora/mobile` | Expo Router + NativeWind + lucide-react-native |
| Legacy API (optional) | `apps/api` | `@viora/api` | Express — **not** used by Viora social client for core features |

Old CRUD apps `apps/web` and `apps/mobile` were **removed**. GitHub repo is **`cmrupak/viora`**.  
Local disk folder may still be named `nexora` (e.g. Laragon path) — optional to rename manually; package names are already `viora`.

---

## 2. Backend

- **Supabase project:** `cozqexdsqxarznnrojdv`
- Auth, Postgres + **RLS**, Storage, Realtime
- Clients use **anon key only** — never `service_role` in web/mobile `.env`

### Migrations (`packages/social-core/supabase/migrations/`)

| File | Role |
|------|------|
| `001_phase2_auth_profiles.sql` | profiles + signup trigger |
| `002_phase3_profile_storage.sql` | wider profile read + storage |
| `003_full_social_schema.sql` | posts, follows, likes, comments, DMs, etc. |
| `004_extended_social.sql` | stories, reels, groups, events, friends, reactions, covers |
| `005_gender_and_password_otps.sql` | `profiles.gender`, `password_reset_otps`, updated signup trigger |
| `006_phase_a_social_graph.sql` | Friend-accept → mutual follows; block cleans graph; mutual-friends RPCs; block SELECT for either party |
| `007_phase_b_relationship_edges.sql` | Mutes / restricts / snoozes / close friends / favorites + feed/story hide RPCs |
| `008_phase_c_privacy.sql` | Private account + follow_requests; posts.visibility; audience lists; `can_view_post()` RLS |
| `009_phase_e_post_composition.sql` | publish_status/schedule, location/feeling, post_tags, revisions, pin/archive, views, alt_text |
| `010_phase_f_engagement.sql` | comments_disabled/pin, keyword filters, hidden_posts, saved_collections, share targets, reposts |
| `011_phase_g_messaging.sql` | reply/expires, message reactions, member mute/pin/nickname, presence, group create RPC, message requests |
| `012_phase_h_stories_reels.sql` | story audience/stickers/highlights/sticker responses; story DM link; reel audio/saves; can_view_story; post video duration |
| `013_phase_i_groups_events.sql` | group visibility/status/join Q&A/post approval/broadcasts; event group link/online/recurrence/invites/discussion |
| `014_phase_j_notifications_discovery.sql` | notification_prefs, push_tokens, hashtags/post_hashtags, group_key, birthday/memory types + RPCs |
| `015_phase_k_safety_account.sql` | user_settings, login_events, activity_log, data_export_requests, account_deletion_requests, posts.is_sensitive, account-exports bucket |

Apply (in order if not already applied):

```powershell
node packages/social-core/supabase/apply-migration.mjs 006_phase_a_social_graph.sql
node packages/social-core/supabase/apply-migration.mjs 007_phase_b_relationship_edges.sql
node packages/social-core/supabase/apply-migration.mjs 008_phase_c_privacy.sql
node packages/social-core/supabase/apply-migration.mjs 009_phase_e_post_composition.sql
node packages/social-core/supabase/apply-migration.mjs 010_phase_f_engagement.sql
node packages/social-core/supabase/apply-migration.mjs 011_phase_g_messaging.sql
node packages/social-core/supabase/apply-migration.mjs 012_phase_h_stories_reels.sql
node packages/social-core/supabase/apply-migration.mjs 013_phase_i_groups_events.sql
node packages/social-core/supabase/apply-migration.mjs 014_phase_j_notifications_discovery.sql
node packages/social-core/supabase/apply-migration.mjs 015_phase_k_safety_account.sql
```

(Uses `DATABASE_URL` from `apps/api/.env`.)

---

## 3. Repo / deploy

| Item | Value |
|------|--------|
| GitHub | https://github.com/cmrupak/viora |
| Live web | https://vioradev.netlify.app |
| Netlify build | `npm install && npm run build --workspace=@viora/web` |
| Publish dir | `apps/social-web/dist` |
| Config | root `netlify.toml` |
| Android APK | `apps/social-web/public/downloads/viora-android.apk` (Git LFS) |
| Expo | `@rupak99/viora`, EAS profile `preview` → APK |

### Netlify env (client)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Optional: `VITE_ANDROID_APK_URL`, `VITE_IOS_APP_URL`

### Netlify env (server — OTP password reset, **no VITE_ prefix**)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`

Local OTP: repo-root `.env.smtp` (gitignored) — see `.env.smtp.example`.

### EAS / mobile env

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`  
- Optional: `EXPO_PUBLIC_WEB_API_URL` (web origin for account export/delete + APK update check; default `https://vioradev.netlify.app`)
  (Expo dashboard → Environment variables → **preview** / **production**)

### Android APK update prompt (not auto-install)

Mobile checks `https://<web-origin>/app-update.json` on launch. If `latestVersion` > installed `app.json` version, it prompts to download the APK.

After each EAS preview build:
1. Bump `apps/social/app.json` → `expo.version`
2. Update `apps/social-web/public/app-update.json` (`latestVersion`, `apkUrl` / notes)
3. Replace APK under `public/downloads/` (or set `VITE_ANDROID_APK_URL`)
4. Deploy web so the manifest + APK are live

---

## 4. Web routing & auth shell (current)

### Entry

- `/` and `/login` → **Login** (no marketing landing page)
- Guest routes: `/register`, `/forgot-password`
- Protected app under `AppShell`: `/feed`, `/explore`, `/messages`, …  
- Public: `/app` (download APK), `/setup`, `/reset-password` (legacy link page; OTP flow is on forgot-password)

### Auth UI

- `AuthLayout`: **centered dark card only** (left marketing panel removed)
- Login / Register / Forgot password show **Get the app** → `/app`
- First visit to login: typing intro **Hi** → **Welcome** → fade out → login form  
  (`sessionStorage` key `viora-auth-intro-seen`)

Key files:

- `apps/social-web/src/App.tsx`
- `apps/social-web/src/components/auth/AuthLayout.tsx`
- `apps/social-web/src/components/auth/AuthIntro.tsx`
- `apps/social-web/src/pages/LoginPage.tsx`

### Create account fields (web)

**Shown:** First name, Last name, Date of birth (calendar), Gender (Male / Female / Custom + text), Email, Password  

**Not shown:** Username — **auto-generated** in `@viora/core` from name (fallback email), uniqueness checked against `profiles` (+ DB signup trigger backup).

Key files:

- `apps/social-web/src/pages/RegisterPage.tsx`
- `packages/social-core/src/auth.service.ts` → `allocateUniqueUsername`

### Forgot password (OTP — not Supabase reset email)

1. User enters email → `POST /api/password-otp` `{ action: "send", email }`
2. Server emails **6-digit OTP** via SMTP (nodemailer)
3. User enters OTP + new password → `{ action: "reset", email, otp, password }`
4. Server verifies hash in `password_reset_otps`, updates password with **service role**

Local Vite middleware + Netlify function share the same handler:

- `netlify/functions/password-otp.ts`
- `netlify/functions/_lib/passwordOtp.ts`
- `netlify/functions/account-export.ts` — JSON data export (service role; Authorization: Bearer user JWT)
- `netlify/functions/account-delete.ts` — Auth Admin hard delete (confirm phrase `DELETE`)
- `apps/social-web/server/passwordOtpDevPlugin.ts`
- Redirect: `/api/password-otp` → `/.netlify/functions/password-otp`
- Redirect: `/api/account-export` → `/.netlify/functions/account-export`
- Redirect: `/api/account-delete` → `/.netlify/functions/account-delete`

**Do not** use `supabase.auth.resetPasswordForEmail` for this flow anymore on web.

---

## 5. App shell UX (web)

- Sidebars static; **middle column scrolls**
- Scrollbars hidden (FB/IG-like) via `.scrollbar-hide`
- Main layout: `apps/social-web/src/components/layout/AppShell.tsx`

---

## 6. Feature status (high level)

### Done (web + mobile unless noted)

Auth session, profiles (edit/avatar/cover), following feed, create posts + media, likes/saves/shares/comments, reactions, follow/friends (**send request, accept/reject, unfriend**), followers/following lists + remove follower, people-you-may-know, block from profile (cleans follows/friendship), feed hides blocked users, **mute posts/stories, restrict, snooze 30d, close friends, feed favorites**, **private accounts + follow requests, post visibility (public/followers/friends/only_me/custom) + audience lists**, **multi-media carousel, location/feeling, people tags (+ review), drafts/schedule, edit + history, pin/archive, soft view counts**, **comment reply/like/edit/delete/pin/sort, disable comments, keyword filters, hide post, saved collections, repost + share-to-DM/link**, **DMs v2: group chats, attachments/voice file, reply + reactions, vanish TTL, message requests, read markers, mute/pin, search, typing broadcast + presence**, **stories depth: stickers, close-friends audience, highlights, seen-by, story→DM reply**, **reels polish (audio/save/comments) + Watch long-form tab**, **groups/events depth: visibility (public/private/hidden), join Q&A + approval, promote/demote, pending posts, broadcast channels, event invites/online/recurrence/discussion**, **notification prefs + grouping + birthdays/memories; hashtags, places search, ranked Explore**, **safety: contextual reports, sensitive posts/prefs, TOTP MFA UX, login events + activity log, data export + hard-delete Netlify Functions, i18n shell, reduce-motion, mobile theme preference + alt text**, saved, blocks/reports/deactivate, dark mode (web + mobile preference), RLS/storage, optimistic helpers.

### Incomplete / polish

- Google OAuth (button disabled placeholder)
- Full list virtualization
- Mobile register UI may still differ (username field) — web is source of truth for new signup fields
- Expo push *delivery* Edge Function (tokens + prefs stored; sender not wired)
- Event reminder push jobs
- Login alert *email* (in-app system notification on sign-in is wired; SMTP optional later)

Longer checklist: `apps/social/VIORA_STATUS.md`

---

## 7. Local commands

```powershell
cd <project-root>
npm run dev:social-web      # http://localhost:5174
npm run dev:social-mobile
npm run build:social-web
```

Mobile EAS APK:

```powershell
cd <project-root>\apps\social
npx eas-cli build -p android --profile preview
```

---

## 8. Env files (never commit secrets)

| File | Contents |
|------|----------|
| `apps/social-web/.env` | `VITE_SUPABASE_*` |
| `apps/social/.env` | `EXPO_PUBLIC_SUPABASE_*` |
| `.env.smtp` (root, gitignored) | SMTP + `SUPABASE_SERVICE_ROLE_KEY` for local OTP |
| `apps/api/.env` | `DATABASE_URL` for migrations |

---

## 9. Rules for future AI work

1. Prefer extending `@viora/core` + existing design system — don’t rebuild.
2. Never put `service_role` or SMTP passwords in client bundles or git.
3. Don’t commit/push unless the user asks.
4. Don’t deploy/host Netlify unless the user asks.
5. Live server safety: no mutating production without explicit ask.
6. When changing auth/register/reset/deploy, **update this file**.

---

## 10. Quick mental model

```
User opens vioradev.netlify.app
  → Hi / Welcome intro (once per session)
  → Login card (+ Get the app)
  → Register: name + DOB + gender + email + password (username auto)
  → Forgot: SMTP OTP → set new password
  → Authenticated → AppShell → feed / social features via Supabase + @viora/core
```

Mobile mirrors social features through Expo routes under `apps/social/app/` using the same `@viora/core` API.
