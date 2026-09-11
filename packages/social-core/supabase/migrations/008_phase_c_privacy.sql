-- Viora Phase C: privacy enforcement
-- Private accounts + follow requests + per-post visibility + audience lists
-- Additive only.

-- ---------------------------------------------------------------------------
-- Profiles: tag review plumbing (Decision #12)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists tag_review_enabled boolean not null default false;

-- When flipping to private, prefer tag review on (app may also set this)
-- No trigger required; client sets alongside is_private.

-- ---------------------------------------------------------------------------
-- follow_requests (private account approval)
-- ---------------------------------------------------------------------------
create table if not exists public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_requests_no_self check (from_user_id <> to_user_id),
  constraint follow_requests_pair_unique unique (from_user_id, to_user_id)
);

create index if not exists follow_requests_to_user_id_idx on public.follow_requests (to_user_id);
create index if not exists follow_requests_from_user_id_idx on public.follow_requests (from_user_id);
create index if not exists follow_requests_status_idx on public.follow_requests (status);

drop trigger if exists follow_requests_set_updated_at on public.follow_requests;
create trigger follow_requests_set_updated_at
before update on public.follow_requests
for each row execute function public.set_updated_at();

-- Accept follow request → create follow edge
create or replace function public.follow_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from 'accepted'
     and new.status = 'accepted' then
    insert into public.follows (follower_id, following_id)
    values (new.from_user_id, new.to_user_id)
    on conflict (follower_id, following_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists follow_requests_on_accepted on public.follow_requests;
create trigger follow_requests_on_accepted
after update on public.follow_requests
for each row execute function public.follow_request_accepted();

-- Extend block cleanup to clear follow_requests
create or replace function public.cleanup_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);

  if new.blocker_id < new.blocked_id then
    a := new.blocker_id;
    b := new.blocked_id;
  else
    a := new.blocked_id;
    b := new.blocker_id;
  end if;
  delete from public.friendships where user_a = a and user_b = b;

  delete from public.friend_requests
  where (from_user_id = new.blocker_id and to_user_id = new.blocked_id)
     or (from_user_id = new.blocked_id and to_user_id = new.blocker_id);

  delete from public.follow_requests
  where (from_user_id = new.blocker_id and to_user_id = new.blocked_id)
     or (from_user_id = new.blocked_id and to_user_id = new.blocker_id);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Posts visibility + audience lists
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'followers', 'friends', 'only_me', 'custom'));

create index if not exists posts_visibility_idx on public.posts (visibility);

create table if not exists public.audience_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audience_lists_name_not_empty check (length(trim(name)) > 0)
);

create index if not exists audience_lists_owner_id_idx on public.audience_lists (owner_id);

drop trigger if exists audience_lists_set_updated_at on public.audience_lists;
create trigger audience_lists_set_updated_at
before update on public.audience_lists
for each row execute function public.set_updated_at();

create table if not exists public.audience_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.audience_lists (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint audience_list_members_unique unique (list_id, member_id)
);

create index if not exists audience_list_members_list_id_idx on public.audience_list_members (list_id);
create index if not exists audience_list_members_member_id_idx on public.audience_list_members (member_id);

create table if not exists public.post_audience (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  list_id uuid not null references public.audience_lists (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_audience_unique unique (post_id, list_id)
);

create index if not exists post_audience_post_id_idx on public.post_audience (post_id);

-- ---------------------------------------------------------------------------
-- can_view_post (Decision #8 + #9 + #11)
-- ---------------------------------------------------------------------------
create or replace function public.can_view_post(p_post_id uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    join public.profiles author on author.id = p.author_id
    where p.id = p_post_id
      and p.deleted_at is null
      and (
        p.author_id = p_viewer
        or (
          p.visibility <> 'only_me'
          and (
            -- Private accounts: only approved followers (beyond author)
            case when author.is_private then
              exists (
                select 1 from public.follows f
                where f.follower_id = p_viewer and f.following_id = p.author_id
              )
            else true
            end
          )
          and (
            case p.visibility
              when 'public' then true
              when 'followers' then exists (
                select 1 from public.follows f
                where f.follower_id = p_viewer and f.following_id = p.author_id
              )
              when 'friends' then exists (
                select 1 from public.friendships fr
                where (fr.user_a = least(p_viewer, p.author_id)
                   and fr.user_b = greatest(p_viewer, p.author_id))
              )
              when 'custom' then exists (
                select 1
                from public.post_audience pa
                join public.audience_list_members alm on alm.list_id = pa.list_id
                where pa.post_id = p.id and alm.member_id = p_viewer
              )
              else false
            end
          )
        )
      )
  );
$$;

revoke all on function public.can_view_post(uuid, uuid) from public;
grant execute on function public.can_view_post(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: follow_requests
-- ---------------------------------------------------------------------------
alter table public.follow_requests enable row level security;

drop policy if exists "Users can view own follow requests" on public.follow_requests;
create policy "Users can view own follow requests"
on public.follow_requests for select to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "Users can send follow requests as themselves" on public.follow_requests;
create policy "Users can send follow requests as themselves"
on public.follow_requests for insert to authenticated
with check (auth.uid() = from_user_id);

drop policy if exists "Participants can update follow requests" on public.follow_requests;
create policy "Participants can update follow requests"
on public.follow_requests for update to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id)
with check (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "Participants can delete follow requests" on public.follow_requests;
create policy "Participants can delete follow requests"
on public.follow_requests for delete to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- ---------------------------------------------------------------------------
-- RLS: audience lists
-- ---------------------------------------------------------------------------
alter table public.audience_lists enable row level security;
alter table public.audience_list_members enable row level security;
alter table public.post_audience enable row level security;

drop policy if exists "Owners manage audience lists" on public.audience_lists;
create policy "Owners manage audience lists"
on public.audience_lists for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Owners manage audience list members" on public.audience_list_members;
create policy "Owners manage audience list members"
on public.audience_list_members for all to authenticated
using (
  exists (
    select 1 from public.audience_lists l
    where l.id = list_id and l.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.audience_lists l
    where l.id = list_id and l.owner_id = auth.uid()
  )
);

drop policy if exists "Authors manage post audience" on public.post_audience;
create policy "Authors manage post audience"
on public.post_audience for all to authenticated
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

-- ---------------------------------------------------------------------------
-- Tighten posts / post_media / comments SELECT
-- ---------------------------------------------------------------------------
drop policy if exists "Active posts are viewable by authenticated" on public.posts;
create policy "Active posts are viewable by authenticated"
on public.posts for select to authenticated
using (
  deleted_at is null
  and public.can_view_post(id, auth.uid())
);

drop policy if exists "Post media viewable with post" on public.post_media;
create policy "Post media viewable with post"
on public.post_media for select to authenticated
using (public.can_view_post(post_id, auth.uid()));

drop policy if exists "Active comments viewable by authenticated" on public.comments;
create policy "Active comments viewable by authenticated"
on public.comments for select to authenticated
using (
  (deleted_at is null or author_id = auth.uid())
  and public.can_view_post(post_id, auth.uid())
);
