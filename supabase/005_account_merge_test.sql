 
 
begin;
create table public.cineliq_merge_backups (
  id uuid primary key,
  source_user uuid not null,
  target_user uuid not null,
  created_at timestamptz not null default now(),
  snapshot jsonb not null,
  folder_map jsonb not null,
  check(source_user<>target_user),
  unique(source_user,target_user)
);
alter table public.cineliq_merge_backups enable row level security;
revoke all on public.cineliq_merge_backups from public,anon,authenticated;
grant select,insert on public.cineliq_merge_backups to service_role;

create function public.cineliq_merge_snapshot(a uuid,b uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'favorites',coalesce((select jsonb_agg(to_jsonb(f) order by f.user_id,f.technique_id)
   from public.cineliq_favorites f where user_id in(a,b)),'[]'::jsonb),
 'folders',coalesce((select jsonb_agg(to_jsonb(f) order by f.user_id,f.id)
   from public.cineliq_folders f where user_id in(a,b)),'[]'::jsonb),
 'entries',coalesce((select jsonb_agg(to_jsonb(f) order by f.user_id,f.folder_id,f.technique_id)
   from public.cineliq_folder_items f where user_id in(a,b)),'[]'::jsonb));
$$;

create function public.cineliq_merge_copy(request_id uuid,source_id uuid,target_id uuid,expected_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.cineliq_merge_backups; snapshot jsonb; mapping jsonb='{}'; f record;
 new_id uuid; new_name text; suffix text; counter integer;
begin
 if source_id=target_id or source_id is null or target_id is null then raise exception 'invalid_pair'; end if;
  
 lock table public.cineliq_favorites,public.cineliq_folders,public.cineliq_folder_items,
   public.cineliq_merge_backups in share row exclusive mode;
 select * into saved from public.cineliq_merge_backups where id=request_id;
 if found then
   if saved.source_user<>source_id or saved.target_user<>target_id then raise exception 'request_conflict'; end if;
   return jsonb_build_object('state','data_copied_identity_pending','requestId',saved.id,'folderMap',saved.folder_map);
 end if;
 if exists(select 1 from public.cineliq_merge_backups where source_user=source_id and target_user=target_id)
   then raise exception 'pair_already_copied'; end if;
 if not exists(select 1 from auth.users where id=source_id) or not exists(select 1 from auth.users where id=target_id)
   then raise exception 'unknown_user'; end if;
 if exists(select 1 from public.cineliq_admins where user_id in(source_id,target_id))
   or exists(select 1 from storage.objects where owner_id in(source_id::text,target_id::text) or owner in(source_id,target_id))
   then raise exception 'protected_account'; end if;
 snapshot=public.cineliq_merge_snapshot(source_id,target_id);
 if expected_snapshot is distinct from snapshot then raise exception 'summary_changed'; end if;
 insert into public.cineliq_favorites(user_id,technique_id,created_at)
 select target_id,technique_id,created_at from public.cineliq_favorites where user_id=source_id
 on conflict(user_id,technique_id) do nothing;
 for f in select * from public.cineliq_folders where user_id=source_id order by id loop
   new_id=gen_random_uuid();new_name=f.name;counter=0;
   while exists(select 1 from public.cineliq_folders where user_id=target_id and name=new_name) loop
     counter=counter+1;suffix=' (통합 '||counter||')';new_name=left(f.name,60-char_length(suffix))||suffix;
   end loop;
   insert into public.cineliq_folders(id,user_id,name,created_at) values(new_id,target_id,new_name,f.created_at);
   mapping=mapping||jsonb_build_object(f.id::text,new_id);
   insert into public.cineliq_folder_items(user_id,folder_id,technique_id,created_at)
   select target_id,new_id,technique_id,created_at from public.cineliq_folder_items where user_id=source_id and folder_id=f.id;
 end loop;
 insert into public.cineliq_merge_backups values(request_id,source_id,target_id,now(),snapshot,mapping);
 return jsonb_build_object('state','data_copied_identity_pending','requestId',request_id,'folderMap',mapping);
end;
$$;
revoke all on function public.cineliq_merge_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function public.cineliq_merge_copy(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cineliq_merge_snapshot(uuid,uuid) to service_role;
grant execute on function public.cineliq_merge_copy(uuid,uuid,uuid,jsonb) to service_role;
commit;
