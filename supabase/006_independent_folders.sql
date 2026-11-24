 
begin;
do $$
declare constraint_name text;
begin
 select c.conname into strict constraint_name from pg_constraint c
 where c.conrelid='public.cineliq_folder_items'::regclass and c.contype='f'
 and c.confrelid='public.cineliq_favorites'::regclass;
 execute format('alter table public.cineliq_folder_items drop constraint %I',constraint_name);
end $$;
alter table public.cineliq_folder_items add constraint cineliq_folder_technique_format
 check(technique_id ~ '^CAM-[0-9]{3}$');
create function public.cineliq_set_technique_folders(technique text,selected_folders uuid[],expected_folders uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare owner_id uuid=auth.uid(); current_ids uuid[]; chosen uuid[]; expected uuid[];
begin
 if owner_id is null then raise exception 'authentication_required';end if;
 if technique is null or technique !~ '^CAM-[0-9]{3}$' then raise exception 'invalid_technique';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':'||technique,0));
 select coalesce(array_agg(x order by x),'{}'::uuid[]) into chosen from(select distinct unnest(coalesce(selected_folders,'{}'::uuid[])) x) t;
 select coalesce(array_agg(x order by x),'{}'::uuid[]) into expected from(select distinct unnest(coalesce(expected_folders,'{}'::uuid[])) x) t;
 if exists(select 1 from unnest(chosen) x where x is null or not exists(select 1 from public.cineliq_folders f where f.id=x and f.user_id=owner_id)) then raise exception 'folder_changed';end if;
 select coalesce(array_agg(folder_id order by folder_id),'{}'::uuid[]) into current_ids from public.cineliq_folder_items where user_id=owner_id and technique_id=technique;
 if current_ids<>expected then raise exception 'folder_membership_changed';end if;
 delete from public.cineliq_folder_items where user_id=owner_id and technique_id=technique and not(folder_id=any(chosen));
 insert into public.cineliq_folder_items(user_id,folder_id,technique_id)
 select owner_id,x,technique from unnest(chosen) x on conflict do nothing;
end;$$;
revoke all on function public.cineliq_set_technique_folders(text,uuid[],uuid[]) from public,anon;
grant execute on function public.cineliq_set_technique_folders(text,uuid[],uuid[]) to authenticated;
create function public.cineliq_folder_storage_version() returns integer language sql immutable set search_path='' as $$select 2;$$;
revoke all on function public.cineliq_folder_storage_version() from public,anon;
grant execute on function public.cineliq_folder_storage_version() to authenticated;
commit;
