import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMergeTestHandler } from '../functions/account-merge-test/index.ts';
const url = 'https://testproject.supabase.co',
  origin = 'https://test.example.com',
  now = 2000000000;
const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  source = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  sid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function harness() {
  const calls = [];
  let fail = false;
  const token = (id, method = 'oauth', age = 0) =>
    'mock.' +
    Buffer.from(
      JSON.stringify({
        sub: id,
        role: 'authenticated',
        iss: url + '/auth/v1',
        session_id: sid,
        exp: now + 1000,
        amr: [{ method, timestamp: now - age }],
      }),
    ).toString('base64url') +
    '.signature';
  const admin = {
    auth: {
      getUser: async (jwt) => {
        const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
        return {
          data: {
            user: {
              id: p.sub,
              email_confirmed_at: 'confirmed',
              identities: [
                { provider: p.sub === target ? 'google' : 'kakao' },
                { provider: 'email' },
              ],
            },
          },
          error: null,
        };
      },
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'cineliq_account_deletion_preflight')
        return { data: { active_session: true, recent_login: true } };
      if (name === 'cineliq_merge_snapshot')
        return { data: { favorites: [{ user_id: source }], folders: [], entries: [] } };
      return fail
        ? { error: Error('SQL failure') }
        : { data: { state: 'data_copied_identity_pending' } };
    },
  };
  const handler = createMergeTestHandler({
    admin,
    projectUrl: url,
    allowedProjectUrl: url,
    origin,
    now: () => now * 1000,
  });
  const body = { action: 'summary', movingProvider: 'kakao', sourceToken: token(source) };
  const request = (b = body, t = token(target), o = origin) =>
    new Request(url + '/functions/v1/account-merge-test', {
      method: 'POST',
      headers: {
        origin: o,
        authorization: 'Bearer ' + t,
        'content-type': 'application/json',
      },
      body: JSON.stringify(b),
    });
  return { admin, calls, handler, body, request, token, fail: () => (fail = true) };
}
test('requires explicit test environment, never production', async () => {
  const h = harness();
  for (const projectUrl of [url, 'https://bjztgycagiartzjiotcc.supabase.co']) {
    const fn = createMergeTestHandler({
      admin: h.admin,
      projectUrl,
      allowedProjectUrl: projectUrl === url ? '' : projectUrl,
      origin,
    });
    assert.equal((await fn(h.request())).status, 503);
  }
  assert.equal(h.calls.length, 0);
});
test('summary verifies both owners; wrong origins, same owner and expired auth cannot copy', async () => {
  const h = harness();
  assert.equal(
    (await h.handler(h.request(undefined, undefined, 'https://evil.example'))).status,
    403,
  );
  assert.equal(
    (await h.handler(h.request({ ...h.body, sourceToken: h.token(target) }))).status,
    409,
  );
  assert.equal(
    (await h.handler(h.request(h.body, h.token(target, 'oauth', 301)))).status,
    403,
  );
  const r = await (await h.handler(h.request())).json();
  assert.equal(r.code, 'summary_only');
  assert.equal(r.source.favorites, 1);
  assert.ok(!h.calls.some(([name]) => name === 'cineliq_merge_copy'));
});
test('copy needs explicit consent and fresh source backup login; SQL failure is never success', async () => {
  const h = harness(),
    body = {
      ...h.body,
      action: 'copy',
      requestId: sid,
      snapshot: {},
      confirmation: 'CINELIQ 테스트 데이터 복사',
    };
  assert.equal((await h.handler(h.request(body))).status, 403);
  assert.equal(
    (await h.handler(h.request({ ...body, backupToken: h.token(target, 'password') })))
      .status,
    409,
  );
  const valid = { ...body, backupToken: h.token(source, 'password') };
  h.fail();
  assert.equal(
    (await (await h.handler(h.request(valid))).json()).code,
    'copy_unconfirmed_refresh_summary',
  );
});
test('valid copy is still not an identity merge and uses server-verified UUIDs', async () => {
  const h = harness(),
    body = {
      ...h.body,
      action: 'copy',
      requestId: sid,
      snapshot: {},
      confirmation: 'CINELIQ 테스트 데이터 복사',
      backupToken: h.token(source, 'password'),
    };
  const r = await (await h.handler(h.request(body))).json();
  assert.equal(r.code, 'data_copied_identity_pending');
  const call = h.calls.find(([name]) => name === 'cineliq_merge_copy');
  assert.equal(call[1].source_id, source);
  assert.equal(call[1].target_id, target);
  assert.equal((await h.handler(h.request({ ...body, targetId: source }))).status, 400);
});
