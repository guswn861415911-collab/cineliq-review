const fs = require('node:fs/promises'),
  path = require('node:path'),
  http = require('node:http'),
  { spawn } = require('node:child_process'),
  assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '../..');
  const server = http.createServer(async (req, res) => {
    try {
      let file = decodeURIComponent(req.url.split('?')[0]);
      if (file === '/') file = '/index.html';
      if (file === '/media-cloud.js') file = '/tests/fixtures/member-cloud.js';
      const resolved = path.resolve(root, '.' + file);
      if (!resolved.startsWith(root + path.sep)) throw Error();
      const data = await fs.readFile(resolved);
      res.setHeader(
        'Content-Type',
        {
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.html': 'text/html',
          '.svg': 'image/svg+xml',
          '.mp4': 'video/mp4',
        }[path.extname(file)] || 'application/octet-stream',
      );
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/',
    profile = path.join(root, 'work', 'verify-profile-' + Date.now());
  await fs.mkdir(profile, { recursive: true });
  const proc = spawn(
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let ws;
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      try {
        port = (
          await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
        ).split('\n')[0];
        if (port) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = j;
    });
    let seq = 0;
    const pending = new Map(),
      errors = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
      }
      if (m.method === 'Runtime.exceptionThrown')
        errors.push(
          m.params.exceptionDetails.exception?.description ||
            m.params.exceptionDetails.text,
        );
    };
    const cdp = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      if (expression.includes(';')) expression = '(()=>{' + expression + '})()';
      const result = await cdp('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails)
        throw Error(result.exceptionDetails.exception?.description);
      return result.result.value;
    };
    const check = async (expression, label) => {
      for (let i = 0; i < 80; i++) {
        try {
          if (await evaluate(expression)) {
            console.log('PASS ' + label);
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 75));
      }
      throw Error(
        label +
          ' failed. ' +
          JSON.stringify(errors) +
          ' ' +
          (await evaluate(
            "JSON.stringify({active:document.activeElement.outerHTML.slice(0,240),modal:document.querySelector('#detailModal').hidden,view:document.querySelector('.main-content').dataset.mobileView})",
          )),
      );
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp('Page.navigate', { url });

    await check(
      "document.querySelector('.member-toggle-label').textContent==='마이페이지'",
      'member ready',
    );
    await evaluate("location.hash='#my/folders'");
    await check(
      "!!document.querySelector('[data-folder-edit]')&&!document.querySelector('#newMemberFolder').disabled",
      'folders ready',
    );
    await evaluate(
      'document.querySelector(\'[data-folder-edit="11111111-1111-4111-8111-111111111111"]\').click()',
    );
    await check(
      "document.querySelector('#memberLibraryDialog').open&&document.querySelector('#memberLibraryName').value==='기존 폴더'",
      'rename prefills folder name',
    );
    await evaluate("document.querySelector('#cancelMemberLibrary').click()");
    await evaluate("document.querySelector('#newMemberFolder').click()");
    await check(
      "document.querySelector('#memberLibraryName').value===''",
      'create starts empty',
    );
    await evaluate("document.querySelector('#cancelMemberLibrary').click()");
    for (const [code, message] of [
      ['23505', '같은 이름의 폴더'],
      ['23503', '즐겨찾기 또는 폴더가 변경'],
      ['unknown', '저장하지 못했어요'],
    ]) {
      await evaluate(
        "window.CINELIQ_CLOUD.members.renameFolder=async()=>{throw {code:'" +
          code +
          "'}};document.querySelector('[data-folder-edit]').click();document.querySelector('#memberLibraryName').value='실패 검증';document.querySelector('#memberLibraryForm').requestSubmit()",
      );
      await check(
        "document.querySelector('#memberLibraryDialogStatus').textContent.includes('" +
          message +
          "')&&!document.querySelector('#cancelMemberLibrary').disabled",
        'save error ' + code,
      );
      assert.ok(await evaluate("document.querySelector('#memberLibraryDialog').open"));
      await evaluate("document.querySelector('#cancelMemberLibrary').click()");
    }
    await evaluate("location.hash='#my/profile'");
    await check(
      "!document.querySelector('[data-member-panel=profile]').hidden",
      'profile screen',
    );
    await evaluate("document.querySelector('#editMemberName').click()");
    await check(
      "document.querySelector('#memberLibraryName').value===''",
      'optional profile name starts empty',
    );
    await evaluate("document.querySelector('#cancelMemberLibrary').click()");
    assert.equal(await evaluate('__mock.data().favorites.length'), 120);
    assert.equal(await evaluate('__mock.data().folders.length'), 2);
    assert.deepEqual(errors, []);
    console.log('MEMBER EDITOR CHECKS COMPLETE');
  } finally {
    ws?.close();
    proc.kill();
    server.close();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
