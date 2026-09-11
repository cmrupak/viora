-- Viora Phase 5+: Extended social (reactions, friends, stories, reels, groups, events)
-- Additive only — does not drop existing data. Reuses public.set_updated_at().

-- ---------------------------------------------------------------------------
-- Profiles: extended fields
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists cover_url text,
  add column if not exists website text,
  add column if not exists location text,
  add column if not exists date_of_birth date,
  add column if not exists is_private boolean not null default false;

-- ---------------------------------------------------------------------------
-- post_reactions
-- ---------------------------------------------------------------------------
create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null
    check (reaction in ('love', 'haha', 'wow', 'sad', 'angry')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_reactions_post_user_unique unique (post_id, user_id)
);

create index if not exists post_reactions_post_id_idx on public.post_reactions (post_id);
create index if not exists post_reactions_user_id_idx on public.post_reactions (user_id);

drop trigger if exists post_reactions_set_updated_at on public.post_reactions;
create trigger post_reactions_set_updated_at
before update on public.post_reactions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- friend_requests
-- ---------------------------------------------------------------------------
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_no_self check (from_user_id <> to_user_id),
  constraint friend_requests_pair_unique unique (from_user_id, to_user_id)
);

create index if not exists friend_requests_from_user_id_idx on public.friend_requests (from_user_id);
create index if not exists friend_requests_to_user_id_idx on public.friend_requests (to_user_id);
create index if not exists friend_requests_status_idx on public.friend_requests (status);

drop trigger if exists friend_requests_set_updated_at on public.friend_requests;
create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- friendships (canonical ordered pair: user_a < user_b)
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_pair_unique unique (user_a, user_b)
);

create index if not exists friendships_user_a_idx on public.friendships (user_a);
create index if not exists friendships_user_b_idx on public.friendships (user_b);

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- stories + story_media + story_views
-- ---------------------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stories_author_id_idx on public.stories (author_id);
create index if not exists stories_expires_at_idx on public.stories (expires_at);
create index if not exists stories_active_idx on public.stories (author_id, expires_at)
  where deleted_at is null;

drop trigger if exists stories_set_updated_at on public.stories;
create trigger stories_set_updated_at
before update on public.stories
for each row execute function public.set_updated_at();

create table if not exists public.story_media (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  url text not null,
  media_type text not null
    check (media_type in ('image', 'video')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_media_story_id_idx on public.story_media (story_id, sort_order);

drop trigger if exists story_media_set_updated_at on public.story_media;
create trigger story_media_set_updated_at
before update on public.story_media
for each row execute function public.set_updated_at();

create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint story_views_story_viewer_unique unique (story_id, viewer_id)
);

create index if not exists story_views_story_id_idx on public.story_views (story_id);
create index if not exists story_views_viewer_id_idx on public.story_views (viewer_id);

-- ---------------------------------------------------------------------------
-- reels + reel_media + reel_likes + reel_comments
-- ---------------------------------------------------------------------------
create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  caption text not null default '',
  like_count integer not null default 0,
  comment_count integer not null default 0,
  view_count integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reels_author_id_idx on public.reels (author_id);
create index if not exists reels_created_at_idx on public.reels (created_at desc);
create index if not exists reels_deleted_at_idx on public.reels (deleted_at)
  where deleted_at is null;

drop trigger if exists reels_set_updated_at on public.reels;
create trigger reels_set_updated_at
before update on public.reels
for each row execute function public.set_updated_at();

create table if not exists public.reel_media (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels (id) on delete cascade,
  url text not null,
  media_type text not null default 'video'
    check (media_type in ('image', 'video')),
  thumbnail_url text,
  duration_seconds numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reel_media_reel_id_idx on public.reel_media (reel_id, sort_order);

drop trigger if exists reel_media_set_updated_at on public.reel_media;
create trigger reel_media_set_updated_at
before update on public.reel_media
for each row execute function public.set_updated_at();

create table if not exists public.reel_likes (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reel_likes_reel_user_unique unique (reel_id, user_id)
);

create index if not exists reel_likes_user_id_idx on public.reel_likes (user_id);
create index if not exists reel_likes_reel_id_idx on public.reel_likes (reel_id);

create table if not exists public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.reel_comments (id) on delete cascade,
  body text not null,
  like_count integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reel_comments_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists reel_comments_reel_id_idx on public.reel_comments (reel_id, created_at);
create index if not exists reel_comments_parent_id_idx on public.reel_comments (parent_id);
create index if not exists reel_comments_author_id_idx on public.reel_comments (author_id);

drop trigger if exists reel_comments_set_updated_at on public.reel_comments;
create trigger reel_comments_set_updated_at
before update on public.reel_comments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- message_attachments
-- ---------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  url text not null,
  media_type text not null
    check (media_type in ('image', 'video', 'audio', 'file')),
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_attachments_message_id_idx
  on public.message_attachments (message_id);

drop trigger if exists message_attachments_set_updated_at on public.message_attachments;
create trigger message_attachments_set_updated_at
before update on public.message_attachments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- groups + group_members + group_posts
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  cover_url text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_not_empty check (length(trim(name)) > 0)
);

create index if not exists groups_owner_id_idx on public.groups (owner_id);
create index if not exists groups_is_private_idx on public.groups (is_private);

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_members_unique unique (group_id, user_id)
);

