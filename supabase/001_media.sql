begin;

create table public.cineliq_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.cineliq_settings (
  singleton boolean primary key default true check (singleton),
  writes_enabled boolean not null default true
);
insert into public.cineliq_settings default values;
create table public.cineliq_media (
  id uuid primary key default gen_random_uuid(),
  technique_id text not null check (technique_id ~ '^CAM-[0-9]{3}$'),
  kind text not null check (kind in ('image','video')),
  object_path text not null unique,
  thumbnail_path text unique,
  position integer not null check (position > 0),
  is_primary boolean not null default false,
  original_name text not null check (length(original_name) between 1 and 255),
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text not null,
  legacy_digest text check (legacy_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (technique_id, legacy_digest)
);
create index cineliq_media_order on public.cineliq_media (technique_id, position, id);
create unique index cineliq_one_primary on public.cineliq_media (technique_id) where is_primary;

alter table public.cineliq_admins enable row level security;
alter table public.cineliq_settings enable row level security;
alter table public.cineliq_media enable row level security;
revoke all on public.cineliq_admins, public.cineliq_settings, public.cineliq_media from public, anon, authenticated;
grant select (id, technique_id, kind, object_path, thumbnail_path, position, is_primary)
  on public.cineliq_media to anon, authenticated;
create policy cineliq_public_catalog on public.cineliq_media for select to anon, authenticated using (true);

create function public.cineliq_can_write() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.cineliq_admins where user_id = auth.uid())
    and exists (select 1 from public.cineliq_settings where singleton and writes_enabled);
$$;
revoke all on function public.cineliq_can_write() from public, anon;
grant execute on function public.cineliq_can_write() to authenticated;

create function public.cineliq_file_names() returns table(id uuid, original_name text)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.original_name from public.cineliq_media m where public.cineliq_can_write();
$$;
revoke all on function public.cineliq_file_names() from public, anon;
grant execute on function public.cineliq_file_names() to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('cineliq-media','cineliq-media',false,41943040,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm']);

create policy cineliq_published_objects on storage.objects for select to anon, authenticated using (
  bucket_id = 'cineliq-media' and exists (
    select 1 from public.cineliq_media where object_path = name or thumbnail_path = name
  )
);
create policy cineliq_admin_objects on storage.objects for select to authenticated using (
  bucket_id = 'cineliq-media' and (select public.cineliq_can_write())
);
create policy cineliq_upload_objects on storage.objects for insert to authenticated with check (
  bucket_id = 'cineliq-media' and (select public.cineliq_can_write())
  and name ~ '^CAM-[0-9]{3}/[0-9a-f-]{36}(\.thumb\.jpg|\.(jpg|png|webp|mp4|webm))$'
);
create policy cineliq_remove_unused_objects on storage.objects for delete to authenticated using (
  bucket_id = 'cineliq-media' and (select public.cineliq_can_write())
  and not exists (select 1 from public.cineliq_media where object_path = name or thumbnail_path = name)
);

 
 
create function public.cineliq_change_media(
  technique text, action text, media_id uuid default null,
  path text default null, thumb text default null, filename text default null,
  bytes bigint default null, mime text default null, digest text default null
) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  current_row public.cineliq_media%rowtype;
  neighbor public.cineliq_media%rowtype;
  file_kind text;
  extension text;
  old_paths text[] := '{}';
begin
  if not public.cineliq_can_write() then
    raise exception 'Media writes are not permitted' using errcode = '42501';
  end if;
  if technique is null or technique !~ '^CAM-[0-9]{3}$' then
    raise exception 'Invalid technique';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('cineliq:' || technique));
  if action in ('replace','delete','primary','up','down') then
    select * into strict current_row from public.cineliq_media
      where id = media_id and technique_id = technique;
  end if;
  if action in ('add','replace') then
    extension := case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
      when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' end;
    file_kind := split_part(mime, '/', 1);
    if extension is null or bytes is null or bytes < 1
      or bytes > (case file_kind when 'image' then 8388608 else 41943040 end)
      or path is null or path !~ ('^' || technique || '/[0-9a-f-]{36}\.' || extension || '$')
      or not exists (select 1 from storage.objects o where o.bucket_id = 'cineliq-media'
        and o.name = path and o.metadata->>'mimetype' = mime and o.metadata->>'size' = bytes::text)
      or (thumb is not null and (file_kind <> 'image'
        or thumb <> regexp_replace(path, '\.[^.]+$', '.thumb.jpg')
        or not exists (select 1 from storage.objects o where o.bucket_id = 'cineliq-media'
          and o.name = thumb and o.metadata->>'mimetype' = 'image/jpeg'
          and (o.metadata->>'size')::bigint between 1 and 1048576))) then
      raise exception 'Invalid stored media';
    end if;
    if action = 'add' then
      if digest is not null and exists (
        select 1 from public.cineliq_media where technique_id = technique and legacy_digest = digest
      ) then
        return array_remove(array[path,thumb],null);
      end if;
      insert into public.cineliq_media(technique_id,kind,object_path,thumbnail_path,position,is_primary,original_name,size_bytes,mime_type,legacy_digest)
      select technique,file_kind,path,thumb,coalesce(max(position),0)+1,count(*)=0,filename,bytes,mime,digest
      from public.cineliq_media where technique_id = technique;
    else
      if current_row.kind <> file_kind or current_row.object_path = path then raise exception 'Invalid replacement'; end if;
      update public.cineliq_media set object_path=path,thumbnail_path=thumb,original_name=filename,
        size_bytes=bytes,mime_type=mime,updated_at=now() where id=media_id;
      old_paths := array[current_row.object_path,current_row.thumbnail_path];
    end if;
  elsif action = 'delete' then
    delete from public.cineliq_media where id=media_id;
    if current_row.is_primary then
      update public.cineliq_media set is_primary=true,updated_at=now() where id=(
        select id from public.cineliq_media where technique_id=technique order by position,id limit 1
      );
    end if;
    old_paths := array[current_row.object_path,current_row.thumbnail_path];
  elsif action = 'primary' then
    update public.cineliq_media set is_primary=false,updated_at=now() where technique_id=technique and is_primary;
    update public.cineliq_media set is_primary=true,updated_at=now() where id=media_id;
  elsif action = 'up' or action = 'down' then
    if action = 'up' then
      select * into neighbor from public.cineliq_media where technique_id=technique and position<current_row.position
        order by position desc limit 1;
    else
      select * into neighbor from public.cineliq_media where technique_id=technique and position>current_row.position
        order by position limit 1;
    end if;
    if neighbor.id is not null then
      update public.cineliq_media set position=case when id=media_id then neighbor.position else current_row.position end,
        updated_at=now() where id in (media_id, neighbor.id);
    end if;
  else
    raise exception 'Unknown media action';
  end if;
  return array_remove(old_paths,null);
end;
$$;
revoke all on function public.cineliq_change_media(text,text,uuid,text,text,text,bigint,text,text) from public, anon;
grant execute on function public.cineliq_change_media(text,text,uuid,text,text,text,bigint,text,text) to authenticated;

commit;
