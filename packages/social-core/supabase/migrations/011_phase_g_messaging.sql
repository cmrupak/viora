-- Viora Phase G: messaging v2
-- Replies, reactions, ephemeral TTL, member prefs, presence, request inbox.
-- message_attachments already exist (004). Additive only.

-- ---------------------------------------------------------------------------
-- Messages: reply + ephemeral
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists reply_to_id uuid references public.messages (id) on delete set null;

alter table public.messages
  add column if not exists expires_at timestamptz;

create index if not exists messages_reply_to_id_idx on public.messages (reply_to_id)
  where reply_to_id is not null;
create index if not exists messages_expires_at_idx on public.messages (expires_at)
  where expires_at is not null;

-- Allow media-only / voice messages (empty body)
alter table public.messages drop constraint if exists messages_body_not_empty;

-- ---------------------------------------------------------------------------
-- Conversations: request inbox flag
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists is_request boolean not null default false;

create index if not exists conversations_is_request_idx on public.conversations (is_request)
  where is_request = true;

-- ---------------------------------------------------------------------------
-- conversation_members prefs
-- ---------------------------------------------------------------------------
alter table public.conversation_members
  add column if not exists muted boolean not null default false;

alter table public.conversation_members
  add column if not exists pinned_at timestamptz;

alter table public.conversation_members
  add column if not exists nickname text;

-- ---------------------------------------------------------------------------
-- Message reactions
-- ---------------------------------------------------------------------------
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null
    check (reaction in ('love', 'haha', 'wow', 'sad', 'angry', 'like')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_reactions_unique unique (message_id, user_id)
);

create index if not exists message_reactions_message_id_idx on public.message_reactions (message_id);

drop trigger if exists message_reactions_set_updated_at on public.message_reactions;
create trigger message_reactions_set_updated_at
before update on public.message_reactions
for each row execute function public.set_updated_at();

alter table public.message_reactions enable row level security;

drop policy if exists "Members can view message reactions" on public.message_reactions;
create policy "Members can view message reactions"
on public.message_reactions for select to authenticated
using (
  exists (
    select 1 from public.messages m
    where m.id = message_id
      and public.is_conversation_member(m.conversation_id)
  )
);

drop policy if exists "Users react as themselves" on public.message_reactions;
create policy "Users react as themselves"
on public.message_reactions for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.messages m
    where m.id = message_id
      and public.is_conversation_member(m.conversation_id)
  )
);

drop policy if exists "Users update own message reactions" on public.message_reactions;
create policy "Users update own message reactions"
on public.message_reactions for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own message reactions" on public.message_reactions;
create policy "Users delete own message reactions"
on public.message_reactions for delete to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Presence
-- ---------------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists user_presence_set_updated_at on public.user_presence;
create trigger user_presence_set_updated_at
before update on public.user_presence
for each row execute function public.set_updated_at();

alter table public.user_presence enable row level security;

drop policy if exists "Authenticated can read presence" on public.user_presence;
create policy "Authenticated can read presence"
on public.user_presence for select to authenticated
using (true);

drop policy if exists "Users upsert own presence" on public.user_presence;
create policy "Users upsert own presence"
on public.user_presence for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own presence" on public.user_presence;
create policy "Users update own presence"
on public.user_presence for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Create group chat helper
-- ---------------------------------------------------------------------------
create or replace function public.create_group_conversation(
  p_title text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  mid uuid;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Group title required';
  end if;

  insert into public.conversations (is_group, title, is_request)
  values (true, trim(p_title), false)
  returning id into conv_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv_id, me)
  on conflict do nothing;

  if p_member_ids is not null then
    foreach mid in array p_member_ids loop
      if mid is distinct from me then
        insert into public.conversation_members (conversation_id, user_id)
        values (conv_id, mid)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return conv_id;
end;
$$;

revoke all on function public.create_group_conversation(text, uuid[]) from public;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

-- Soft-delete expired messages helper (callable by clients opportunistically)
create or replace function public.purge_expired_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.messages
  set deleted_at = now()
  where expires_at is not null
    and expires_at <= now()
    and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_expired_messages() from public;
grant execute on function public.purge_expired_messages() to authenticated;

-- Recipients need to read message media (private bucket)
drop policy if exists "Conversation members can read message files" on storage.objects;
create policy "Authenticated can read message files"
on storage.objects for select to authenticated
using (bucket_id = 'messages');

-- Allow members to update their own membership prefs (mute/pin/nickname/last_read)
drop policy if exists "Members update own membership" on public.conversation_members;
create policy "Members update own membership"
on public.conversation_members for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Allow inserting other members when creating groups (creator adds others)
drop policy if exists "Creators can add conversation members" on public.conversation_members;
create policy "Creators can add conversation members"
on public.conversation_members for insert to authenticated
with check (
  auth.uid() = user_id
  or exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_id
      and cm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and c.is_group = true
  )
);