create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists group_members_group_id_idx on public.group_members (group_id);

drop trigger if exists group_members_set_updated_at on public.group_members;
create trigger group_members_set_updated_at
before update on public.group_members
for each row execute function public.set_updated_at();

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_posts_post_unique unique (post_id)
);

create index if not exists group_posts_group_id_idx on public.group_posts (group_id, created_at desc);

drop trigger if exists group_posts_set_updated_at on public.group_posts;
create trigger group_posts_set_updated_at
before update on public.group_posts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- events + event_members
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_url text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  host_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_empty check (length(trim(title)) > 0),
  constraint events_ends_after_starts check (ends_at is null or ends_at >= starts_at)
);

create index if not exists events_host_id_idx on public.events (host_id);
create index if not exists events_starts_at_idx on public.events (starts_at);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create table if not exists public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'interested'
    check (status in ('going', 'interested', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_members_unique unique (event_id, user_id)
);

create index if not exists event_members_user_id_idx on public.event_members (user_id);
create index if not exists event_members_event_id_idx on public.event_members (event_id);

drop trigger if exists event_members_set_updated_at on public.event_members;
create trigger event_members_set_updated_at
before update on public.event_members
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  );
$$;

create or replace function public.can_view_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.is_private = false
        or g.owner_id = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = g.id
            and gm.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner', 'admin')
  )
  or exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Counter triggers (reels)
-- ---------------------------------------------------------------------------
create or replace function public.bump_reel_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.reels set like_count = like_count + 1 where id = new.reel_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.reels set like_count = greatest(like_count - 1, 0) where id = old.reel_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists reel_likes_bump_count on public.reel_likes;
create trigger reel_likes_bump_count
after insert or delete on public.reel_likes
for each row execute function public.bump_reel_like_count();

create or replace function public.bump_reel_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.deleted_at is null then
    update public.reels set comment_count = comment_count + 1 where id = new.reel_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.reels set comment_count = greatest(comment_count - 1, 0) where id = new.reel_id;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.reels set comment_count = comment_count + 1 where id = new.reel_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' and old.deleted_at is null then
    update public.reels set comment_count = greatest(comment_count - 1, 0) where id = old.reel_id;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reel_comments_bump_count on public.reel_comments;
create trigger reel_comments_bump_count
after insert or update or delete on public.reel_comments
for each row execute function public.bump_reel_comment_count();

-- Auto-add owner as group member on group create
create or replace function public.add_group_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do update
  set role = 'owner';
  return new;
end;
$$;

drop trigger if exists groups_add_owner_member on public.groups;
create trigger groups_add_owner_member
after insert on public.groups
for each row execute function public.add_group_owner_member();

-- Accept friend request → create friendship row
create or replace function public.friend_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from 'accepted'
     and new.status = 'accepted' then
    if new.from_user_id < new.to_user_id then
      a := new.from_user_id;
      b := new.to_user_id;
    else
      a := new.to_user_id;
      b := new.from_user_id;
    end if;
    insert into public.friendships (user_a, user_b)
    values (a, b)
    on conflict (user_a, user_b) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists friend_requests_on_accepted on public.friend_requests;
