-- Viora Phase H: stories & reels depth
-- Stickers, highlights, close-friends audience, story→DM reply, viewers,
-- reel audio/saves, post video duration for Watch feed.
-- Additive only.

-- ---------------------------------------------------------------------------
-- Stories: audience (public | close_friends)
-- ---------------------------------------------------------------------------
alter table public.stories
  add column if not exists audience text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stories_audience_check'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_audience_check
      check (audience in ('public', 'close_friends'));
  end if;
end $$;

create index if not exists stories_audience_idx on public.stories (audience)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Story media: sticker overlays (JSONB array)
-- Each item: { id, type, x, y, scale?, rotation?, payload }
-- type in poll|question|quiz|countdown|music|location|mention
-- ---------------------------------------------------------------------------
alter table public.story_media
  add column if not exists stickers jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Sticker responses (poll / question / quiz)
-- ---------------------------------------------------------------------------
create table if not exists public.story_sticker_responses (
  id uuid primary key default gen_random_uuid(),
  story_media_id uuid not null references public.story_media (id) on delete cascade,
  sticker_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_sticker_responses_unique unique (story_media_id, sticker_id, user_id)
);

create index if not exists story_sticker_responses_media_idx
  on public.story_sticker_responses (story_media_id, sticker_id);

drop trigger if exists story_sticker_responses_set_updated_at on public.story_sticker_responses;
create trigger story_sticker_responses_set_updated_at
before update on public.story_sticker_responses
for each row execute function public.set_updated_at();

alter table public.story_sticker_responses enable row level security;

-- ---------------------------------------------------------------------------
-- Story highlights (persist beyond 24h via media snapshot)
-- ---------------------------------------------------------------------------
create table if not exists public.story_highlights (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  cover_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_highlights_title_not_empty check (length(trim(title)) > 0)
);

create index if not exists story_highlights_owner_id_idx on public.story_highlights (owner_id, sort_order);

drop trigger if exists story_highlights_set_updated_at on public.story_highlights;
create trigger story_highlights_set_updated_at
before update on public.story_highlights
for each row execute function public.set_updated_at();

create table if not exists public.story_highlight_items (
  id uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references public.story_highlights (id) on delete cascade,
  source_story_id uuid references public.stories (id) on delete set null,
  url text not null,
  media_type text not null
    check (media_type in ('image', 'video')),
  stickers jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists story_highlight_items_highlight_id_idx
  on public.story_highlight_items (highlight_id, sort_order);

alter table public.story_highlights enable row level security;
alter table public.story_highlight_items enable row level security;

-- ---------------------------------------------------------------------------
-- Messages: story reply deep-link
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists story_id uuid references public.stories (id) on delete set null;

create index if not exists messages_story_id_idx on public.messages (story_id)
  where story_id is not null;

-- ---------------------------------------------------------------------------
-- Reels polish: audio metadata + saves + comments_disabled
-- ---------------------------------------------------------------------------
alter table public.reels
  add column if not exists audio_title text;

alter table public.reels
  add column if not exists audio_artist text;

alter table public.reels
  add column if not exists audio_url text;

alter table public.reels
  add column if not exists comments_disabled boolean not null default false;

create table if not exists public.reel_saves (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reel_saves_unique unique (reel_id, user_id)
);

create index if not exists reel_saves_user_id_idx on public.reel_saves (user_id);
create index if not exists reel_saves_reel_id_idx on public.reel_saves (reel_id);

alter table public.reel_saves enable row level security;

-- ---------------------------------------------------------------------------
-- Post media duration (Watch / long-form filter)
-- ---------------------------------------------------------------------------
alter table public.post_media
  add column if not exists duration_seconds numeric;

create index if not exists post_media_video_duration_idx
  on public.post_media (duration_seconds)
  where media_type = 'video';

-- ---------------------------------------------------------------------------
-- can_view_story
-- ---------------------------------------------------------------------------
create or replace function public.can_view_story(p_story_id uuid, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.stories where id = p_story_id;
  if not found then
    return false;
  end if;

  if s.deleted_at is not null then
    return false;
  end if;

  -- Author always (including expired — for highlights / insights)
  if s.author_id = p_viewer then
    return true;
  end if;

  if s.expires_at <= now() then
    return false;
  end if;

  -- Block either direction
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = p_viewer and b.blocked_id = s.author_id)
       or (b.blocker_id = s.author_id and b.blocked_id = p_viewer)
  ) then
    return false;
  end if;

  if s.audience = 'close_friends' then
    return exists (
      select 1 from public.close_friends cf
      where cf.owner_id = s.author_id
        and cf.friend_id = p_viewer
    );
  end if;

  -- public audience
  return true;
