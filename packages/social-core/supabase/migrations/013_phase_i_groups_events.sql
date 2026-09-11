-- Viora Phase I: groups & events depth
-- Visibility (public/private/hidden), mod roles, join questions/approval,
-- pending group posts, group-linked events, invites, online/recurrence,
-- discussion thread, broadcast channels.
-- Additive only.

-- ---------------------------------------------------------------------------
-- Groups: visibility + post approval
-- Decision #23: hidden = unlisted; private = visible but join approval
-- ---------------------------------------------------------------------------
alter table public.groups
  add column if not exists visibility text;

update public.groups
set visibility = case when is_private then 'private' else 'public' end
where visibility is null;

alter table public.groups
  alter column visibility set default 'public';

alter table public.groups
  alter column visibility set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_visibility_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_visibility_check
      check (visibility in ('public', 'private', 'hidden'));
  end if;
end $$;

create index if not exists groups_visibility_idx on public.groups (visibility);

alter table public.groups
  add column if not exists requires_post_approval boolean not null default false;

-- ---------------------------------------------------------------------------
-- Group members: pending/banned + invite status
-- ---------------------------------------------------------------------------
alter table public.group_members
  add column if not exists status text;

update public.group_members set status = 'active' where status is null;

alter table public.group_members
  alter column status set default 'active';

alter table public.group_members
  alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_members_status_check'
      and conrelid = 'public.group_members'::regclass
  ) then
    alter table public.group_members
      add constraint group_members_status_check
      check (status in ('active', 'pending', 'banned'));
  end if;
end $$;

create index if not exists group_members_status_idx on public.group_members (group_id, status);

-- ---------------------------------------------------------------------------
-- Join questions + answers
-- ---------------------------------------------------------------------------
create table if not exists public.group_join_questions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  prompt text not null,
  sort_order integer not null default 0,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_join_questions_prompt_not_empty check (length(trim(prompt)) > 0)
);

create index if not exists group_join_questions_group_id_idx
  on public.group_join_questions (group_id, sort_order);

drop trigger if exists group_join_questions_set_updated_at on public.group_join_questions;
create trigger group_join_questions_set_updated_at
before update on public.group_join_questions
for each row execute function public.set_updated_at();

create table if not exists public.group_join_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.group_join_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_join_answers_unique unique (question_id, user_id)
);

create index if not exists group_join_answers_user_id_idx on public.group_join_answers (user_id);

drop trigger if exists group_join_answers_set_updated_at on public.group_join_answers;
create trigger group_join_answers_set_updated_at
before update on public.group_join_answers
for each row execute function public.set_updated_at();

alter table public.group_join_questions enable row level security;
alter table public.group_join_answers enable row level security;

-- ---------------------------------------------------------------------------
-- Group posts: approval workflow
-- ---------------------------------------------------------------------------
alter table public.group_posts
  add column if not exists approval_status text;

update public.group_posts set approval_status = 'approved' where approval_status is null;

alter table public.group_posts
  alter column approval_status set default 'approved';

alter table public.group_posts
  alter column approval_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_posts_approval_status_check'
      and conrelid = 'public.group_posts'::regclass
  ) then
    alter table public.group_posts
      add constraint group_posts_approval_status_check
      check (approval_status in ('approved', 'pending', 'rejected'));
  end if;
end $$;

create index if not exists group_posts_approval_status_idx
  on public.group_posts (group_id, approval_status);

-- ---------------------------------------------------------------------------
-- Events: group link, online, recurrence, discussion
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists group_id uuid references public.groups (id) on delete set null;

alter table public.events
  add column if not exists is_online boolean not null default false;

alter table public.events
  add column if not exists meeting_url text;

alter table public.events
  add column if not exists recurrence_rule text;

alter table public.events
  add column if not exists discussion_post_id uuid references public.posts (id) on delete set null;

create index if not exists events_group_id_idx on public.events (group_id)
  where group_id is not null;

-- ---------------------------------------------------------------------------
-- Event invites
-- ---------------------------------------------------------------------------
create table if not exists public.event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_invites_unique unique (event_id, invitee_id)
);

create index if not exists event_invites_invitee_id_idx on public.event_invites (invitee_id, status);
create index if not exists event_invites_event_id_idx on public.event_invites (event_id);

drop trigger if exists event_invites_set_updated_at on public.event_invites;
create trigger event_invites_set_updated_at
before update on public.event_invites
for each row execute function public.set_updated_at();

alter table public.event_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Broadcast channels (group announcements)
-- ---------------------------------------------------------------------------
create table if not exists public.broadcast_channels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcast_channels_name_not_empty check (length(trim(name)) > 0)
);

create index if not exists broadcast_channels_group_id_idx on public.broadcast_channels (group_id);

drop trigger if exists broadcast_channels_set_updated_at on public.broadcast_channels;
create trigger broadcast_channels_set_updated_at
before update on public.broadcast_channels
for each row execute function public.set_updated_at();

create table if not exists public.broadcast_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.broadcast_channels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcast_messages_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists broadcast_messages_channel_id_idx
  on public.broadcast_messages (channel_id, created_at desc);

drop trigger if exists broadcast_messages_set_updated_at on public.broadcast_messages;
create trigger broadcast_messages_set_updated_at
before update on public.broadcast_messages
for each row execute function public.set_updated_at();