create trigger friend_requests_on_accepted
after update on public.friend_requests
for each row execute function public.friend_request_accepted();

-- ---------------------------------------------------------------------------
-- Notification triggers (security definer) — match notifications columns from 003
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
begin
  select author_id into post_author
  from public.posts
  where id = new.post_id;

  if post_author is not null and post_author <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id, body)
    values (post_author, new.user_id, 'like', new.post_id, 'liked your post');
  end if;

  return new;
end;
$$;

drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify
after insert on public.post_likes
for each row execute function public.notify_on_post_like();

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
  parent_author uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select author_id into post_author
  from public.posts
  where id = new.post_id;

  -- reply notification to parent comment author
  if new.parent_id is not null then
    select author_id into parent_author
    from public.comments
    where id = new.parent_id;

    if parent_author is not null and parent_author <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, post_id, comment_id, body)
      values (parent_author, new.author_id, 'reply', new.post_id, new.id, 'replied to your comment');
    end if;
  end if;

  -- comment notification to post author (skip if same as parent author already notified as reply)
  if post_author is not null
     and post_author <> new.author_id
     and (parent_author is null or parent_author <> post_author) then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id, body)
    values (post_author, new.author_id, 'comment', new.post_id, new.id, 'commented on your post');
  end if;

  return new;
end;
$$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
after insert on public.comments
for each row execute function public.notify_on_comment();

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.following_id <> new.follower_id then
    insert into public.notifications (user_id, actor_id, type, body)
    values (new.following_id, new.follower_id, 'follow', 'started following you');
  end if;
  return new;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
after insert on public.follows
for each row execute function public.notify_on_follow();

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, type, conversation_id, body)
  select
    cm.user_id,
    new.sender_id,
    'message',
    new.conversation_id,
    left(coalesce(new.body, ''), 120)
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
after insert on public.messages
for each row execute function public.notify_on_message();

-- ---------------------------------------------------------------------------
-- Realtime publication (exception-safe if already added)
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.post_likes;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- RLS enable
-- ---------------------------------------------------------------------------
alter table public.post_reactions enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.stories enable row level security;
alter table public.story_media enable row level security;
alter table public.story_views enable row level security;
alter table public.reels enable row level security;
alter table public.reel_media enable row level security;
alter table public.reel_likes enable row level security;
alter table public.reel_comments enable row level security;
alter table public.message_attachments enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_posts enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;

-- ---------------------------------------------------------------------------
-- RLS policies: post_reactions
-- ---------------------------------------------------------------------------
drop policy if exists "Post reactions viewable by authenticated" on public.post_reactions;
create policy "Post reactions viewable by authenticated"
on public.post_reactions for select to authenticated using (true);

drop policy if exists "Users can react as themselves" on public.post_reactions;
create policy "Users can react as themselves"
on public.post_reactions for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own reactions" on public.post_reactions;
create policy "Users can update own reactions"
on public.post_reactions for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can remove own reactions" on public.post_reactions;
create policy "Users can remove own reactions"
on public.post_reactions for delete to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RLS policies: friend_requests
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view own friend requests" on public.friend_requests;
create policy "Users can view own friend requests"
on public.friend_requests for select to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "Users can send friend requests as themselves" on public.friend_requests;
create policy "Users can send friend requests as themselves"
on public.friend_requests for insert to authenticated
with check (auth.uid() = from_user_id);

