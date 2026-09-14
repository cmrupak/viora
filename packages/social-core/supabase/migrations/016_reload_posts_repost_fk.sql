-- Reload PostgREST schema cache so embeds (e.g. posts.repost_of_id → posts) resolve.
-- Also ensure the self-FK is named as the client expects.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_repost_of_id_fkey'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_repost_of_id_fkey
      foreign key (repost_of_id) references public.posts (id) on delete set null;
  end if;
end $$;

notify pgrst, 'reload schema';
