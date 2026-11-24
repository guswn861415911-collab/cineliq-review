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

    await check("document.querySelectorAll('.tech-card').length>0", 'catalog ready');
    await check(
      "document.querySelector('.member-toggle-label').textContent==='마이페이지'",
      'member session ready',
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.site-menu-links a').length"),
      1,
    );
    assert.equal(
      await evaluate("document.querySelector('.site-menu-links a').textContent"),
      '실무 용어집',
    );
    assert.equal(await evaluate("document.querySelector('.sidebar-footer')"), null);
    await check(
      "document.querySelector('#adminToggle').hidden",
      'normal member has no media management',
    );
    for (const width of [1440, 390, 320]) {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      await evaluate("document.querySelector('#navToggle').click()");
      await check(
        "document.body.classList.contains('menu-open')&&document.body.style.position==='fixed'",
        'menu scroll lock ' + width,
      );
      assert.ok(
        await evaluate(
          "[...document.querySelector('.sidebar-inner').children].findIndex(e=>e.classList.contains('site-menu-links'))>[...document.querySelector('.sidebar-inner').children].findIndex(e=>e.id==='sectionNav')",
        ),
      );
      assert.ok(
        await evaluate(
          "document.querySelector('#techniqueNav').scrollHeight>document.querySelector('#techniqueNav').clientHeight",
        ),
      );
      await evaluate(
        "document.querySelector('.menu-theme select').value='light';document.querySelector('.menu-theme select').dispatchEvent(new Event('change'))",
      );
      await check(
        "document.querySelector('#memberPage [data-theme-control]').value==='light'&&!document.querySelector('.menu-theme select').disabled",
        'theme shared ' + width,
      );
      await evaluate(
        "document.querySelector('.menu-accessibility').open=true;const c=document.querySelector('.menu-accessibility [data-a11y=links]');c.checked=true;c.dispatchEvent(new Event('change'))",
      );
      await check(
        "document.querySelector('#memberPage [data-a11y=links]').checked&&!document.querySelector('.menu-accessibility [data-a11y=links]').disabled",
        'accessibility shared ' + width,
      );
      await evaluate("document.querySelector('.menu-accessibility summary').focus()");
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
      assert.ok(
        await evaluate(
          "document.querySelector('#techniqueNav').contains(document.activeElement)",
        ),
      );
      await evaluate("document.querySelector('#mobileMenuClose').click()");
      await check(
        "!document.body.classList.contains('menu-open')&&document.body.style.position!== 'fixed'&&document.activeElement.id==='navToggle'",
        'close unlock and focus ' + width,
      );
      await evaluate("document.querySelector('.brand').click()");
      await check("location.hash==='#home'", 'logo home ' + width);
      await evaluate("document.querySelector('#memberToggle').click()");
      await check("location.hash.startsWith('#my')", 'header My CINELIQ ' + width);
      await evaluate(
        "document.querySelector('#navToggle').click();document.querySelector('[data-major=all]').click()",
      );
      await check(
        "document.querySelector('#visibleCount').textContent==='414'&&!document.body.classList.contains('menu-open')",
        'all techniques ' + width,
      );
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    }
    await evaluate(
      "const c=document.querySelector('#memberPage [data-theme-control]');c.value='system';c.dispatchEvent(new Event('change'))",
    );
    await check(
      "document.querySelector('.menu-theme select').value==='system'&&!document.querySelector('.menu-theme select').disabled",
      'My settings reflected in menu',
    );
    await evaluate(
      "const c=document.querySelector('#memberPage [data-a11y=links]');c.checked=false;c.dispatchEvent(new Event('change'))",
    );
    await check(
      "!document.querySelector('.menu-accessibility [data-a11y=links]').checked&&!document.querySelector('.menu-accessibility [data-a11y=links]').disabled",
      'My accessibility reflected in menu',
    );
    await evaluate("document.querySelector('#navToggle').click()");
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await check(
      "!document.body.classList.contains('menu-open')&&document.activeElement.id==='navToggle'",
      'Escape closes and restores focus',
    );
    await evaluate('__mock.admin(true)');
    await check(
      "!document.querySelector('#adminToggle').hidden",
      'verified admin path retained',
    );
    await evaluate('__mock.admin(false)');
    await check(
      "document.querySelector('#adminToggle').hidden",
      'permission loss hides admin path',
    );
    await evaluate('__mock.guest()');
    await check(
      "document.querySelector('.member-toggle-label').textContent==='로그인'",
      'guest header login',
    );
    assert.deepEqual(errors, []);
    console.log('MENU CHECKS COMPLETE');
  } finally {
    ws?.close();
    proc.kill();
    server.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
