import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeletionHandler } from '../functions/delete-account/index.ts';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  sessionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const projectUrl = 'https://testproject.supabase.co';
let state, calls;
const payload = {
  sub: userId,
  role: 'authenticated',
  session_id: sessionId,
  iss: projectUrl + '/auth/v1',
  exp: 2000000100,
};
const token = (p) =>
  'test.' + Buffer.from(JSON.stringify(p)).toString('base64url') + '.verified-by-mock';
function reset() {
  calls = [];
  state = {
    user: { id: userId, app_metadata: {} },
    check: {
      active_session: true,
      recent_login: true,
      protected_account: false,
      owns_storage: false,
    },
  };
}
const admin = {
  auth: {
    getUser: async (jwt) => {
      calls.push(['getUser', jwt]);
      return { data: { user: state.user }, error: state.authError };
    },
    admin: {
      deleteUser: async (id, soft) => {
        calls.push(['deleteUser', id, soft]);
        if (state.throwDelete) throw Error('Sensitive upstream detail');
        return { data: { user: { id } }, error: state.deleteError };
      },
    },
  },
  rpc: async (name, args) => {
    calls.push(['rpc', name, args]);
    return { data: state.check, error: state.rpcError };
  },
};
const handler = createDeletionHandler({
  admin,
  projectUrl,
  now: () => 2000000000 * 1000,
});
function req({
  origin = 'https://cineliq.art',
  method = 'POST',
  body = { action: 'delete', confirmation: 'CINELIQ 탈퇴', expectedUserId: userId },
  jwt = token(payload),
  type = 'application/json',
} = {}) {
  return new Request('https://testproject.supabase.co/functions/v1/delete-account', {
    method,
    headers: { Origin: origin, Authorization: 'Bearer ' + jwt, 'Content-Type': type },
    ...(method === 'OPTIONS' || method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}
async function expect(code, options = {}) {
  const res = await handler(req(options));
  assert.equal((await res.json()).code, code);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  return res;
}
test('self-deletion authorization, safety guards and error paths', async () => {
  reset();
  await expect('origin_denied', { origin: 'https://evil.example' });
  assert.equal(calls.length, 0);
  reset();
  assert.equal((await handler(req({ method: 'OPTIONS' }))).status, 204);
  assert.equal(calls.length, 0);
  reset();
  await expect('method_not_allowed', { method: 'GET' });
  assert.equal(calls.length, 0);
  reset();
  await expect('invalid_request', { type: 'text/plain' });
  assert.equal(calls.length, 0);
  reset();
  await expect('confirmation_required', {
    body: {
      action: 'delete',
      confirmation: 'CINELIQ 탈퇴',
      expectedUserId: userId,
      targetUserId: otherId,
    },
  });
  assert.equal(calls.length, 0);
  reset();
  await expect('confirmation_required', {
    body: { action: 'delete', confirmation: 'yes', expectedUserId: userId },
  });
  assert.equal(calls.length, 0);
  reset();
  state.authError = { message: 'expired' };
  await expect('authentication_required');
  assert.equal(calls.filter((x) => x[0] === 'deleteUser').length, 0);
  reset();
  await expect('account_changed', {
    body: { action: 'delete', confirmation: 'CINELIQ 탈퇴', expectedUserId: otherId },
  });
  assert.equal(calls.filter((x) => x[0] === 'rpc').length, 0);
  for (const p of [
    { ...payload, sub: otherId },
    { ...payload, role: 'service_role' },
    { ...payload, exp: 1999999999 },
    { ...payload, iss: 'https://evil.example/auth/v1' },
    { ...payload, session_id: 'wrong' },
  ]) {
    reset();
    await expect('authentication_required', { jwt: token(p) });
    assert.equal(calls.filter((x) => x[0] === 'deleteUser').length, 0);
  }
  reset();
  state.check.active_session = false;
  await expect('authentication_required');
  reset();
  state.check.recent_login = false;
  await expect('recent_login_required');
  reset();
  state.check.protected_account = true;
  await expect('support_required');
  reset();
  state.check.owns_storage = true;
  await expect('support_required');
  reset();
  state.user.app_metadata.account_deletion_hold = true;
  await expect('support_required');
  reset();
  state.rpcError = { message: 'Missing migration' };
  await expect('verification_unavailable');
  reset();
  await expect('ready', {
    body: { action: 'check', confirmation: 'CINELIQ 탈퇴', expectedUserId: userId },
  });
  assert.equal(calls.filter((x) => x[0] === 'deleteUser').length, 0);
  reset();
  state.deleteError = { message: 'Internal secret' };
  let res = await expect('deletion_unconfirmed');
  assert.equal(res.status, 503);
  reset();
  state.throwDelete = true;
  await expect('deletion_unconfirmed');
  reset();
  await expect('deleted');
  assert.deepEqual(
    calls.find((x) => x[0] === 'rpc'),
    [
      'rpc',
      'cineliq_account_deletion_preflight',
      { target_user: userId, target_session: sessionId },
    ],
  );
  assert.deepEqual(
    calls.filter((x) => x[0] === 'deleteUser'),
    [['deleteUser', userId, false]],
  );
  assert.equal(
    calls.some((x) => JSON.stringify(x).includes(otherId)),
    false,
  );
});