drop policy if exists "Participants can update friend requests" on public.friend_requests;
create policy "Participants can update friend requests"
on public.friend_requests for update to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id)
with check (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "Sender can cancel friend requests" on public.friend_requests;
create policy "Sender can cancel friend requests"
on public.friend_requests for delete to authenticated
using (auth.uid() = from_user_id);

-- ---------------------------------------------------------------------------
-- RLS policies: friendships
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view own friendships" on public.friendships;
create policy "Users can view own friendships"
on public.friendships for select to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "Users can create friendships involving self" on public.friendships;
create policy "Users can create friendships involving self"
on public.friendships for insert to authenticated
with check (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "Users can delete own friendships" on public.friendships;
create policy "Users can delete own friendships"
on public.friendships for delete to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

-- ---------------------------------------------------------------------------
-- RLS policies: stories
-- ---------------------------------------------------------------------------
drop policy if exists "Active stories viewable by authenticated" on public.stories;
create policy "Active stories viewable by authenticated"
on public.stories for select to authenticated
using (
  deleted_at is null
  and expires_at > now()
  or author_id = auth.uid()
);

drop policy if exists "Users can create own stories" on public.stories;
create policy "Users can create own stories"
on public.stories for insert to authenticated
with check (auth.uid() = author_id);

drop policy if exists "Users can update own stories" on public.stories;
create policy "Users can update own stories"
on public.stories for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "Users can delete own stories" on public.stories;
create policy "Users can delete own stories"
on public.stories for delete to authenticated
using (auth.uid() = author_id);

-- story_media
drop policy if exists "Story media viewable with story" on public.story_media;
create policy "Story media viewable with story"
on public.story_media for select to authenticated
using (
  exists (
    select 1 from public.stories s
    where s.id = story_id
      and (
        (s.deleted_at is null and s.expires_at > now())
        or s.author_id = auth.uid()
      )
  )
);

drop policy if exists "Authors can insert story media" on public.story_media;
create policy "Authors can insert story media"
on public.story_media for insert to authenticated
with check (
  exists (
    select 1 from public.stories s
    where s.id = story_id and s.author_id = auth.uid()
  )
);

drop policy if exists "Authors can update story media" on public.story_media;
create policy "Authors can update story media"
on public.story_media for update to authenticated
using (
  exists (
    select 1 from public.stories s
    where s.id = story_id and s.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.stories s
    where s.id = story_id and s.author_id = auth.uid()
  )
);

drop policy if exists "Authors can delete story media" on public.story_media;
create policy "Authors can delete story media"
on public.story_media for delete to authenticated
using (
  exists (
    select 1 from public.stories s
    where s.id = story_id and s.author_id = auth.uid()
  )
);

-- story_views
drop policy if exists "Story views readable by story author or viewer" on public.story_views;
create policy "Story views readable by story author or viewer"
on public.story_views for select to authenticated
using (
  auth.uid() = viewer_id
  or exists (
    select 1 from public.stories s
    where s.id = story_id and s.author_id = auth.uid()
  )
);

drop policy if exists "Users can insert own story views" on public.story_views;
create policy "Users can insert own story views"
on public.story_views for insert to authenticated
with check (auth.uid() = viewer_id);

-- ---------------------------------------------------------------------------
-- RLS policies: reels
-- ---------------------------------------------------------------------------
drop policy if exists "Active reels viewable by authenticated" on public.reels;
create policy "Active reels viewable by authenticated"
on public.reels for select to authenticated
using (deleted_at is null or author_id = auth.uid());

drop policy if exists "Users can create own reels" on public.reels;
create policy "Users can create own reels"
on public.reels for insert to authenticated
with check (auth.uid() = author_id);

drop policy if exists "Users can update own reels" on public.reels;
create policy "Users can update own reels"
on public.reels for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "Users can delete own reels" on public.reels;
create policy "Users can delete own reels"
on public.reels for delete to authenticated
using (auth.uid() = author_id);

-- reel_media
drop policy if exists "Reel media viewable with reel" on public.reel_media;
create policy "Reel media viewable with reel"
on public.reel_media for select to authenticated
using (
  exists (
    select 1 from public.reels r
    where r.id = reel_id
      and (r.deleted_at is null or r.author_id = auth.uid())
  )
);

drop policy if exists "Authors can insert reel media" on public.reel_media;
create policy "Authors can insert reel media"
on public.reel_media for insert to authenticated
with check (
  exists (
    select 1 from public.reels r
    where r.id = reel_id and r.author_id = auth.uid()
  )
);

drop policy if exists "Authors can update reel media" on public.reel_media;
create policy "Authors can update reel media"
on public.reel_media for update to authenticated
using (
  exists (
    select 1 from public.reels r
    where r.id = reel_id and r.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.reels r
    where r.id = reel_id and r.author_id = auth.uid()
  )
);

drop policy if exists "Authors can delete reel media" on public.reel_media;
create policy "Authors can delete reel media"
on public.reel_media for delete to authenticated
using (
  exists (
    select 1 from public.reels r
    where r.id = reel_id and r.author_id = auth.uid()
  )
);

-- reel_likes
drop policy if exists "Reel likes viewable by authenticated" on public.reel_likes;
create policy "Reel likes viewable by authenticated"
on public.reel_likes for select to authenticated using (true);

drop policy if exists "Users can like reels as themselves" on public.reel_likes;
create policy "Users can like reels as themselves"
on public.reel_likes for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can unlike reels themselves" on public.reel_likes;
create policy "Users can unlike reels themselves"
on public.reel_likes for delete to authenticated
using (auth.uid() = user_id);

-- reel_comments
drop policy if exists "Active reel comments viewable by authenticated" on public.reel_comments;
create policy "Active reel comments viewable by authenticated"
on public.reel_comments for select to authenticated
using (deleted_at is null or author_id = auth.uid());

drop policy if exists "Users can create own reel comments" on public.reel_comments;
create policy "Users can create own reel comments"
on public.reel_comments for insert to authenticated
with check (auth.uid() = author_id);

drop policy if exists "Users can update own reel comments" on public.reel_comments;
create policy "Users can update own reel comments"
on public.reel_comments for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "Users can delete own reel comments" on public.reel_comments;
create policy "Users can delete own reel comments"
on public.reel_comments for delete to authenticated
using (auth.uid() = author_id);

-- ---------------------------------------------------------------------------
-- RLS policies: message_attachments (via messages → conversation_members)
-- ---------------------------------------------------------------------------
drop policy if exists "Members can view message attachments" on public.message_attachments;
create policy "Members can view message attachments"
on public.message_attachments for select to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_id
      and public.is_conversation_member(m.conversation_id)
  )
);