end;
$$;

revoke all on function public.can_view_story(uuid, uuid) from public;
grant execute on function public.can_view_story(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tighten stories / story_media SELECT
-- ---------------------------------------------------------------------------
drop policy if exists "Active stories viewable by authenticated" on public.stories;
create policy "Stories viewable when allowed"
on public.stories for select to authenticated
using (public.can_view_story(id, auth.uid()));

drop policy if exists "Story media viewable with story" on public.story_media;
create policy "Story media viewable with story"
on public.story_media for select to authenticated
using (public.can_view_story(story_id, auth.uid()));

-- Sticker responses
drop policy if exists "View sticker responses if can view story" on public.story_sticker_responses;
create policy "View sticker responses if can view story"
on public.story_sticker_responses for select to authenticated
using (
  exists (
    select 1 from public.story_media sm
    where sm.id = story_media_id
      and public.can_view_story(sm.story_id, auth.uid())
  )
);

drop policy if exists "Users respond to stickers as themselves" on public.story_sticker_responses;
create policy "Users respond to stickers as themselves"
on public.story_sticker_responses for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.story_media sm
    where sm.id = story_media_id
      and public.can_view_story(sm.story_id, auth.uid())
  )
);

drop policy if exists "Users update own sticker responses" on public.story_sticker_responses;
create policy "Users update own sticker responses"
on public.story_sticker_responses for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own sticker responses" on public.story_sticker_responses;
create policy "Users delete own sticker responses"
on public.story_sticker_responses for delete to authenticated
using (auth.uid() = user_id);

-- Highlights: public read of others' highlights; owner manages
drop policy if exists "Highlights viewable by authenticated" on public.story_highlights;
create policy "Highlights viewable by authenticated"
on public.story_highlights for select to authenticated
using (
  owner_id = auth.uid()
  or not exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = owner_id)
       or (b.blocker_id = owner_id and b.blocked_id = auth.uid())
  )
);

drop policy if exists "Owners manage highlights" on public.story_highlights;
create policy "Owners manage highlights"
on public.story_highlights for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Highlight items viewable with highlight" on public.story_highlight_items;
create policy "Highlight items viewable with highlight"
on public.story_highlight_items for select to authenticated
using (
  exists (
    select 1 from public.story_highlights h
    where h.id = highlight_id
      and (
        h.owner_id = auth.uid()
        or not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = auth.uid() and b.blocked_id = h.owner_id)
             or (b.blocker_id = h.owner_id and b.blocked_id = auth.uid())
        )
      )
  )
);

drop policy if exists "Owners manage highlight items" on public.story_highlight_items;
create policy "Owners manage highlight items"
on public.story_highlight_items for all to authenticated
using (
  exists (
    select 1 from public.story_highlights h
    where h.id = highlight_id and h.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.story_highlights h
    where h.id = highlight_id and h.owner_id = auth.uid()
  )
);

-- Reel saves
drop policy if exists "Users manage own reel saves" on public.reel_saves;
create policy "Users manage own reel saves"
on public.reel_saves for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Reel saves readable by owner" on public.reel_saves;
create policy "Reel saves readable by owner"
on public.reel_saves for select to authenticated
using (auth.uid() = user_id);
