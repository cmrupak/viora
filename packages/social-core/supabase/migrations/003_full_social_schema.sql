-- Viora Phase 4+: Full social schema
-- Additive only — does not drop existing profiles data.

-- ---------------------------------------------------------------------------
-- Profiles: add social counters + deactivation flag
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists follower_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  add column if not exists is_deactivated boolean not null default false;

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger (from 001) — reused below
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follows_no_self check (follower_id <> following_id),
  constraint follows_follower_following_unique unique (follower_id, following_id)
);

create index if not exists follows_follower_id_idx on public.follows (follower_id);
create index if not exists follows_following_id_idx on public.follows (following_id);

drop trigger if exists follows_set_updated_at on public.follows;
create trigger follows_set_updated_at
before update on public.follows
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  like_count integer not null default 0,
  comment_count integer not null default 0,
  share_count integer not null default 0,
  save_count integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_author_id_idx on public.posts (author_id);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_deleted_at_idx on public.posts (deleted_at)
  where deleted_at is null;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- post_media
-- ---------------------------------------------------------------------------
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  url text not null,
  media_type text not null default 'image'
    check (media_type in ('image', 'video')),
  sort_order integer not null default 0,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_media_post_id_idx on public.post_media (post_id, sort_order);

drop trigger if exists post_media_set_updated_at on public.post_media;
create trigger post_media_set_updated_at
before update on public.post_media
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- post_likes
-- ---------------------------------------------------------------------------
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_post_user_unique unique (post_id, user_id)
);

create index if not exists post_likes_user_id_idx on public.post_likes (user_id);
create index if not exists post_likes_post_id_idx on public.post_likes (post_id);

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null,
  like_count integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists comments_post_id_idx on public.comments (post_id, created_at);
create index if not exists comments_parent_id_idx on public.comments (parent_id);
create index if not exists comments_author_id_idx on public.comments (author_id);

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- comment_likes
-- ---------------------------------------------------------------------------
create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint comment_likes_comment_user_unique unique (comment_id, user_id)
);

create index if not exists comment_likes_user_id_idx on public.comment_likes (user_id);

-- ---------------------------------------------------------------------------
-- saved_posts
-- ---------------------------------------------------------------------------
create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_posts_user_post_unique unique (user_id, post_id)
);

create index if not exists saved_posts_post_id_idx on public.saved_posts (post_id);

-- ---------------------------------------------------------------------------
-- post_shares
-- ---------------------------------------------------------------------------
create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists post_shares_post_id_idx on public.post_shares (post_id);
create index if not exists post_shares_user_id_idx on public.post_shares (user_id);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null
    check (type in (
      'like', 'comment', 'reply', 'follow', 'mention', 'share', 'message', 'system'
    )),
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  conversation_id uuid,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where is_read = false;

drop trigger if exists notifications_set_updated_at on public.notifications;
create trigger notifications_set_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- conversations + members + messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_members_unique unique (conversation_id, user_id)
);

create index if not exists conversation_members_user_id_idx
  on public.conversation_members (user_id);

drop trigger if exists conversation_members_set_updated_at on public.conversation_members;
create trigger conversation_members_set_updated_at
before update on public.conversation_members
for each row execute function public.set_updated_at();

-- FK for notifications.conversation_id (deferred until conversations exists)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'notifications_conversation_id_fkey'
      and table_schema = 'public'
  ) then
    alter table public.notifications
      add constraint notifications_conversation_id_fkey
      foreign key (conversation_id) references public.conversations (id) on delete cascade;
  end if;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_id_idx on public.messages (sender_id);

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- blocked_users
-- ---------------------------------------------------------------------------
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_no_self check (blocker_id <> blocked_id),
  constraint blocked_users_unique unique (blocker_id, blocked_id)
);

create index if not exists blocked_users_blocked_id_idx on public.blocked_users (blocked_id);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null
    check (target_type in ('user', 'post', 'comment', 'message')),
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_target_idx on public.reports (target_type, target_id);

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Counter / membership helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.bump_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.following_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists follows_bump_counts on public.follows;
create trigger follows_bump_counts
after insert or delete on public.follows
for each row execute function public.bump_follow_counts();

create or replace function public.bump_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists post_likes_bump_count on public.post_likes;
create trigger post_likes_bump_count
after insert or delete on public.post_likes
for each row execute function public.bump_post_like_count();