drop policy if exists "Senders can insert message attachments" on public.message_attachments;
create policy "Senders can insert message attachments"
on public.message_attachments for insert to authenticated
with check (
  exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.sender_id = auth.uid()
      and public.is_conversation_member(m.conversation_id)
  )
);

drop policy if exists "Senders can update message attachments" on public.message_attachments;
create policy "Senders can update message attachments"
on public.message_attachments for update to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.sender_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.sender_id = auth.uid()
  )
);

drop policy if exists "Senders can delete message attachments" on public.message_attachments;
create policy "Senders can delete message attachments"
on public.message_attachments for delete to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.sender_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- RLS policies: groups
-- ---------------------------------------------------------------------------
drop policy if exists "Public groups or members can view groups" on public.groups;
create policy "Public groups or members can view groups"
on public.groups for select to authenticated
using (
  is_private = false
  or owner_id = auth.uid()
  or public.is_group_member(id)
);

drop policy if exists "Users can create groups as owner" on public.groups;
create policy "Users can create groups as owner"
on public.groups for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Owners and admins can update groups" on public.groups;
create policy "Owners and admins can update groups"
on public.groups for update to authenticated
using (public.is_group_admin(id))
with check (public.is_group_admin(id));

drop policy if exists "Owners can delete groups" on public.groups;
create policy "Owners can delete groups"
on public.groups for delete to authenticated
using (auth.uid() = owner_id);

-- group_members
drop policy if exists "Visible group members readable" on public.group_members;
create policy "Visible group members readable"
on public.group_members for select to authenticated
using (public.can_view_group(group_id));

drop policy if exists "Users can join public groups as themselves" on public.group_members;
create policy "Users can join public groups as themselves"
on public.group_members for insert to authenticated
with check (
  auth.uid() = user_id
  and (
    public.is_group_admin(group_id)
    or exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.is_private = false or g.owner_id = auth.uid())
    )
  )
);

drop policy if exists "Admins can add group members" on public.group_members;
create policy "Admins can add group members"
on public.group_members for insert to authenticated
with check (public.is_group_admin(group_id));

drop policy if exists "Admins or self can update group membership" on public.group_members;
create policy "Admins or self can update group membership"
on public.group_members for update to authenticated
using (public.is_group_admin(group_id) or auth.uid() = user_id)
with check (public.is_group_admin(group_id) or auth.uid() = user_id);

drop policy if exists "Admins or self can leave group" on public.group_members;
create policy "Admins or self can leave group"
on public.group_members for delete to authenticated
using (public.is_group_admin(group_id) or auth.uid() = user_id);

