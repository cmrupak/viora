# Viora — full social app (web + mobile)

Original social product (not a Facebook clone).  
**Web** and **mobile** share the same flows and logic via `@viora/core`.

## Stack

- Web: React + Vite + React Router
- Mobile: Expo Router + React Native
- Backend: Supabase Auth, Postgres (RLS), Storage, Realtime
- Optimistic UI for likes, saves, follows, comments, posts, profile, messages

## Apps

| Path | Package | Command |
|------|---------|---------|
| `packages/social-core` | `@viora/core` | shared services/types |
| `apps/social-web` | `@viora/web` | `npm run dev:social-web` → http://localhost:5174 |
| `apps/social` | `@viora/mobile` | `npm run dev:social-mobile` |

## Env (required)

`apps/social-web/.env`
```env
VITE_SUPABASE_URL=https://YOUR.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...anon...
```

`apps/social/.env`
```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
```

Never put the **service_role / secret** key in these files.

## Database

Migrations (already applied if you used the apply script):

1. `001_phase2_auth_profiles.sql`
2. `002_phase3_profile_storage.sql`
3. `003_full_social_schema.sql`

Re-apply:
```powershell
node packages/social-core/supabase/apply-migration.mjs 003_full_social_schema.sql
```

## Features

- Auth: register, login, logout, forgot password, session persistence, protected routes
- Profile: edit name/username/bio/avatar (optimistic)
- Feed + create posts (text/image)
- Likes, saves, shares, comments/replies (optimistic)
- Follow / unfollow
- Explore (username search)
- Notifications
- Direct messages + realtime channel
- Settings: logout, deactivate

## Run

```powershell
cd <project-root>
npm run dev:social-web
npm run dev:social-mobile
```

## Test checklist

1. Register on web → land on feed  
2. Create a post → appears immediately  
3. Like / save → UI updates instantly  
4. Open post → add comment  
5. Explore → find user → follow  
6. Messages → open DM → send  
7. Same flows on mobile  