create or replace function public.bump_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists comment_likes_bump_count on public.comment_likes;
create trigger comment_likes_bump_count
after insert or delete on public.comment_likes
for each row execute function public.bump_comment_like_count();

create or replace function public.bump_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.deleted_at is null then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' and old.deleted_at is null then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists comments_bump_post_count on public.comments;
create trigger comments_bump_post_count
after insert or update or delete on public.comments
for each row execute function public.bump_post_comment_count();

create or replace function public.bump_post_save_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set save_count = save_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set save_count = greatest(save_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists saved_posts_bump_count on public.saved_posts;
create trigger saved_posts_bump_count
after insert or delete on public.saved_posts
for each row execute function public.bump_post_save_count();

create or replace function public.bump_post_share_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set share_count = share_count + 1 where id = new.post_id;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists post_shares_bump_count on public.post_shares;
create trigger post_shares_bump_count
after insert on public.post_shares
for each row execute function public.bump_post_share_count();

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_on_message();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.saved_posts enable row level security;
alter table public.post_shares enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.blocked_users enable row level security;
alter table public.reports enable row level security;

-- follows
drop policy if exists "Follows are viewable by authenticated" on public.follows;
create policy "Follows are viewable by authenticated"
on public.follows for select to authenticated using (true);

drop policy if exists "Users can follow as themselves" on public.follows;
create policy "Users can follow as themselves"
on public.follows for insert to authenticated
with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow themselves" on public.follows;
create policy "Users can unfollow themselves"
on public.follows for delete to authenticated
using (auth.uid() = follower_id);

-- posts
drop policy if exists "Active posts are viewable by authenticated" on public.posts;
create policy "Active posts are viewable by authenticated"
on public.posts for select to authenticated
using (deleted_at is null or author_id = auth.uid());

drop policy if exists "Users can create own posts" on public.posts;
create policy "Users can create own posts"
on public.posts for insert to authenticated
with check (auth.uid() = author_id);

drop policy if exists "Users can update own posts" on public.posts;
create policy "Users can update own posts"
on public.posts for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "Users can delete own posts" on public.posts;
create policy "Users can delete own posts"
on public.posts for delete to authenticated
using (auth.uid() = author_id);

-- post_media
drop policy if exists "Post media viewable with post" on public.post_media;
create policy "Post media viewable with post"
on public.post_media for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and (p.deleted_at is null or p.author_id = auth.uid())
  )
);

drop policy if exists "Authors can insert post media" on public.post_media;
create policy "Authors can insert post media"
on public.post_media for insert to authenticated
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

drop policy if exists "Authors can update post media" on public.post_media;
create policy "Authors can update post media"
on public.post_media for update to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

drop policy if exists "Authors can delete post media" on public.post_media;
create policy "Authors can delete post media"
on public.post_media for delete to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

-- post_likes
drop policy if exists "Post likes viewable by authenticated" on public.post_likes;
create policy "Post likes viewable by authenticated"
on public.post_likes for select to authenticated using (true);

drop policy if exists "Users can like as themselves" on public.post_likes;
create policy "Users can like as themselves"
on public.post_likes for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can unlike themselves" on public.post_likes;
create policy "Users can unlike themselves"
on public.post_likes for delete to authenticated
using (auth.uid() = user_id);

-- comments
drop policy if exists "Active comments viewable by authenticated" on public.comments;
create policy "Active comments viewable by authenticated"
on public.comments for select to authenticated
using (deleted_at is null or author_id = auth.uid());

drop policy if exists "Users can create own comments" on public.comments;
create policy "Users can create own comments"
on public.comments for insert to authenticated
with check (auth.uid() = author_id);

drop policy if exists "Users can update own comments" on public.comments;
create policy "Users can update own comments"
on public.comments for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "Users can delete own comments" on public.comments;
create policy "Users can delete own comments"
on public.comments for delete to authenticated
using (auth.uid() = author_id);

-- comment_likes
drop policy if exists "Comment likes viewable by authenticated" on public.comment_likes;
create policy "Comment likes viewable by authenticated"
on public.comment_likes for select to authenticated using (true);

drop policy if exists "Users can like comments as themselves" on public.comment_likes;
create policy "Users can like comments as themselves"
on public.comment_likes for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can unlike comments themselves" on public.comment_likes;
create policy "Users can unlike comments themselves"
on public.comment_likes for delete to authenticated
using (auth.uid() = user_id);

