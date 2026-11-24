const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
function setup(members) {
  const nodes = new Map(),
    events = {};
  const dialog = {
    open: false,
    setAttribute() {},
    querySelector(key) {
      if (!nodes.has(key)) nodes.set(key, {});
      return nodes.get(key);
    },
    addEventListener(key, fn) {
      events[key] = fn;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
      events.close?.();
    },
  };
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(require('node:path').join(__dirname, '../member-merge.js'), 'utf8'),
    { window, document: { createElement: () => dialog, body: { append() {} } } },
  );
  return { notice: window.CINELIQ_MERGE_NOTICE({ members }), dialog, nodes };
}
test('notice reads only the verified current user and never mutates accounts', async () => {
  const calls = [];
  const h = setup({
    identityState: async (id) => calls.push(['verify', id]),
    favorites: async (id) => {
      calls.push(['favorites', id]);
      return [{}];
    },
    library: async (id) => {
      calls.push(['library', id]);
      return { folders: [{}, {}], entries: [{}, {}, {}] };
    },
  });
  h.notice.show('current-user');
  assert.equal(h.dialog.open, true);
  await h.nodes.get('.merge-review').onclick();
  assert.deepEqual(calls, [
    ['verify', 'current-user'],
    ['favorites', 'current-user'],
    ['library', 'current-user'],
    ['verify', 'current-user'],
  ]);
  assert.match(h.nodes.get('.merge-summary').textContent, /즐겨찾기 1개 · 개인 폴더 2개/);
  assert.match(h.dialog.innerHTML, /지금은 통합을 실행할 수 없습니다/);
});
test('session changes close the notice and suppress late private results', async () => {
  let resolve;
  const waiting = new Promise((r) => (resolve = r));
  const h = setup({
    identityState: async () => {},
    favorites: async () => {
      await waiting;
      return [{}];
    },
    library: async () => ({ folders: [], entries: [] }),
  });
  h.notice.show('a');
  const pending = h.nodes.get('.merge-review').onclick();
  h.notice.sync('b');
  resolve();
  await pending;
  assert.equal(h.dialog.open, false);
  assert.equal(h.nodes.get('.merge-summary').textContent, '');
});
test('unverified sessions cannot read counts or display success', async () => {
  const h = setup({
    identityState: async () => {
      throw Error('changed');
    },
    favorites: async () => {
      throw Error('must not read');
    },
  });
  h.notice.show('a');
  await h.nodes.get('.merge-review').onclick();
  assert.match(h.nodes.get('.merge-summary').textContent, /확인하지 못했어요/);
  h.nodes.get('.merge-cancel').onclick();
  assert.equal(h.dialog.open, false);
});
