-- Viora Phase A: social graph completion
-- - Accepting a friend request also creates follows both ways
-- - Blocking cleans follows, friendship, and pending friend requests
-- Additive only.

-- ---------------------------------------------------------------------------
-- Friend accept → friendship + mutual follows
-- ---------------------------------------------------------------------------
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

    -- Decision #1: friending implies following both ways
    insert into public.follows (follower_id, following_id)
    values (new.from_user_id, new.to_user_id)
    on conflict (follower_id, following_id) do nothing;

    insert into public.follows (follower_id, following_id)
    values (new.to_user_id, new.from_user_id)
    on conflict (follower_id, following_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists friend_requests_on_accepted on public.friend_requests;
create trigger friend_requests_on_accepted
after update on public.friend_requests
for each row execute function public.friend_request_accepted();

-- ---------------------------------------------------------------------------
-- Block → remove graph edges (Decision #3)
-- ---------------------------------------------------------------------------
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
  -- Follows both directions
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);

  -- Friendship
  if new.blocker_id < new.blocked_id then
    a := new.blocker_id;
    b := new.blocked_id;
  else
    a := new.blocked_id;
    b := new.blocker_id;
  end if;
  delete from public.friendships
  where user_a = a and user_b = b;

  -- Pending / any friend requests between the pair
  delete from public.friend_requests
  where (from_user_id = new.blocker_id and to_user_id = new.blocked_id)
     or (from_user_id = new.blocked_id and to_user_id = new.blocker_id);

  return new;
end;
$$;

drop trigger if exists blocked_users_cleanup_graph on public.blocked_users;
create trigger blocked_users_cleanup_graph
after insert on public.blocked_users
for each row execute function public.cleanup_on_block();

-- Allow either party to see a block involving them (needed for feed filters)
drop policy if exists "Users can view own blocks" on public.blocked_users;
create policy "Users can view own blocks"
on public.blocked_users for select to authenticated
using (auth.uid() = blocker_id or auth.uid() = blocked_id);

-- Allow either participant to clear friend_request rows (needed for unfriend)
drop policy if exists "Sender can cancel friend requests" on public.friend_requests;
drop policy if exists "Participants can delete friend requests" on public.friend_requests;
create policy "Participants can delete friend requests"
on public.friend_requests for delete to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Helpful indexes for graph queries
create index if not exists blocked_users_blocker_id_idx
  on public.blocked_users (blocker_id);

create index if not exists friend_requests_pair_status_idx
  on public.friend_requests (from_user_id, to_user_id, status);

-- Mutual friends (RLS-safe): friendships of `other` are not readable by viewer
create or replace function public.count_mutual_friends(viewer_id uuid, other_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with viewer_friends as (
    select case when user_a = viewer_id then user_b else user_a end as friend_id
    from public.friendships
    where user_a = viewer_id or user_b = viewer_id
  ),
  other_friends as (
    select case when user_a = other_id then user_b else user_a end as friend_id
    from public.friendships
    where user_a = other_id or user_b = other_id
  )
  select count(*)::integer
  from viewer_friends v
  inner join other_friends o on o.friend_id = v.friend_id
  where v.friend_id <> viewer_id and v.friend_id <> other_id;
$$;

revoke all on function public.count_mutual_friends(uuid, uuid) from public;
grant execute on function public.count_mutual_friends(uuid, uuid) to authenticated;

create or replace function public.list_mutual_friend_ids(
  viewer_id uuid,
  other_id uuid,
  lim integer default 20
)
returns table (friend_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with viewer_friends as (
    select case when user_a = viewer_id then user_b else user_a end as fid
    from public.friendships
    where user_a = viewer_id or user_b = viewer_id
  ),
  other_friends as (
    select case when user_a = other_id then user_b else user_a end as fid
    from public.friendships
    where user_a = other_id or user_b = other_id
  )
  select v.fid
  from viewer_friends v
  inner join other_friends o on o.fid = v.fid
  where v.fid <> viewer_id and v.fid <> other_id
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;

revoke all on function public.list_mutual_friend_ids(uuid, uuid, integer) from public;
grant execute on function public.list_mutual_friend_ids(uuid, uuid, integer) to authenticated;

