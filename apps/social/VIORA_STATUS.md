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
| Friend send / unfriend / mutual count | ✅ Phase A |
| Followers / following lists + remove follower | ✅ Phase A |
| People you may know (graph-based) | ✅ Phase A |
| Block from profile + graph cleanup trigger | ✅ Phase A (apply migration 006) |
| Mute / restrict / snooze / close friends / favorites | ✅ Phase B (apply migration 007) |
| Private account + follow requests | ✅ Phase C (apply migration 008) |
| Post visibility + audience lists | ✅ Phase C (web lists UI; mobile visibility picker) |
| Multi-media create + carousel | ✅ Phase E (apply migration 009) |
| Location / feeling / people tags | ✅ Phase E |
| Drafts / schedule / edit / pin / archive / views | ✅ Phase E (schedule goes live at `scheduled_at`; no cron worker) |
| Comment reply / like / edit / delete / pin / sort | ✅ Phase F (apply migration 010) |
| Disable comments + keyword filters | ✅ Phase F |
| Hide post / saved collections / repost + share targets | ✅ Phase F |
| Messaging v2 (groups, attachments, reply/react, requests, typing/presence) | ✅ Phase G (apply migration 011) |
| Stories depth (stickers, CF audience, highlights, seen-by, DM reply) | ✅ Phase H (apply migration 012) |
| Reels polish (audio, save, comments) + Watch long-form | ✅ Phase H |
| Groups/events depth (visibility, join approval, mods, broadcasts, invites) | ✅ Phase I (apply migration 013) |
| Notification prefs / grouping / birthdays / memories | ✅ Phase J (apply migration 014) |
| Hashtags + places + ranked Explore | ✅ Phase J |
| Contextual reports (post/comment/DM/profile) | ✅ Phase K |
| Sensitive content flag + hide prefs | ✅ Phase K (apply migration 015) |
| TOTP MFA UX (Supabase Auth) | ✅ Phase K |
| Login events + activity log | ✅ Phase K |
| Data export + hard delete (Netlify Fns) | ✅ Phase K (needs deploy + service role) |
| i18n shell + reduce motion + mobile theme pref | ✅ Phase K |
| Alt text on create (web + mobile) | ✅ Phase K |
| Stories (create, 24h list, view) | ✅ |
| Reels (create/list/like) | ✅ |
| Explore + Search (debounced) | ✅ |
| Messaging + Realtime inserts | ✅ |
| Notifications (list/read; DB triggers for like/comment/follow/message) | ✅ |
| Groups + Events | ✅ |
| Saved posts | ✅ |
| Blocks + Reports + Deactivate | ✅ |
| Dark mode (persisted) | ✅ Web + Mobile theme preference |
| RLS + storage buckets (avatars, covers, posts, stories, reels, messages) | ✅ Migration 004 applied |
| Optimistic UI (like/save/share/follow/comment/message/profile) | ✅ Core helpers + screens |

## Remaining polish (not blockers for core social loop)

- Comment media attachments
- Soft-delete post UI affordance everywhere
- Virtualized mega-lists / more cursor pages on every screen
- OAuth (Google button still disabled placeholder)
- Rich post cards inside DM threads (share-to-DM is text link today)
- Login alert email via SMTP (in-app system notify on sign-in is live)
- Expo push delivery Edge Function
- Deploy Netlify account-export / account-delete functions for hard delete + export in production

## Run

```powershell
cd <project-root>
npm run dev:social-web
npm run dev:social-mobile
```

Web build: `npm run build -w @viora/web` (passing).
