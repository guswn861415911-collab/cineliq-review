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
        if (await evaluate(expression)) {
          console.log('PASS ' + label);
          return;
        }
        await new Promise((r) => setTimeout(r, 75));
      }
      throw Error(label + ' failed. ' + JSON.stringify(errors));
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp('Page.navigate', { url });
    await check(
      `document.querySelectorAll('.tech-card').length>=24&&document.querySelector('.member-toggle-label').textContent==='마이페이지'`,
      'catalog/member initialization',
    );
    await check(
      `document.querySelector('[data-registration-group]').hidden`,
      'non-admin registration hidden',
    );
    await evaluate(
      `document.querySelector('[data-type="image"]').click();document.querySelector('[data-type="video"]').click()`,
    );
    await check(
      `document.querySelectorAll('#mediaFilters [aria-pressed="true"]').length===1`,
      'image/video exclusive selection',
    );
    await check(
      `document.querySelector('#visibleCount').textContent==='137'&&document.querySelector('.tech-card').dataset.open==='CAM-105'`,
      'video filter contains video techniques only',
    );
    await evaluate(`document.querySelector('[data-type="image"]').click()`);
    await check(
      `document.querySelector('#visibleCount').textContent==='277'&&document.querySelector('.tech-card').dataset.open==='CAM-001'`,
      'image filter contains image techniques only',
    );
    await evaluate(
      `document.querySelector('#clearFilters').click();document.querySelector('.tech-card [data-favorite]').click()`,
    );
    await check(
      `document.querySelector('.folder-save-dialog').open&&!document.querySelector('[data-folder-commit]').disabled`,
      'card folder dialog without detail',
    );
    await check(
      `document.querySelector('#detailModal').hidden`,
      'folder action does not open detail',
    );
    await evaluate(
      `document.querySelector('.folder-save-list input:checked').checked=false;document.querySelector('.folder-save-create input').value='새 폴더';document.querySelector('[data-folder-create]').click()`,
    );
    await check(
      `document.querySelectorAll('.folder-save-list input:checked').length===1&&document.querySelector('.folder-save-list').textContent.includes('새 폴더')`,
      'new folder immediately selectable',
    );
    await evaluate(`document.querySelector('[data-folder-commit]').click()`);
    await check(
      `!document.querySelector('.folder-save-dialog').open`,
      'atomic membership save',
    );
    assert.equal(await evaluate(`__mock.data().favorites.length`), 120);
    await evaluate(`location.hash='#my/folders/11111111-1111-4111-8111-111111111111'`);
    await check(
      `document.querySelector('#memberCollectionList').textContent.includes('225')||document.querySelector('#memberCollectionList [data-open="CAM-225"]')!==null`,
      'non-bookmarked folder item retained',
    );
    await evaluate(`document.querySelector('[data-folder-add]').click()`);
    await check(`document.querySelector('#memberLibraryDialog').open`, 'bulk add dialog');
    await evaluate(`document.querySelector('[data-select-visible]').click()`);
    await check(
      `document.querySelectorAll('[data-library-choice]:checked').length===120`,
      'bulk all 120',
    );
    await evaluate(`document.querySelector('[data-library-choice]').click()`);
    await check(
      `document.querySelector('[data-select-visible]').indeterminate`,
      'partial selection indeterminate',
    );
    await evaluate(
      `document.querySelector('[data-clear-selection]').click();const q=document.querySelector('.bulk-selection [type=search]');q.value='Extreme';q.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-select-visible]').click()`,
    );
    await check(
      `document.querySelectorAll('[data-choice-row]:not([hidden])').length>0&&document.querySelectorAll('[data-library-choice]:checked').length===document.querySelectorAll('[data-choice-row]:not([hidden])').length`,
      'search-scoped bulk selection',
    );
    await evaluate(`document.querySelector('#saveMemberLibrary').click()`);
    await check(
      `!document.querySelector('#memberLibraryDialog').open`,
      'bulk persistence feedback',
    );
    await evaluate(`location.hash='#glossary?q=ECU'`);
    await check(
      `document.querySelector('.main-content').dataset.mobileView==='glossary'&&document.querySelector('.glossary-results').textContent.includes('Extreme Close')`,
      'glossary routing/abbreviation search',
    );
    await evaluate(
      `location.hash='#library';document.querySelector('#searchInput').value='중앙 구도';document.querySelector('#searchInput').dispatchEvent(new Event('input',{bubbles:true}))`,
    );
    await check(
      `document.querySelector('.tech-card [data-open]')!==null||document.querySelector('.tech-card')?.dataset.open==='CAM-040'`,
      'original Korean naming search',
    );
    await evaluate(`document.querySelector('.tech-card').click()`);
    await check(
      `document.querySelector('#detailTitle').textContent==='센터드 컴포지션'&&!document.querySelector('.detail-overline').textContent.includes('CAM-')`,
      'display name and hidden internal ID',
    );
    await check(
      `!document.querySelector('#detailBody').textContent.includes('기존 설명과 보충 기록 보기')`,
      'legacy accordion removed',
    );
    await evaluate(
      `const s=document.querySelector('.video-model-select');s.value='seedance';s.dispatchEvent(new Event('change'))`,
    );
    await check(
      `document.querySelector('.video-model-content').textContent.includes('전용 프롬프트 준비 중')&&!document.querySelector('[data-video-model-copy]')`,
      'unprepared model honest status',
    );
    await evaluate(
      `document.querySelector('#closeDetail').click();location.hash='#my/settings'`,
    );
    await check(
      `document.querySelector('[data-member-panel=settings]').hidden===false`,
      'settings route',
    );
    await evaluate(
      `const s=document.querySelector('[aria-label="화면 모드"]');s.value='light';s.dispatchEvent(new Event('change'))`,
    );
    await check(
      `document.documentElement.dataset.theme==='light'&&localStorage.getItem('cineliq.theme.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')==='light'`,
      'account theme persisted',
    );
    await evaluate(
      `const s=document.querySelector('[aria-label="화면 모드"]');s.value='system';s.dispatchEvent(new Event('change'))`,
    );
    await check(
      `document.documentElement.dataset.themePreference==='system'`,
      'system theme selected',
    );
    await cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'light' }],
    });
    await check(
      `document.documentElement.dataset.theme==='light'`,
      'system follows light',
    );
    await cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }],
    });
    await check(`document.documentElement.dataset.theme==='dark'`, 'system follows dark');
    await evaluate(
      `const s=document.querySelector('[aria-label="화면 모드"]');s.value='light';s.dispatchEvent(new Event('change'))`,
    );
    await check(
      `document.documentElement.dataset.theme==='light'`,
      'light screenshot preparation',
    );
    await cdp('Page.reload');
    await check(
      `document.documentElement.dataset.theme==='light'&&document.querySelector('.member-toggle-label').textContent==='마이페이지'`,
      'theme reload restoration',
    );
    await evaluate(`__mock.admin(true)`);
    await check(
      `!document.querySelector('[data-registration-group]').hidden`,
      'verified-admin filter branch',
    );
    await evaluate(`__mock.admin(false)`);
    await check(
      `document.querySelector('[data-registration-group]').hidden&&getComputedStyle(document.querySelector('[data-registration-group]')).display==='none'`,
      'permission loss hides admin branch',
    );
    for (const width of [1440, 768, 320]) {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      await evaluate(`location.hash='#library'`);
      await new Promise((r) => setTimeout(r, 1200));
      assert.ok(
        await evaluate(`document.documentElement.scrollWidth<=innerWidth`),
        'horizontal overflow ' + width,
      );
      const image = await cdp('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(
        path.join(root, 'work', 'upgrade-light-' + width + '.png'),
        Buffer.from(image.data, 'base64'),
      );
    }
    await evaluate(
      `__mock.guest();location.hash='#library';document.querySelector('.tech-card [data-favorite]').click()`,
    );
    await check(
      `document.querySelector('#memberDialog').open`,
      'guest folder action opens login',
    );
    await evaluate(
      "document.querySelector('#closeMemberAuth').click();location.hash='#my/accessibility'",
    );
    await check(
      "document.querySelector('[data-member-panel=accessibility]').hidden===false",
      'accessibility route',
    );
    assert.deepEqual(errors, []);
    console.log('BROWSER CHECKS COMPLETE');
  } finally {
    ws?.close();
    proc.kill();
    server.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
