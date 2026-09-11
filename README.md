# Viora

Social media app for **web** and **mobile**, sharing one backend and business logic.

| App | Path | Stack |
| --- | --- | --- |
| Web | `apps/social-web` (`@viora/web`) | React + Vite + Tailwind |
| Mobile | `apps/social` (`@viora/mobile`) | Expo Router + NativeWind |
| Shared core | `packages/social-core` (`@viora/core`) | Supabase Auth, Postgres RLS, Storage, Realtime |
| Optional legacy API | `apps/api` (`@viora/api`) | Express (not required for Viora social clients) |

## Project flow (for AI / handoff)

See **[`VIORA_PROJECT_FLOW.md`](./VIORA_PROJECT_FLOW.md)** — keep that file updated as the product changes.

## Local development

```bash
npm install
npm run dev:social-web      # http://localhost:5174
npm run dev:social-mobile
```

### Env

- Web: `apps/social-web/.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Mobile: `apps/social/.env` → `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Never put the Supabase **service_role** key in client apps

### Deploy

- GitHub: `cmrupak/viora`
- Web: Netlify (`netlify.toml` → `apps/social-web/dist`)
- Live: https://vioradev.netlify.app
- Android: EAS preview APK + `/app` download page

## Optional legacy API

```bash
npm run db:setup
npm run dev:api
```

Legacy demo user (API only): `admin@viora.app` / `Admin123!`
