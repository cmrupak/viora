-- Viora Phase J: notifications prefs + discovery (hashtags, trending, places)
-- Additive only. Push token storage (Expo delivery via Edge later).

-- ---------------------------------------------------------------------------
-- Notification category prefs
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  likes boolean not null default true,
  comments boolean not null default true,
  follows boolean not null default true,
  messages boolean not null default true,
  mentions boolean not null default true,
  shares boolean not null default true,
  birthdays boolean not null default true,
  memories boolean not null default true,
  push_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_prefs_set_updated_at on public.notification_prefs;
create trigger notification_prefs_set_updated_at
before update on public.notification_prefs
for each row execute function public.set_updated_at();

alter table public.notification_prefs enable row level security;

drop policy if exists "Users manage own notification prefs" on public.notification_prefs;
create policy "Users manage own notification prefs"
on public.notification_prefs for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Push tokens (Expo / web)
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null default 'expo'
    check (platform in ('expo', 'web', 'android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_user_token_unique unique (user_id, token)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

drop policy if exists "Users manage own push tokens" on public.push_tokens;
create policy "Users manage own push tokens"
on public.push_tokens for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Notifications: grouping key + birthday/memory types
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists group_key text;

create index if not exists notifications_group_key_idx
  on public.notifications (user_id, group_key, created_at desc)
  where group_key is not null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'reply', 'follow', 'mention', 'share', 'message', 'system',
    'birthday', 'memory'
  ));

-- ---------------------------------------------------------------------------
-- Hashtags
-- ---------------------------------------------------------------------------
create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  post_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hashtags_tag_not_empty check (length(trim(tag)) > 0),
  constraint hashtags_tag_unique unique (tag)
);

create index if not exists hashtags_post_count_idx on public.hashtags (post_count desc);

drop trigger if exists hashtags_set_updated_at on public.hashtags;
create trigger hashtags_set_updated_at
before update on public.hashtags
for each row execute function public.set_updated_at();

create table if not exists public.post_hashtags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  hashtag_id uuid not null references public.hashtags (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_hashtags_unique unique (post_id, hashtag_id)
);

create index if not exists post_hashtags_hashtag_id_idx on public.post_hashtags (hashtag_id);
create index if not exists post_hashtags_post_id_idx on public.post_hashtags (post_id);

alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;

drop policy if exists "Hashtags readable by authenticated" on public.hashtags;
create policy "Hashtags readable by authenticated"
on public.hashtags for select to authenticated using (true);

drop policy if exists "Authenticated upsert hashtags" on public.hashtags;
create policy "Authenticated upsert hashtags"
on public.hashtags for insert to authenticated with check (true);

drop policy if exists "Authenticated update hashtag counts" on public.hashtags;
create policy "Authenticated update hashtag counts"
on public.hashtags for update to authenticated using (true) with check (true);

drop policy if exists "Post hashtags readable when post visible" on public.post_hashtags;
create policy "Post hashtags readable when post visible"
on public.post_hashtags for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id and public.can_view_post(p.id, auth.uid())
  )
);

drop policy if exists "Authors link hashtags on own posts" on public.post_hashtags;
create policy "Authors link hashtags on own posts"
on public.post_hashtags for insert to authenticated
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

drop policy if exists "Authors remove hashtags on own posts" on public.post_hashtags;
create policy "Authors remove hashtags on own posts"
on public.post_hashtags for delete to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

-- Sync hashtags from post body
create or replace function public.sync_post_hashtags(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  body_text text;
  tag text;
  hid uuid;
  tags text[];
begin
  select body into body_text from public.posts where id = p_post_id;
  if body_text is null then
    return;
  end if;

  -- Extract unique lowercase hashtags (#word)
  select array_agg(distinct lower(m[1]))
  into tags
  from regexp_matches(body_text, '#([A-Za-z0-9_]{2,50})', 'g') as m;

  -- Decrement old hashtag counts then clear links
  update public.hashtags h
  set post_count = greatest(post_count - 1, 0)
  where h.id in (select hashtag_id from public.post_hashtags where post_id = p_post_id);

  delete from public.post_hashtags where post_id = p_post_id;

  if tags is null then
    return;
  end if;

  foreach tag in array tags loop
    insert into public.hashtags (tag, post_count)
    values (tag, 0)
    on conflict (tag) do nothing;

    select id into hid from public.hashtags where public.hashtags.tag = tag;

    insert into public.post_hashtags (post_id, hashtag_id)
    values (p_post_id, hid)
    on conflict do nothing;

    update public.hashtags set post_count = post_count + 1 where id = hid;
  end loop;
end;
$$;

revoke all on function public.sync_post_hashtags(uuid) from public;
grant execute on function public.sync_post_hashtags(uuid) to authenticated;

create or replace function public.trg_sync_post_hashtags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_post_hashtags(new.id);
  return new;
end;
$$;

drop trigger if exists posts_sync_hashtags on public.posts;
create trigger posts_sync_hashtags
after insert or update of body on public.posts
for each row execute function public.trg_sync_post_hashtags();

-- ---------------------------------------------------------------------------
-- Birthdays today (profiles with matching month/day)
-- ---------------------------------------------------------------------------
create or replace function public.list_birthdays_today(p_limit integer default 30)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  date_of_birth date
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.date_of_birth
  from public.profiles p
  where p.is_deactivated = false
    and p.date_of_birth is not null
    and extract(month from p.date_of_birth) = extract(month from current_date)
    and extract(day from p.date_of_birth) = extract(day from current_date)
  order by p.display_name
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.list_birthdays_today(integer) from public;
grant execute on function public.list_birthdays_today(integer) to authenticated;

-- Memories: own posts from same month-day in prior years
create or replace function public.list_memories(p_user_id uuid, p_limit integer default 20)
returns setof public.posts
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.posts p
  where p.author_id = p_user_id
    and p.deleted_at is null
    and coalesce(p.publish_status, 'published') = 'published'
    and extract(month from p.created_at) = extract(month from current_date)
    and extract(day from p.created_at) = extract(day from current_date)
    and p.created_at::date < current_date
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.list_memories(uuid, integer) from public;
grant execute on function public.list_memories(uuid, integer) to authenticated;

-- Ensure prefs row helper
create or replace function public.ensure_notification_prefs(p_user_id uuid)
returns public.notification_prefs
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.notification_prefs;
begin
  insert into public.notification_prefs (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into row from public.notification_prefs where user_id = p_user_id;
  return row;
end;
$$;

revoke all on function public.ensure_notification_prefs(uuid) from public;
grant execute on function public.ensure_notification_prefs(uuid) to authenticated;

-- Backfill hashtags for existing posts (best-effort, capped)
do $$
declare
  r record;
begin
  for r in
    select id from public.posts
    where deleted_at is null and body ~ '#'
    order by created_at desc
    limit 500
  loop
    perform public.sync_post_hashtags(r.id);
  end loop;
end $$;
