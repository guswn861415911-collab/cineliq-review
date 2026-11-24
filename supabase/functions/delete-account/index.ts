import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
export function createDeletionHandler({
  admin,
  projectUrl,
  now = () => Date.now(),
}: {
  admin: SupabaseClient;
  projectUrl: string;
  now?: () => number;
}) {
  const origin = 'https://cineliq.art';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return async (request: Request) => {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers':
        'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    const response = (
      status: number,
      code: string,
      extra: Record<string, unknown> = {},
    ) => new Response(JSON.stringify({ code, ...extra }), { status, headers });
    if (request.headers.get('origin') !== origin) return response(403, 'origin_denied');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return response(405, 'method_not_allowed');
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return response(415, 'invalid_request');
    const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 16000) return response(401, 'authentication_required');
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 1024) return response(413, 'invalid_request');
      body = JSON.parse(raw);
    } catch {
      return response(400, 'invalid_request');
    }
    if (
      !body ||
      body.confirmation !== 'CINELIQ 탈퇴' ||
      !uuid.test(body.expectedUserId) ||
      Object.keys(body).some(
        (key) => !['confirmation', 'expectedUserId', 'action'].includes(key),
      ) ||
      !['check', 'delete'].includes(body.action)
    )
      return response(400, 'confirmation_required');
    try {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user) return response(401, 'authentication_required');
      const user = data.user;
      if (user.id !== body.expectedUserId) return response(409, 'account_changed');
      let claims;
      try {
        claims = JSON.parse(
          atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        );
      } catch {
        return response(401, 'authentication_required');
      }
      if (
        claims.sub !== user.id ||
        claims.role !== 'authenticated' ||
        !uuid.test(claims.session_id) ||
        claims.iss !== projectUrl.replace(/\/$/, '') + '/auth/v1' ||
        !Number.isFinite(claims.exp) ||
        claims.exp <= Math.floor(now() / 1000)
      )
        return response(401, 'authentication_required');
      const { data: check, error: checkError } = await admin.rpc(
        'cineliq_account_deletion_preflight',
        {
          target_user: user.id,
          target_session: claims.session_id,
        },
      );
      if (checkError || !check) return response(503, 'verification_unavailable');
      if (!check.active_session) return response(401, 'authentication_required');
      if (
        check.protected_account ||
        check.owns_storage ||
        user.app_metadata?.account_deletion_hold === true
      )
        return response(409, 'support_required');
      if (!check.recent_login) return response(403, 'recent_login_required');
      if (body.action === 'check') return response(200, 'ready', { userId: user.id });

      const deleted = await admin.auth.admin.deleteUser(user.id, false);
      if (deleted.error || deleted.data?.user?.id !== user.id)
        return response(503, 'deletion_unconfirmed');
      return response(200, 'deleted', { userId: user.id });
    } catch {
      return response(503, 'deletion_unconfirmed');
    }
  };
}

if (typeof Deno !== 'undefined') {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.102.0');
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !key) throw new Error('Missing server configuration');
  const admin = createClient(projectUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  Deno.serve(createDeletionHandler({ admin, projectUrl }));
}
