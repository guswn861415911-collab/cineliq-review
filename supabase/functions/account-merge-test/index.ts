import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
export function createMergeTestHandler({
  admin,
  projectUrl,
  allowedProjectUrl,
  origin,
  now = () => Date.now(),
}: {
  admin: SupabaseClient;
  projectUrl: string;
  allowedProjectUrl: string;
  origin: string;
  now?: () => number;
}) {
  const production = 'https://bjztgycagiartzjiotcc.supabase.co';
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  return async (request: Request) => {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    };
    const reply = (status: number, code: string, extra: Record<string, unknown> = {}) =>
      new Response(JSON.stringify({ code, ...extra }), { status, headers });
    if (
      !allowedProjectUrl ||
      projectUrl !== allowedProjectUrl ||
      projectUrl.replace(/\/$/, '') === production ||
      !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(projectUrl) ||
      !/^https:\/\//.test(origin)
    )
      return reply(503, 'test_environment_required');
    if (request.headers.get('origin') !== origin) return reply(403, 'origin_denied');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'method_not_allowed');
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return reply(415, 'invalid_request');
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 1000000) return reply(413, 'invalid_request');
      body = JSON.parse(raw);
    } catch {
      return reply(400, 'invalid_request');
    }
    if (
      !body ||
      !['summary', 'copy'].includes(body.action) ||
      !['google', 'kakao'].includes(body.movingProvider) ||
      Object.keys(body).some(
        (key) =>
          ![
            'action',
            'sourceToken',
            'backupToken',
            'movingProvider',
            'requestId',
            'snapshot',
            'confirmation',
          ].includes(key),
      )
    )
      return reply(400, 'invalid_request');
    const targetToken = request.headers
      .get('authorization')
      ?.match(/^Bearer (\S+)$/i)?.[1];
    async function verify(token: unknown, password = false) {
      if (typeof token !== 'string' || token.length > 16000) throw Error('auth');
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user) throw Error('auth');
      const user = data.user;
      const claims = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      );
      const seconds = Math.floor(now() / 1000);
      if (
        claims.sub !== user.id ||
        claims.role !== 'authenticated' ||
        claims.iss !== projectUrl + '/auth/v1' ||
        !uuid.test(claims.session_id) ||
        !Number.isFinite(claims.exp) ||
        claims.exp <= seconds ||
        !claims.amr?.some(
          (row: { method: string; timestamp: number }) =>
            row.method === (password ? 'password' : 'oauth') &&
            Number.isFinite(row.timestamp) &&
            row.timestamp <= seconds &&
            row.timestamp >= seconds - 300,
        )
      )
        throw Error('auth');
      const { data: check, error: checkError } = await admin.rpc(
        'cineliq_account_deletion_preflight',
        { target_user: user.id, target_session: claims.session_id },
      );
      if (checkError || !check?.active_session || !check.recent_login)
        throw Error('auth');
      if (
        check.protected_account ||
        check.owns_storage ||
        user.app_metadata?.account_deletion_hold
      )
        throw Error('protected');
      if (
        password &&
        (!user.email_confirmed_at ||
          !user.identities?.some((row) => row.provider === 'email'))
      )
        throw Error('backup');
      return user;
    }
    try {
      const target = await verify(targetToken),
        source = await verify(body.sourceToken);
      if (target.id === source.id) return reply(409, 'distinct_accounts_required');
      if (
        !source.identities?.some((row) => row.provider === body.movingProvider) ||
        target.identities?.some((row) => row.provider === body.movingProvider)
      )
        return reply(409, 'identity_state_changed');
      if (body.action === 'summary') {
        const { data, error } = await admin.rpc('cineliq_merge_snapshot', {
          a: source.id,
          b: target.id,
        });
        if (error || !data) return reply(503, 'summary_unavailable');
        const counts = (id: string) => ({
          favorites: data.favorites.filter((r: { user_id: string }) => r.user_id === id)
            .length,
          folders: data.folders.filter((r: { user_id: string }) => r.user_id === id)
            .length,
          entries: data.entries.filter((r: { user_id: string }) => r.user_id === id)
            .length,
        });
        return reply(200, 'summary_only', {
          sourceId: source.id,
          targetId: target.id,
          source: counts(source.id),
          target: counts(target.id),
          snapshot: data,
        });
      }
      if (
        body.confirmation !== 'CINELIQ 테스트 데이터 복사' ||
        !uuid.test(body.requestId) ||
        !body.snapshot
      )
        return reply(400, 'confirmation_required');

      const backup = await verify(body.backupToken, true);
      if (backup.id !== source.id) return reply(409, 'backup_account_mismatch');
      const { data, error } = await admin.rpc('cineliq_merge_copy', {
        request_id: body.requestId,
        source_id: source.id,
        target_id: target.id,
        expected_snapshot: body.snapshot,
      });
      if (error || !data) return reply(409, 'copy_unconfirmed_refresh_summary');
      return reply(200, 'data_copied_identity_pending', { result: data });
    } catch {
      return reply(403, 'fresh_auth_and_verified_backup_required');
    }
  };
}
if (typeof Deno !== 'undefined') {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.102.0');
  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(
    projectUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  Deno.serve(
    createMergeTestHandler({
      admin,
      projectUrl,
      allowedProjectUrl: Deno.env.get('CINELIQ_MERGE_TEST_PROJECT_URL') ?? '',
      origin: Deno.env.get('CINELIQ_MERGE_TEST_ORIGIN') ?? '',
    }),
  );
}
