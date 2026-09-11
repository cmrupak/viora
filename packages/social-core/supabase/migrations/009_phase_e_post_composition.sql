-- Viora Phase E: post composition richness
-- Multi-media already exists; add location/feeling, tags, drafts/schedule,
-- revisions, pin/archive, alt text, soft insights (views).
-- Additive only.

-- ---------------------------------------------------------------------------
-- Posts composition columns
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists publish_status text not null default 'published'
    check (publish_status in ('draft', 'published', 'scheduled'));

alter table public.posts
  add column if not exists scheduled_at timestamptz;

alter table public.posts
  add column if not exists location_name text;

alter table public.posts
  add column if not exists feeling text;

alter table public.posts
  add column if not exists pinned_at timestamptz;

alter table public.posts
  add column if not exists archived_at timestamptz;

alter table public.posts
  add column if not exists edited_at timestamptz;

alter table public.posts
  add column if not exists view_count integer not null default 0;

create index if not exists posts_publish_status_idx on public.posts (publish_status);
create index if not exists posts_scheduled_at_idx on public.posts (scheduled_at)
  where publish_status = 'scheduled';
create index if not exists posts_pinned_at_idx on public.posts (author_id, pinned_at desc nulls last)
  where pinned_at is not null and deleted_at is null;
create index if not exists posts_archived_at_idx on public.posts (archived_at)
  where archived_at is not null;

-- Scheduled posts must have scheduled_at
alter table public.posts drop constraint if exists posts_scheduled_requires_at;
alter table public.posts
  add constraint posts_scheduled_requires_at
  check (
    publish_status <> 'scheduled'
    or scheduled_at is not null
  );

-- ---------------------------------------------------------------------------
-- Media alt text
-- ---------------------------------------------------------------------------
alter table public.post_media
  add column if not exists alt_text text;

-- ---------------------------------------------------------------------------
-- People tags on posts
-- ---------------------------------------------------------------------------
create table if not exists public.post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  tagged_user_id uuid not null references public.profiles (id) on delete cascade,
  tagged_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_tags_unique unique (post_id, tagged_user_id)
);

create index if not exists post_tags_post_id_idx on public.post_tags (post_id);
create index if not exists post_tags_tagged_user_id_idx on public.post_tags (tagged_user_id);
create index if not exists post_tags_status_idx on public.post_tags (status);

drop trigger if exists post_tags_set_updated_at on public.post_tags;
create trigger post_tags_set_updated_at
before update on public.post_tags
for each row execute function public.set_updated_at();

-- On insert: auto-approve unless tagged user has tag_review_enabled
create or replace function public.post_tag_set_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  review boolean;
begin
  select coalesce(tag_review_enabled, false) into review
  from public.profiles
  where id = new.tagged_user_id;

  if review then
    new.status := 'pending';
  else
    new.status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists post_tags_before_insert_status on public.post_tags;
create trigger post_tags_before_insert_status
before insert on public.post_tags
for each row execute function public.post_tag_set_initial_status();

-- Notify tagged user (mention-style)
create or replace function public.notify_on_post_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tagged_user_id = new.tagged_by then
    return new;
  end if;
  insert into public.notifications (user_id, actor_id, type, post_id, body)
  values (
    new.tagged_user_id,
    new.tagged_by,
    'mention',
    new.post_id,
    case when new.status = 'pending'
      then 'tagged you (awaiting approval)'
      else 'tagged you in a post'
    end
  );
  return new;
end;
$$;

drop trigger if exists post_tags_notify on public.post_tags;
create trigger post_tags_notify
after insert on public.post_tags
for each row execute function public.notify_on_post_tag();

-- ---------------------------------------------------------------------------
-- Edit history
-- ---------------------------------------------------------------------------
create table if not exists public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  body text not null default '',
  edited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists post_revisions_post_id_idx
  on public.post_revisions (post_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Soft insights: unique viewers
-- ---------------------------------------------------------------------------
create table if not exists public.post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_views_unique unique (post_id, viewer_id)
);

create index if not exists post_views_post_id_idx on public.post_views (post_id);

create or replace function public.bump_post_view_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts
  set view_count = view_count + 1
  where id = new.post_id;
  return new;
end;
$$;

drop trigger if exists post_views_bump_count on public.post_views;
create trigger post_views_bump_count
after insert on public.post_views
for each row execute function public.bump_post_view_count();

-- ---------------------------------------------------------------------------
-- Live / visible helpers (no Edge cron needed for schedule)
-- ---------------------------------------------------------------------------
create or replace function public.post_is_live(p public.posts)
returns boolean
language sql
stable
as $$
  select
    p.deleted_at is null
    and p.archived_at is null
    and (
      p.publish_status = 'published'
      or (
        p.publish_status = 'scheduled'
        and p.scheduled_at is not null
        and p.scheduled_at <= now()
      )
    );
$$;

-- Update can_view_post to respect drafts / future schedule / archive
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
          public.post_is_live(p)
          and p.visibility <> 'only_me'
          and (
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
-- RLS
-- ---------------------------------------------------------------------------
alter table public.post_tags enable row level security;
alter table public.post_revisions enable row level security;
alter table public.post_views enable row level security;

drop policy if exists "View post tags when can view post" on public.post_tags;
create policy "View post tags when can view post"
on public.post_tags for select to authenticated
using (
  tagged_user_id = auth.uid()
  or tagged_by = auth.uid()
  or (
    status = 'approved'
    and public.can_view_post(post_id, auth.uid())
  )
);

drop policy if exists "Authors can tag people" on public.post_tags;
create policy "Authors can tag people"
on public.post_tags for insert to authenticated
with check (
  auth.uid() = tagged_by
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

drop policy if exists "Tagged user or author manage tags" on public.post_tags;
create policy "Tagged user or author manage tags"
on public.post_tags for update to authenticated
using (auth.uid() = tagged_user_id or auth.uid() = tagged_by)
with check (auth.uid() = tagged_user_id or auth.uid() = tagged_by);

drop policy if exists "Tagged user or author delete tags" on public.post_tags;
create policy "Tagged user or author delete tags"
on public.post_tags for delete to authenticated
using (auth.uid() = tagged_user_id or auth.uid() = tagged_by);

drop policy if exists "Authors read post revisions" on public.post_revisions;
create policy "Authors read post revisions"
on public.post_revisions for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

drop policy if exists "Authors insert post revisions" on public.post_revisions;
create policy "Authors insert post revisions"
on public.post_revisions for insert to authenticated
with check (
  auth.uid() = edited_by
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);

drop policy if exists "Users insert own post views" on public.post_views;
create policy "Users insert own post views"
on public.post_views for insert to authenticated
with check (
  auth.uid() = viewer_id
  and public.can_view_post(post_id, auth.uid())
);

drop policy if exists "Authors read post views" on public.post_views;
create policy "Authors read post views"
on public.post_views for select to authenticated
using (
  viewer_id = auth.uid()
  or exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid()
  )
);
