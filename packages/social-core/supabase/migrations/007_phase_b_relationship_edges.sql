-- Viora Phase B: mute / restrict / snooze / close friends / favorites
-- Additive only.

-- ---------------------------------------------------------------------------
-- user_mutes: hide posts and/or stories from a person
-- ---------------------------------------------------------------------------
create table if not exists public.user_mutes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null default 'all'
    check (scope in ('posts', 'stories', 'all')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_mutes_no_self check (owner_id <> target_id),
  constraint user_mutes_owner_target_unique unique (owner_id, target_id)
);

create index if not exists user_mutes_owner_id_idx on public.user_mutes (owner_id);
create index if not exists user_mutes_target_id_idx on public.user_mutes (target_id);

drop trigger if exists user_mutes_set_updated_at on public.user_mutes;
create trigger user_mutes_set_updated_at
before update on public.user_mutes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_restricts: limit interaction (IG-style restrict)
-- ---------------------------------------------------------------------------
create table if not exists public.user_restricts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_restricts_no_self check (owner_id <> target_id),
  constraint user_restricts_owner_target_unique unique (owner_id, target_id)
);

create index if not exists user_restricts_owner_id_idx on public.user_restricts (owner_id);
create index if not exists user_restricts_target_id_idx on public.user_restricts (target_id);

drop trigger if exists user_restricts_set_updated_at on public.user_restricts;
create trigger user_restricts_set_updated_at
before update on public.user_restricts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_snoozes: hide posts+stories for a period (default 30 days)
-- ---------------------------------------------------------------------------
create table if not exists public.user_snoozes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_snoozes_no_self check (owner_id <> target_id),
  constraint user_snoozes_owner_target_unique unique (owner_id, target_id)
);

create index if not exists user_snoozes_owner_id_idx on public.user_snoozes (owner_id);
create index if not exists user_snoozes_expires_at_idx on public.user_snoozes (expires_at);

drop trigger if exists user_snoozes_set_updated_at on public.user_snoozes;
create trigger user_snoozes_set_updated_at
before update on public.user_snoozes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- close_friends
-- ---------------------------------------------------------------------------
create table if not exists public.close_friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint close_friends_no_self check (owner_id <> friend_id),
  constraint close_friends_owner_friend_unique unique (owner_id, friend_id)
);

create index if not exists close_friends_owner_id_idx on public.close_friends (owner_id);
create index if not exists close_friends_friend_id_idx on public.close_friends (friend_id);

drop trigger if exists close_friends_set_updated_at on public.close_friends;
create trigger close_friends_set_updated_at
before update on public.close_friends
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- feed_favorites: prioritize these authors in following feed
-- ---------------------------------------------------------------------------
create table if not exists public.feed_favorites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_favorites_no_self check (owner_id <> target_id),
  constraint feed_favorites_owner_target_unique unique (owner_id, target_id)
);

create index if not exists feed_favorites_owner_id_idx on public.feed_favorites (owner_id);
create index if not exists feed_favorites_target_id_idx on public.feed_favorites (target_id);

drop trigger if exists feed_favorites_set_updated_at on public.feed_favorites;
create trigger feed_favorites_set_updated_at
before update on public.feed_favorites
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_mutes enable row level security;
alter table public.user_restricts enable row level security;
alter table public.user_snoozes enable row level security;
alter table public.close_friends enable row level security;
alter table public.feed_favorites enable row level security;

-- mutes: owner only
drop policy if exists "Owners manage mutes" on public.user_mutes;
create policy "Owners manage mutes"
on public.user_mutes for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- restricts: owner only (target should not know they are restricted)
drop policy if exists "Owners manage restricts" on public.user_restricts;
create policy "Owners manage restricts"
on public.user_restricts for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- snoozes: owner only
drop policy if exists "Owners manage snoozes" on public.user_snoozes;
create policy "Owners manage snoozes"
on public.user_snoozes for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- close friends: owner only
drop policy if exists "Owners manage close friends" on public.close_friends;
create policy "Owners manage close friends"
on public.close_friends for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- favorites: owner only
drop policy if exists "Owners manage feed favorites" on public.feed_favorites;
create policy "Owners manage feed favorites"
on public.feed_favorites for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Helper: author ids hidden from feed (blocks + post mutes + active snoozes)
-- ---------------------------------------------------------------------------
create or replace function public.feed_hidden_author_ids(viewer_id uuid)
returns table (author_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct x.author_id from (
    select case when blocker_id = viewer_id then blocked_id else blocker_id end as author_id
    from public.blocked_users
    where blocker_id = viewer_id or blocked_id = viewer_id

    union

    select target_id as author_id
    from public.user_mutes
    where owner_id = viewer_id and scope in ('posts', 'all')

    union

    select target_id as author_id
    from public.user_snoozes
    where owner_id = viewer_id and expires_at > now()
  ) x
  where x.author_id is not null and x.author_id <> viewer_id;
$$;

revoke all on function public.feed_hidden_author_ids(uuid) from public;
grant execute on function public.feed_hidden_author_ids(uuid) to authenticated;

create or replace function public.story_hidden_author_ids(viewer_id uuid)
returns table (author_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct x.author_id from (
    select case when blocker_id = viewer_id then blocked_id else blocker_id end as author_id
    from public.blocked_users
    where blocker_id = viewer_id or blocked_id = viewer_id

    union

    select target_id as author_id
    from public.user_mutes
    where owner_id = viewer_id and scope in ('stories', 'all')

    union

    select target_id as author_id
    from public.user_snoozes
    where owner_id = viewer_id and expires_at > now()
  ) x
  where x.author_id is not null and x.author_id <> viewer_id;
$$;

revoke all on function public.story_hidden_author_ids(uuid) from public;
grant execute on function public.story_hidden_author_ids(uuid) to authenticated;
