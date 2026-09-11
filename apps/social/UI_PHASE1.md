# UI Phase 1 — Design system + App shell

Original brand: **Viora**  
Icons: **Lucide only** (`lucide-react` / `lucide-react-native`)  
Styling: **Tailwind CSS** (web) + **NativeWind** (mobile)

## Files created / modified

### Web (`apps/social-web`)
- `vite.config.ts` — Tailwind v4 plugin
- `src/styles/globals.css` — tokens + dark mode
- `src/design/tokens.ts`, `ThemeProvider.tsx`
- `src/components/ui/*` — Button, Input, Card, Avatar, Modal, Drawer, BottomSheet, Toast, Skeleton, Badge
- `src/components/layout/*` — AppHeader, DesktopSidebar, RightSidebar, MobileBottomNav, AppShell
- `src/pages/HomeShellPage.tsx`, `SectionShellPage.tsx`
- Auth + welcome pages restyled with Tailwind
- `src/App.tsx` / `src/main.tsx` wired to new shell

### Mobile (`apps/social`)
- `tailwind.config.js`, `global.css`, `babel.config.js`, `metro.config.js`, `nativewind-env.d.ts`
- `design/tokens.ts`
- `components/ui/Primitives.tsx`
- Tabs use Lucide icons + design tokens
- Feed/Explore show Phase 1 shell layouts

## Dependencies installed
- Web: `lucide-react`, `tailwindcss`, `@tailwindcss/vite`
- Mobile: `lucide-react-native`, `react-native-svg`, `nativewind`, `tailwindcss@3.4.x`

## Routes (shell)
`/feed` `/home` `/explore` `/reels` `/friends` `/messages` `/notifications` `/groups` `/events` `/saved` `/search` `/create` `/profile` `/settings`  
(+ auth routes unchanged)

## Run
```powershell
cd c:\laragon\www\nexora
npm run dev:social-web
npm run dev:social-mobile
```

## Test responsive
1. Web ≥1280px — 3 columns (left nav + feed + right sidebar)
2. Web ~900px — left + main (right hidden)
3. Web &lt;768px — header + bottom nav, hamburger menu
4. Toggle dark mode from left sidebar
5. Mobile Expo — bottom tabs with Lucide icons

## Stopped here
Phase 1 only. Say **continue Phase 2** for polished authentication UI next.
