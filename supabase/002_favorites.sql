begin;

create table if not exists public.cineliq_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  technique_id text not null check (technique_id ~ '^CAM-[0-9]{3}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, technique_id)
);

alter table public.cineliq_favorites enable row level security;
revoke all on public.cineliq_favorites from public, anon, authenticated;
grant select, insert, delete on public.cineliq_favorites to authenticated;

create policy cineliq_read_own_favorites on public.cineliq_favorites
  for select to authenticated using ((select auth.uid()) = user_id);
create policy cineliq_add_own_favorites on public.cineliq_favorites
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy cineliq_remove_own_favorites on public.cineliq_favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

commit;
