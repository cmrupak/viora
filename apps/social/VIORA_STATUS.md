# Viora — Full dynamic implementation status

Updated after codebase audit + continuous build-out (web + mobile + `@viora/core`).

## Done (live Supabase, both platforms unless noted)

| Area | Status |
|------|--------|
| Auth (register/login/logout/forgot/reset/session) | ✅ Web + Mobile |
| Profiles (edit, avatar, cover, website, location) | ✅ |
| Feed (following-aware + pagination + optimistic create) | ✅ |
| Create post (text/image/video upload) | ✅ |
| Likes / saves / shares / comments | ✅ |
| Reactions (love/haha/wow/sad/angry) | ✅ Web PostCard |
| Follow / unfollow | ✅ |
| Friends (requests + list) | ✅ |
| Stories (create, 24h list, view) | ✅ |
| Reels (create/list/like) | ✅ |
| Explore + Search (debounced) | ✅ |
| Messaging + Realtime inserts | ✅ |
| Notifications (list/read; DB triggers for like/comment/follow/message) | ✅ |
| Groups + Events | ✅ |
| Saved posts | ✅ |
| Blocks + Reports + Deactivate | ✅ |
| Dark mode (persisted) | ✅ Web |
| RLS + storage buckets (avatars, covers, posts, stories, reels, messages) | ✅ Migration 004 applied |
| Optimistic UI (like/save/share/follow/comment/message/profile) | ✅ Core helpers + screens |

## Remaining polish (not blockers for core social loop)

- Typing indicators / online presence
- Comment edit + nested reply composer polish
- Soft-delete post UI affordance everywhere
- Hashtag indexing table / dedicated hashtag pages
- Message media attachments UI
- Mobile dark NativeWind variants
- Virtualized mega-lists / more cursor pages on every screen
- OAuth (Google button still disabled placeholder)
- Hard account delete (needs Edge Function / Auth Admin)

## Run

```powershell
cd c:\laragon\www\nexora
npm run dev:social-web
npm run dev:social-mobile
```

Web build: `npm run build -w @viora/web` (passing).
