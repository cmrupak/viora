# UI Phase 2 — Polished authentication

Original brand: **Viora**  
Icons: **Lucide only**  
Styling: Tailwind (web) + NativeWind (mobile)

## What shipped

### Web (`apps/social-web`)
- Split-panel `AuthLayout` with branding aside + form card
- Client-side validation helpers (`components/auth/validation.tsx`)
- Polished **Login**, **Register**, **Forgot password**, **Reset password**
- Password show/hide (Lucide Eye / EyeOff)
- Google button placeholder (disabled until Supabase OAuth is enabled)
- `/reset-password` route (outside GuestOnly so recovery sessions work)
- `updatePassword` + `requestPasswordReset({ redirectTo })` on AuthProvider

### Mobile (`apps/social`)
- Shared `AuthLayout` + validation
- NativeWind + Lucide auth screens: login, register, forgot-password, reset-password
- AuthGate allows `/reset-password` while a recovery session is active
- Welcome screen restyled to Phase 2 copy
- Removed leftover `Tabs.Screen name="two"`

### Shared (`packages/social-core`)
- `requestPasswordReset` accepts optional `redirectTo` for Supabase email links

## Routes
| Path | Notes |
|------|--------|
| `/login` | Guest only |
| `/register` | Guest only |
| `/forgot-password` | Guest only |
| `/reset-password` | Public (recovery session) |

## Run
```powershell
cd c:\laragon\www\nexora
npm run dev:social-web
npm run dev:social-mobile
```

## Supabase note
Add `https://your-domain/reset-password` (and the Expo deep link from `Linking.createURL`) to Auth → URL Configuration → Redirect URLs.

## Next
Say **continue Phase 3** when you want the polished Home Feed UI.
