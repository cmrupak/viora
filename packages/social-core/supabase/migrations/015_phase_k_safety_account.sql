-- Viora Phase K: safety / account / a11y prefs
-- Additive only. Hard delete + data export fulfilled via Netlify Functions (service role).

-- ---------------------------------------------------------------------------
-- User settings (language, sensitive filter, login alerts, a11y)
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  language text not null default 'en'
    check (language in ('en', 'es', 'fr', 'de', 'hi', 'pt')),
  hide_sensitive boolean not null default false,
  login_alerts boolean not null default true,
  reduce_motion boolean not null default false,
  theme_preference text not null default 'system'
    check (theme_preference in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "Users manage own settings" on public.user_settings;
create policy "Users manage own settings"
on public.user_settings for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.ensure_user_settings(p_user_id uuid default auth.uid())
returns public.user_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.user_settings;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_user_id <> auth.uid() then
    raise exception 'Forbidden';
  end if;

  insert into public.user_settings (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into row from public.user_settings where user_id = p_user_id;
  return row;
end;
$$;

revoke all on function public.ensure_user_settings(uuid) from public;
grant execute on function public.ensure_user_settings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Login events (activity / alerts)
-- ---------------------------------------------------------------------------
create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ip_hint text,
  user_agent text,
  device_label text,
  created_at timestamptz not null default now()
);

create index if not exists login_events_user_id_idx
  on public.login_events (user_id, created_at desc);

alter table public.login_events enable row level security;

drop policy if exists "Users view own login events" on public.login_events;
create policy "Users view own login events"
on public.login_events for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own login events" on public.login_events;
create policy "Users insert own login events"
on public.login_events for insert to authenticated
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Activity log (account actions)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_user_id_idx
  on public.activity_log (user_id, created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "Users view own activity log" on public.activity_log;
create policy "Users view own activity log"
on public.activity_log for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own activity log" on public.activity_log;
create policy "Users insert own activity log"
on public.activity_log for insert to authenticated
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Data export requests (fulfilled by Netlify Function)
-- ---------------------------------------------------------------------------
create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  download_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_export_requests_user_id_idx
  on public.data_export_requests (user_id, created_at desc);

drop trigger if exists data_export_requests_set_updated_at on public.data_export_requests;
create trigger data_export_requests_set_updated_at
before update on public.data_export_requests
for each row execute function public.set_updated_at();

alter table public.data_export_requests enable row level security;

drop policy if exists "Users manage own export requests" on public.data_export_requests;
create policy "Users manage own export requests"
on public.data_export_requests for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Hard delete requests (fulfilled by Netlify Function + Auth Admin)
-- ---------------------------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_user_id_idx
  on public.account_deletion_requests (user_id, created_at desc);

drop trigger if exists account_deletion_requests_set_updated_at on public.account_deletion_requests;
create trigger account_deletion_requests_set_updated_at
before update on public.account_deletion_requests
for each row execute function public.set_updated_at();

alter table public.account_deletion_requests enable row level security;

drop policy if exists "Users manage own deletion requests" on public.account_deletion_requests;
create policy "Users manage own deletion requests"
on public.account_deletion_requests for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Sensitive content flag on posts
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists is_sensitive boolean not null default false;

-- ---------------------------------------------------------------------------
-- Private storage for account exports
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-exports',
  'account-exports',
  false,
  52428800,
  array['application/json', 'application/zip', 'text/plain']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own account exports" on storage.objects;
create policy "Users read own account exports"
on storage.objects for select to authenticated
using (
  bucket_id = 'account-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Service role writes account exports" on storage.objects;
-- Inserts/updates for exports are done with service_role (bypasses RLS).