-- saved_posts
drop policy if exists "Users can view own saved posts" on public.saved_posts;
create policy "Users can view own saved posts"
on public.saved_posts for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can save as themselves" on public.saved_posts;
create policy "Users can save as themselves"
on public.saved_posts for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can unsave themselves" on public.saved_posts;
create policy "Users can unsave themselves"
on public.saved_posts for delete to authenticated
using (auth.uid() = user_id);

-- post_shares
drop policy if exists "Shares viewable by authenticated" on public.post_shares;
create policy "Shares viewable by authenticated"
on public.post_shares for select to authenticated using (true);

drop policy if exists "Users can share as themselves" on public.post_shares;
create policy "Users can share as themselves"
on public.post_shares for insert to authenticated
with check (auth.uid() = user_id);

-- notifications
drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
on public.notifications for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
on public.notifications for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Authenticated can insert notifications" on public.notifications;
create policy "Authenticated can insert notifications"
on public.notifications for insert to authenticated
with check (true);

-- conversations
drop policy if exists "Members can view conversations" on public.conversations;
create policy "Members can view conversations"
on public.conversations for select to authenticated
using (public.is_conversation_member(id));

drop policy if exists "Authenticated can create conversations" on public.conversations;
create policy "Authenticated can create conversations"
on public.conversations for insert to authenticated
with check (true);

drop policy if exists "Members can update conversations" on public.conversations;
create policy "Members can update conversations"
on public.conversations for update to authenticated
using (public.is_conversation_member(id))
with check (public.is_conversation_member(id));

-- conversation_members
drop policy if exists "Members can view conversation members" on public.conversation_members;
create policy "Members can view conversation members"
on public.conversation_members for select to authenticated
using (public.is_conversation_member(conversation_id) or user_id = auth.uid());

drop policy if exists "Users can join conversations as themselves" on public.conversation_members;
create policy "Users can join conversations as themselves"
on public.conversation_members for insert to authenticated
with check (
  auth.uid() = user_id
  or public.is_conversation_member(conversation_id)
);

-- DM helper: creates or finds a 1:1 conversation (bypasses member-insert chicken/egg)
create or replace function public.get_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing_id uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other_user_id is null or other_user_id = me then
    raise exception 'Invalid DM recipient';
  end if;

  select c.id into existing_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = me
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = other_user_id
  where c.is_group = false
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations (is_group) values (false)
  returning id into new_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (new_id, me), (new_id, other_user_id);

  return new_id;
end;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;

drop policy if exists "Users can update own membership" on public.conversation_members;
create policy "Users can update own membership"
on public.conversation_members for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can leave conversations" on public.conversation_members;
create policy "Users can leave conversations"
on public.conversation_members for delete to authenticated
using (auth.uid() = user_id);

-- messages
drop policy if exists "Members can view messages" on public.messages;
create policy "Members can view messages"
on public.messages for select to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
on public.messages for insert to authenticated
with check (
  auth.uid() = sender_id
  and public.is_conversation_member(conversation_id)
);

drop policy if exists "Senders can update own messages" on public.messages;
create policy "Senders can update own messages"
on public.messages for update to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

-- blocked_users
drop policy if exists "Users can view own blocks" on public.blocked_users;
create policy "Users can view own blocks"
on public.blocked_users for select to authenticated
using (auth.uid() = blocker_id);

drop policy if exists "Users can block as themselves" on public.blocked_users;
create policy "Users can block as themselves"
on public.blocked_users for insert to authenticated
with check (auth.uid() = blocker_id);

drop policy if exists "Users can unblock themselves" on public.blocked_users;
create policy "Users can unblock themselves"
on public.blocked_users for delete to authenticated
using (auth.uid() = blocker_id);

-- reports
drop policy if exists "Users can view own reports" on public.reports;
create policy "Users can view own reports"
on public.reports for select to authenticated
using (auth.uid() = reporter_id);

drop policy if exists "Users can create reports as themselves" on public.reports;
create policy "Users can create reports as themselves"
on public.reports for insert to authenticated
with check (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------------
-- Storage bucket for post media (public read, owner write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Post media files are publicly accessible" on storage.objects;
create policy "Post media files are publicly accessible"
on storage.objects for select to public
using (bucket_id = 'post-media');

drop policy if exists "Users can upload own post media" on storage.objects;
create policy "Users can upload own post media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own post media files" on storage.objects;
create policy "Users can update own post media files"
on storage.objects for update to authenticated
using (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own post media files" on storage.objects;
create policy "Users can delete own post media files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
