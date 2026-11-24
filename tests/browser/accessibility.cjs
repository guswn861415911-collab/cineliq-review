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
    await evaluate("location.hash='#my/accessibility'");
    await check(
      "document.querySelector('[data-member-panel=accessibility]').hidden===false",
      'accessibility panel',
    );
    await evaluate(
      "const s=document.querySelector('#memberPage [data-a11y=textSize]');s.value='xlarge';s.dispatchEvent(new Event('change'))",
    );
    await check(
      "document.documentElement.dataset.textSize==='xlarge'&&!document.querySelector('#memberPage [data-a11y=textSize]').disabled",
      'large text saved',
    );
    for (const key of ['contrast', 'motion', 'links', 'captions']) {
      await evaluate(
        "const s=document.querySelector('#memberPage [data-a11y=" +
          key +
          "]');s.checked=true;s.dispatchEvent(new Event('change'))",
      );
      await check(
        "!document.querySelector('#memberPage [data-a11y=" + key + "]').disabled",
        key + ' saved',
      );
    }
    await check(
      "JSON.parse(localStorage.getItem('cineliq.a11y.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).captions===true&&document.documentElement.dataset.reduceMotion==='true'",
      'account preferences persisted',
    );
    await cdp('Page.reload');
    await check(
      "document.documentElement.dataset.textSize==='xlarge'&&document.documentElement.dataset.highContrast==='true'",
      'a11y reload restoration',
    );
    await evaluate(
      "const v=document.createElement('video');v.id='caption-test';document.body.append(v)",
    );
    await check(
      "document.querySelector('#caption-test').textTracks.length===0",
      'no fake captions on uncaptioned video',
    );
    await evaluate(
      "const v=document.querySelector('#caption-test');v.addTextTrack('captions','한국어','ko')",
    );
    await check(
      "document.querySelector('#caption-test').textTracks[0].mode==='showing'",
      'existing caption track preferred',
    );
    await evaluate(
      "document.querySelector('#caption-test').remove();location.hash='#library'",
    );
    await check(
      "document.querySelector('.tech-card .card-title-open')!==null",
      'keyboard library ready',
    );
    const key = async (value, extra = {}) => {
      extra = {
        ...({
          Enter: {
            code: 'Enter',
            windowsVirtualKeyCode: 13,
            text: '\r',
            unmodifiedText: '\r',
          },
          Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
          Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
          ' ': {
            code: 'Space',
            windowsVirtualKeyCode: 32,
            text: ' ',
            unmodifiedText: ' ',
          },
        }[value] || {}),
        ...extra,
      };
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: value, ...extra });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: value, ...extra });
    };
    await evaluate("document.querySelector('.card-title-open').focus()");
    await key('Enter');
    await check(
      "!document.querySelector('#detailModal').hidden&&document.activeElement.id==='closeDetail'",
      'keyboard Enter opens detail and focuses close',
    );
    await key('Tab');
    await check(
      "document.querySelector('#detailModal').contains(document.activeElement)",
      'detail Tab stays inside',
    );
    await key('Escape');
    await check(
      "document.querySelector('#detailModal').hidden&&document.activeElement.matches('.card-title-open')",
      'Escape closes and restores focus',
    );
    await evaluate("document.querySelector('.tech-card [data-favorite]').focus()");
    await key('Enter');
    await check(
      "document.querySelector('.folder-save-dialog').open&&document.activeElement.matches('.folder-save-list input')",
      'keyboard folder opens with choice focus',
    );
    const before = await evaluate('document.activeElement.checked');
    await key(' ');
    await check(
      'document.activeElement.checked!==' + before,
      'Space toggles folder checkbox',
    );
    await key('Escape');
    await check(
      "!document.querySelector('.folder-save-dialog').open&&document.activeElement.matches('[data-favorite]')",
      'folder Escape restores focus',
    );
    await evaluate("document.querySelector('#navToggle').focus()");
    await key('Enter');
    await check(
      "document.querySelector('#navToggle').getAttribute('aria-expanded')==='true'",
      'keyboard menu opens',
    );
    await key('Escape');
    await check(
      "document.activeElement.id==='navToggle'",
      'menu closes and restores focus',
    );
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 320,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await evaluate("location.hash='#my/accessibility'");
    await check(
      'document.documentElement.scrollWidth<=innerWidth',
      'large text high contrast 320px reflow',
    );
    let shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      path.join(root, 'work', 'accessibility-320.png'),
      Buffer.from(shot.data, 'base64'),
    );
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await evaluate(
      await fs.readFile(
        path.join(root, 'work', 'a11y-tools/node_modules/axe-core/axe.min.js'),
        'utf8',
      ),
    );
    const reports = [];
    for (const scenario of [
      { contrast: false, textSize: 'normal' },
      { contrast: true, textSize: 'xlarge' },
    ]) {
      await evaluate("CINELIQ_A11Y.change('contrast'," + scenario.contrast + ')');
      await check(
        "!document.querySelector('#memberPage [data-a11y=contrast]').disabled",
        'contrast scenario',
      );
      await evaluate("CINELIQ_A11Y.change('textSize','" + scenario.textSize + "')");
      await check(
        "!document.querySelector('#memberPage [data-a11y=textSize]').disabled",
        'text scenario',
      );
      for (const mode of ['dark', 'light']) {
        await evaluate("CINELIQ_THEME.change('" + mode + "')");
        await check(
          "document.documentElement.dataset.theme==='" + mode + "'",
          mode + ' a11y theme',
        );
        for (const view of ['#library', '#my/accessibility', '#glossary']) {
          await evaluate("location.hash='" + view + "'");
          await new Promise((r) => setTimeout(r, 150));
          const result = await evaluate(
            "axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,8)})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length,nodes:v.nodes.slice(0,3).map(n=>({target:n.target,summary:n.failureSummary}))}))}))",
          );
          reports.push({ scenario, mode, view, ...result });
        }
        for (const modal of ['detail', 'folder', 'bulk', 'login']) {
          await evaluate("location.hash='#library'");
          if (modal === 'detail')
            await evaluate("document.querySelector('.card-title-open').click()");
          if (modal === 'folder')
            await evaluate(
              "document.querySelector('.tech-card [data-favorite]').click()",
            );
          if (modal === 'bulk') {
            await evaluate(
              "location.hash='#my/folders/11111111-1111-4111-8111-111111111111'",
            );
            await check(
              "document.querySelector('[data-folder-add]')!==null",
              'bulk ready',
            );
            await evaluate("document.querySelector('[data-folder-add]').click()");
          }
          if (modal === 'login')
            await evaluate("document.querySelector('#memberGuestLogin').click()");
          await new Promise((r) => setTimeout(r, 150));
          const result = await evaluate(
            "axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,8)})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length,nodes:v.nodes.slice(0,3).map(n=>({target:n.target,summary:n.failureSummary}))}))}))",
          );
          reports.push({ scenario, mode, view: modal, ...result });
          if (modal === 'detail')
            await evaluate("document.querySelector('#closeDetail').click()");
          if (modal === 'folder')
            await evaluate("document.querySelector('[data-folder-cancel]').click()");
          if (modal === 'bulk')
            await evaluate("document.querySelector('#cancelMemberLibrary').click()");
          if (modal === 'login')
            await evaluate("document.querySelector('#closeMemberAuth').click()");
        }
      }
    }
    await fs.writeFile(
      path.join(root, 'work', 'axe-report.json'),
      JSON.stringify(reports, null, 2),
    );
    console.log(
      JSON.stringify(
        reports.map((r) => ({
          scenario: r.scenario,
          mode: r.mode,
          view: r.view,
          violations: r.violations.length,
          incomplete: r.incomplete,
        })),
      ),
    );
    assert.ok(
      reports.every((r) => !r.violations.length),
      'axe confirmed violations',
    );
    assert.deepEqual(errors, []);
    console.log('ACCESSIBILITY BROWSER CHECKS COMPLETE');
  } finally {
    ws?.close();
    proc.kill();
    server.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