-- group_posts
drop policy if exists "Group posts viewable when group visible" on public.group_posts;
create policy "Group posts viewable when group visible"
on public.group_posts for select to authenticated
using (public.can_view_group(group_id));

drop policy if exists "Group members can link posts" on public.group_posts;
create policy "Group members can link posts"
on public.group_posts for insert to authenticated
with check (
  public.is_group_member(group_id)
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

drop policy if exists "Authors or admins can unlink group posts" on public.group_posts;
create policy "Authors or admins can unlink group posts"
on public.group_posts for delete to authenticated
using (
  public.is_group_admin(group_id)
  or exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- RLS policies: events
-- ---------------------------------------------------------------------------
drop policy if exists "Events viewable by authenticated" on public.events;
create policy "Events viewable by authenticated"
on public.events for select to authenticated using (true);

drop policy if exists "Users can create events as host" on public.events;
create policy "Users can create events as host"
on public.events for insert to authenticated
with check (auth.uid() = host_id);

drop policy if exists "Hosts can update own events" on public.events;
create policy "Hosts can update own events"
on public.events for update to authenticated
using (auth.uid() = host_id)
with check (auth.uid() = host_id);

drop policy if exists "Hosts can delete own events" on public.events;
create policy "Hosts can delete own events"
on public.events for delete to authenticated
using (auth.uid() = host_id);

-- event_members
drop policy if exists "Event members viewable by authenticated" on public.event_members;
create policy "Event members viewable by authenticated"
on public.event_members for select to authenticated using (true);

drop policy if exists "Users can RSVP as themselves" on public.event_members;
create policy "Users can RSVP as themselves"
on public.event_members for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own RSVP" on public.event_members;
create policy "Users can update own RSVP"
on public.event_members for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can remove own RSVP" on public.event_members;
create policy "Users can remove own RSVP"
on public.event_members for delete to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage buckets: covers, stories, reels, messages
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'covers',
  'covers',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reels',
  'reels',
  true,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messages',
  'messages',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- covers storage policies
drop policy if exists "Cover images are publicly accessible" on storage.objects;
create policy "Cover images are publicly accessible"
on storage.objects for select to public
using (bucket_id = 'covers');

drop policy if exists "Users can upload own covers" on storage.objects;
create policy "Users can upload own covers"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own covers" on storage.objects;
create policy "Users can update own covers"
on storage.objects for update to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own covers" on storage.objects;
create policy "Users can delete own covers"
on storage.objects for delete to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- stories storage policies
drop policy if exists "Story media files are publicly accessible" on storage.objects;
create policy "Story media files are publicly accessible"
on storage.objects for select to public
using (bucket_id = 'stories');

drop policy if exists "Users can upload own stories" on storage.objects;
create policy "Users can upload own stories"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own stories files" on storage.objects;
create policy "Users can update own stories files"
on storage.objects for update to authenticated
using (
  bucket_id = 'stories'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own stories files" on storage.objects;
create policy "Users can delete own stories files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- reels storage policies
drop policy if exists "Reel media files are publicly accessible" on storage.objects;
create policy "Reel media files are publicly accessible"
on storage.objects for select to public
using (bucket_id = 'reels');

drop policy if exists "Users can upload own reels" on storage.objects;
create policy "Users can upload own reels"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'reels'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own reels files" on storage.objects;
create policy "Users can update own reels files"
on storage.objects for update to authenticated
using (
  bucket_id = 'reels'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'reels'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own reels files" on storage.objects;
create policy "Users can delete own reels files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'reels'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- messages storage policies (private bucket; own-folder upload/read)
drop policy if exists "Users can read own message files" on storage.objects;
create policy "Users can read own message files"
on storage.objects for select to authenticated
using (
  bucket_id = 'messages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload own message files" on storage.objects;
create policy "Users can upload own message files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'messages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own message files" on storage.objects;
create policy "Users can update own message files"
on storage.objects for update to authenticated
using (
  bucket_id = 'messages'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'messages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own message files" on storage.objects;
create policy "Users can delete own message files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'messages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- Grants for helper functions
-- ---------------------------------------------------------------------------
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.can_view_group(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
