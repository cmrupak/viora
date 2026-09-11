-- Viora: profile gender + password reset OTPs (custom SMTP flow)

alter table public.profiles
  add column if not exists gender text;

-- Server-only OTP store (service role). Clients never access this table.
create table if not exists public.password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_otps_email_idx
  on public.password_reset_otps (email);

create index if not exists password_reset_otps_expires_idx
  on public.password_reset_otps (expires_at);

alter table public.password_reset_otps enable row level security;
-- No policies for anon/authenticated — only service_role bypasses RLS.

-- Extend signup trigger to store DOB + gender from auth metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
  meta_display text;
  meta_dob date;
  meta_gender text;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g'));
  if base_username is null or length(base_username) < 3 then
    base_username := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  final_username := base_username;

  if exists (select 1 from public.profiles where username = final_username) then
    final_username := base_username || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  meta_display := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          new.raw_user_meta_data->>'first_name',
          new.raw_user_meta_data->>'last_name'
        )
      ),
      ''
    ),
    initcap(base_username)
  );

  begin
    meta_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date;
  exception when others then
    meta_dob := null;
  end;

  meta_gender := nullif(new.raw_user_meta_data->>'gender', '');

  insert into public.profiles (id, username, display_name, bio, avatar_url, date_of_birth, gender)
  values (
    new.id,
    final_username,
    meta_display,
    null,
    null,
    meta_dob,
    meta_gender
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
