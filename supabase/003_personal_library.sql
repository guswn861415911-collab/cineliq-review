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