alter table public.broadcast_channels enable row level security;
alter table public.broadcast_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Membership helpers (active members only)
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
      and coalesce(gm.status, 'active') = 'active'
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
        g.owner_id = auth.uid()
        or public.is_group_member(g.id)
        or coalesce(g.visibility, case when g.is_private then 'private' else 'public' end) = 'public'
        or (
          coalesce(g.visibility, case when g.is_private then 'private' else 'public' end) = 'private'
          -- private groups are discoverable (card visible) even if not a member
        )
        -- hidden: only owner/members
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
      and coalesce(gm.status, 'active') = 'active'
  )
  or exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.owner_id = auth.uid()
  );
$$;

-- Sync is_private from visibility for older clients
create or replace function public.groups_sync_is_private()
returns trigger
language plpgsql
as $$
begin
  if new.visibility is not null then
    new.is_private := new.visibility <> 'public';
  elsif new.is_private is not null then
    new.visibility := case when new.is_private then 'private' else 'public' end;
  end if;
  return new;
end;
$$;

drop trigger if exists groups_sync_is_private_trg on public.groups;
create trigger groups_sync_is_private_trg
before insert or update on public.groups
for each row execute function public.groups_sync_is_private();

-- ---------------------------------------------------------------------------
-- RLS: tighten group list for hidden; join questions; answers; posts; events
-- ---------------------------------------------------------------------------
drop policy if exists "Public or member groups viewable" on public.groups;
drop policy if exists "Groups viewable by visibility rules" on public.groups;
create policy "Groups viewable by visibility rules"
on public.groups for select to authenticated
using (
  owner_id = auth.uid()
  or public.is_group_member(id)
  or coalesce(visibility, case when is_private then 'private' else 'public' end) in ('public', 'private')
);

-- Join questions: members/admins manage; applicants can read when joining
drop policy if exists "Join questions readable for visible groups" on public.group_join_questions;
create policy "Join questions readable for visible groups"
on public.group_join_questions for select to authenticated
using (public.can_view_group(group_id));

drop policy if exists "Admins manage join questions" on public.group_join_questions;
create policy "Admins manage join questions"
on public.group_join_questions for all to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

drop policy if exists "Users manage own join answers" on public.group_join_answers;
create policy "Users manage own join answers"
on public.group_join_answers for all to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.group_join_questions q
    where q.id = question_id and public.is_group_admin(q.group_id)
  )
)
with check (auth.uid() = user_id);

-- Group posts: members see approved; authors see own pending; admins see all
drop policy if exists "Group posts viewable when group visible" on public.group_posts;
create policy "Group posts viewable when group visible"
on public.group_posts for select to authenticated
using (
  public.can_view_group(group_id)
  and (
    coalesce(approval_status, 'approved') = 'approved'
    or public.is_group_admin(group_id)
    or exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  )
);

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

drop policy if exists "Admins update group post approval" on public.group_posts;
create policy "Admins update group post approval"
on public.group_posts for update to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

-- Members insert: allow pending status for private/hidden join requests
drop policy if exists "Users can join public groups as themselves" on public.group_members;
create policy "Users can join or request as themselves"
on public.group_members for insert to authenticated
with check (
  auth.uid() = user_id
  and (
    public.is_group_admin(group_id)
    or exists (
      select 1 from public.groups g
      where g.id = group_id
        and coalesce(g.visibility, case when g.is_private then 'private' else 'public' end) = 'public'
        and coalesce(status, 'active') = 'active'
    )
    or exists (
      select 1 from public.groups g
      where g.id = group_id
        and coalesce(g.visibility, case when g.is_private then 'private' else 'public' end) = 'private'
        and coalesce(status, 'pending') = 'pending'
    )
  )
);

-- Event invites
drop policy if exists "Event invites readable by parties" on public.event_invites;
create policy "Event invites readable by parties"
on public.event_invites for select to authenticated
using (
  auth.uid() = invitee_id
  or auth.uid() = invited_by
  or exists (
    select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()
  )
);

drop policy if exists "Hosts invite to events" on public.event_invites;
create policy "Hosts invite to events"
on public.event_invites for insert to authenticated
with check (
  auth.uid() = invited_by
  and exists (
    select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()
  )
);

drop policy if exists "Invitees or hosts update invites" on public.event_invites;
create policy "Invitees or hosts update invites"
on public.event_invites for update to authenticated
using (
  auth.uid() = invitee_id
  or exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid())
)
with check (
  auth.uid() = invitee_id
  or exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid())
);

-- Broadcast channels / messages
drop policy if exists "Broadcast channels readable by group members" on public.broadcast_channels;
create policy "Broadcast channels readable by group members"
on public.broadcast_channels for select to authenticated
using (public.is_group_member(group_id) or public.is_group_admin(group_id));

drop policy if exists "Admins manage broadcast channels" on public.broadcast_channels;
create policy "Admins manage broadcast channels"
on public.broadcast_channels for all to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

drop policy if exists "Broadcast messages readable by members" on public.broadcast_messages;
create policy "Broadcast messages readable by members"
on public.broadcast_messages for select to authenticated
using (
  exists (
    select 1 from public.broadcast_channels c
    where c.id = channel_id
      and (public.is_group_member(c.group_id) or public.is_group_admin(c.group_id))
  )
);

drop policy if exists "Admins post broadcast messages" on public.broadcast_messages;
create policy "Admins post broadcast messages"
on public.broadcast_messages for insert to authenticated
with check (
  auth.uid() = author_id
  and exists (
    select 1 from public.broadcast_channels c
    where c.id = channel_id and public.is_group_admin(c.group_id)
  )
);
