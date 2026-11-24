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
