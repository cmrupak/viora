-- Viora Phase F: engagement depth
-- Comment pin/disable, keyword filters, hide posts, save collections,
-- share targets, reposts. Additive only.

-- ---------------------------------------------------------------------------
-- Posts: disable comments + repost pointer + counter
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists comments_disabled boolean not null default false;

alter table public.posts
  add column if not exists repost_of_id uuid references public.posts (id) on delete set null;

alter table public.posts
  add column if not exists repost_count integer not null default 0;

create index if not exists posts_repost_of_id_idx on public.posts (repost_of_id)
  where repost_of_id is not null;

-- ---------------------------------------------------------------------------
-- Comments: pin
-- ---------------------------------------------------------------------------
alter table public.comments
  add column if not exists pinned_at timestamptz;

create index if not exists comments_pinned_at_idx
  on public.comments (post_id, pinned_at desc nulls last)
  where pinned_at is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Keyword filters (post author hides matching comments on their posts)
-- ---------------------------------------------------------------------------
create table if not exists public.comment_keyword_filters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now(),
  constraint comment_keyword_filters_keyword_not_empty check (length(trim(keyword)) > 0),
  constraint comment_keyword_filters_unique unique (owner_id, keyword)
);

create index if not exists comment_keyword_filters_owner_id_idx
  on public.comment_keyword_filters (owner_id);

alter table public.comment_keyword_filters enable row level security;

drop policy if exists "Owners manage keyword filters" on public.comment_keyword_filters;
create policy "Owners manage keyword filters"
on public.comment_keyword_filters for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Hidden posts (viewer hides from their feed)
-- ---------------------------------------------------------------------------
create table if not exists public.hidden_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint hidden_posts_unique unique (user_id, post_id)
);

create index if not exists hidden_posts_user_id_idx on public.hidden_posts (user_id);

alter table public.hidden_posts enable row level security;

drop policy if exists "Users manage own hidden posts" on public.hidden_posts;
create policy "Users manage own hidden posts"
on public.hidden_posts for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Saved collections
-- ---------------------------------------------------------------------------
create table if not exists public.saved_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_collections_name_not_empty check (length(trim(name)) > 0)
);

create index if not exists saved_collections_owner_id_idx on public.saved_collections (owner_id);

drop trigger if exists saved_collections_set_updated_at on public.saved_collections;
create trigger saved_collections_set_updated_at
before update on public.saved_collections
for each row execute function public.set_updated_at();

alter table public.saved_posts
  add column if not exists collection_id uuid references public.saved_collections (id) on delete set null;

create index if not exists saved_posts_collection_id_idx on public.saved_posts (collection_id);

alter table public.saved_collections enable row level security;

drop policy if exists "Owners manage saved collections" on public.saved_collections;
create policy "Owners manage saved collections"
on public.saved_collections for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- post_shares: destination metadata
-- ---------------------------------------------------------------------------
alter table public.post_shares
  add column if not exists target text not null default 'external'
    check (target in ('link', 'feed', 'dm', 'external'));

alter table public.post_shares
  add column if not exists conversation_id uuid;

-- ---------------------------------------------------------------------------
-- Repost count bump when a post is created with repost_of_id
-- ---------------------------------------------------------------------------
create or replace function public.bump_repost_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.repost_of_id is not null and new.deleted_at is null then
    update public.posts
    set repost_count = repost_count + 1
    where id = new.repost_of_id;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null and new.repost_of_id is not null then
      update public.posts
      set repost_count = greatest(repost_count - 1, 0)
      where id = new.repost_of_id;
    elsif old.deleted_at is not null and new.deleted_at is null and new.repost_of_id is not null then
      update public.posts
      set repost_count = repost_count + 1
      where id = new.repost_of_id;
    end if;
  elsif tg_op = 'DELETE' and old.repost_of_id is not null and old.deleted_at is null then
    update public.posts
    set repost_count = greatest(repost_count - 1, 0)
    where id = old.repost_of_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists posts_bump_repost_count on public.posts;
create trigger posts_bump_repost_count
after insert or update or delete on public.posts
for each row execute function public.bump_repost_count();

-- ---------------------------------------------------------------------------
-- Allow post author to pin / unpin any comment on their post
-- ---------------------------------------------------------------------------
drop policy if exists "Authors can pin comments on own posts" on public.comments;
create policy "Authors can pin comments on own posts"
on public.comments for update to authenticated
using (
  auth.uid() = author_id
  or exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
)
with check (
  auth.uid() = author_id
  or exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

-- Note: existing "Users can update own comments" may already exist; having both is OK
-- as long as either passes. If Postgres OR-combines permissive policies, author can pin.
