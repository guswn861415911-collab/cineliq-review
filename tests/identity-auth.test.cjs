const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-cloud.js'), 'utf8');
function harness(initial = ['google']) {
  let userId = 'owner-a',
    cachedId = 'owner-a',
    providers = initial.slice(),
    unlinkNoop = false;
  const calls = [];
  const enabled = { google: true, kakao: true };
  const identities = () =>
    providers.map((provider) => ({
      provider,
      identity_id: provider + '-id',
      user_id: userId,
    }));
  const auth = {
    getUser: async () => ({
      data: { user: { id: userId, email: null, identities: identities() } },
    }),
    getSession: async () => ({ data: { session: { user: { id: cachedId } } } }),
    linkIdentity: async (options) => {
      calls.push({ kind: 'link', options });
      return { data: { url: 'https://provider.example/authorize' } };
    },
    unlinkIdentity: async (row) => {
      calls.push({ kind: 'unlink', provider: row.provider });
      if (!unlinkNoop) providers = providers.filter((p) => p !== row.provider);
      return { data: {} };
    },
    signInWithOAuth: async (options) => {
      calls.push({ kind: 'login', options });
      return { data: {} };
    },
  };
  const window = {
    CINELIQ_MEDIA_CONFIG: {
      projectUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_test',
    },
  };
  vm.runInNewContext(source.replace(/await import\('[^']*supabase-js[^']*'\)/, 'sdk'), {
    window,
    URL,
    location: { href: 'https://cineliq.art/#my/accounts' },
    fetch: async () => ({ ok: true, json: async () => ({ external: enabled }) }),
    sdk: {
      createClient: () => ({
        auth,
        from: () => {
          throw Error('Member data must not be mutated during linking');
        },
      }),
    },
  });
  return {
    cloud: window.CINELIQ_CLOUD,
    calls,
    enabled,
    setUser: (id) => (userId = id),
    setSession: (id) => (cachedId = id),
    setNoop: () => (unlinkNoop = true),
  };
}
test('Google and Kakao linking use only official linkIdentity, same UUID and email-free Kakao scope', async () => {
  for (const [initial, target] of [
    ['google', 'kakao'],
    ['kakao', 'google'],
  ]) {
    const h = harness([initial]);
    await h.cloud.connect();
    assert.equal(
      await h.cloud.members.linkIdentity(target, 'owner-a'),
      'https://provider.example/authorize',
    );
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].kind, 'link');
    const { provider, options } = h.calls[0].options;
    assert.equal(provider, target);
    assert.equal(options.redirectTo, 'https://cineliq.art/');
    assert.equal(options.skipBrowserRedirect, true);
    assert.equal(options.queryParams.prompt, 'select_account');
    if (target === 'kakao') {
      assert.equal(options.queryParams.scope, 'profile_image,profile_nickname');
      assert.ok(!options.queryParams.scope.includes('account_email'));
    }
    assert.equal((await h.cloud.members.identityState('owner-a')).userId, 'owner-a');
  }
});
test('same-user identity, disabled provider and session changes cannot start another link', async () => {
  const h = harness();
  await h.cloud.connect();
  await assert.rejects(h.cloud.members.linkIdentity('google', 'owner-a'), {
    code: 'identity_already_linked',
  });
  h.enabled.kakao = false;
  await assert.rejects(h.cloud.members.linkIdentity('kakao', 'owner-a'), {
    code: 'provider_unavailable',
  });
  h.setSession('owner-b');
  await assert.rejects(h.cloud.members.linkIdentity('kakao', 'owner-a'), {
    code: 'identity_session_changed',
  });
  assert.equal(h.calls.length, 0);
});
test('unlink protects the last usable social identity and checks server UUID/provider removal', async () => {
  const single = harness();
  await single.cloud.connect();
  await assert.rejects(
    single.cloud.members.unlinkIdentity(
      { identity_id: 'google-id', provider: 'google' },
      'owner-a',
    ),
    { code: 'single_identity_not_deletable' },
  );
  assert.equal(single.calls.length, 0);
  const h = harness(['google', 'kakao']);
  await h.cloud.connect();
  const state = await h.cloud.members.unlinkIdentity(
    { identity_id: 'kakao-id', provider: 'kakao' },
    'owner-a',
  );
  assert.equal(state.userId, 'owner-a');
  assert.deepEqual(
    Array.from(state.identities, (row) => row.provider),
    ['google'],
  );
  const noop = harness(['google', 'kakao']);
  await noop.cloud.connect();
  noop.setNoop();
  await assert.rejects(
    noop.cloud.members.unlinkIdentity(
      { identity_id: 'kakao-id', provider: 'kakao' },
      'owner-a',
    ),
    { code: 'identity_still_linked' },
  );
});
