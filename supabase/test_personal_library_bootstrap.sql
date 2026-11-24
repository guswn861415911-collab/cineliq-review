 
 
begin;
create table public.cineliq_admins(user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.cineliq_admins enable row level security;
revoke all on public.cineliq_admins from public,anon,authenticated;
commit;
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

begin;

create table public.cineliq_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name)
);

create table public.cineliq_folder_items (
  user_id uuid not null default auth.uid(),
  folder_id uuid not null,
  technique_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, folder_id, technique_id),
  foreign key (user_id, folder_id) references public.cineliq_folders(user_id, id) on delete cascade,
  foreign key (user_id, technique_id) references public.cineliq_favorites(user_id, technique_id) on delete cascade
);

create function public.cineliq_folder_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger cineliq_folder_updated_at before update on public.cineliq_folders
for each row execute function public.cineliq_folder_updated_at();

alter table public.cineliq_folders enable row level security;
alter table public.cineliq_folder_items enable row level security;
revoke all on public.cineliq_folders, public.cineliq_folder_items from public, anon, authenticated;
grant select, insert, delete on public.cineliq_folders to authenticated;
grant update(name) on public.cineliq_folders to authenticated;
grant select, insert, delete on public.cineliq_folder_items to authenticated;

create policy cineliq_own_folders on public.cineliq_folders
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy cineliq_own_folder_items on public.cineliq_folder_items
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

commit;

begin;

 
create function public.cineliq_account_deletion_preflight(target_user uuid, target_session uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'active_session', exists(select 1 from auth.sessions s where s.id=target_session and s.user_id=target_user),
    'recent_login', exists(select 1 from auth.sessions s where s.id=target_session and s.user_id=target_user
      and s.created_at >= pg_catalog.now() - interval '5 minutes' and s.created_at <= pg_catalog.now()),
    'protected_account', exists(select 1 from public.cineliq_admins a where a.user_id=target_user),
    'owns_storage', exists(select 1 from storage.objects o where o.owner_id=target_user::text or o.owner=target_user)
  );
$$;
revoke all on function public.cineliq_account_deletion_preflight(uuid,uuid) from public, anon, authenticated;
grant execute on function public.cineliq_account_deletion_preflight(uuid,uuid) to service_role;

commit;
