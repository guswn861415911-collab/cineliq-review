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
      let data = await fs.readFile(resolved);
      if (file === '/tests/fixtures/member-cloud.js') {
        data = Buffer.from(
          data
            .toString()
            .replace(
              /catalog:\s*async\s*\(\)\s*=>\s*new Map\(\)/,
              "catalog:async()=>new Map(Array.from({length:4},(_,n)=>['CAM-00'+(n+1),Array.from({length:n===3?2:n+1},(_,j)=>({kind:'image',is_primary:j===0,url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1600\" height=\"900\"><rect width=\"1600\" height=\"900\" fill=\"'+['black','gray','white'][j]+'\"/></svg>')})).concat(n===3?[{kind:'video',url:'assets/cineliq-hero-pc.mp4'}]:[])]))",
            ),
        );
      }
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
    for (const width of [1440, 768, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      for (const count of [1, 2, 3]) {
        await evaluate(
          'document.querySelector(\'.tech-card[data-open="CAM-00' +
            count +
            '"] .card-title-open\').click()',
        );
        await check(
          "!document.querySelector('#detailModal').hidden",
          'open ' + count + ' images ' + width,
        );
        assert.equal(
          await evaluate("document.querySelectorAll('[data-image-stack]').length"),
          count > 1 ? 1 : 0,
        );
        if (count > 1) {
          assert.equal(
            await evaluate(
              "document.querySelectorAll('.image-stack-slide:not([hidden])').length",
            ),
            1,
          );
          const height = await evaluate(
              "document.querySelector('[data-image-stack]').getBoundingClientRect().height",
            ),
            scroll = await evaluate("document.querySelector('.detail-panel').scrollTop");
          await evaluate('document.querySelector(\'[data-image-step="1"]\').click()');
          await check(
            "document.querySelector('.image-stack-controls output').textContent==='2 / " +
              count +
              "'",
            'next image',
          );
          assert.equal(
            await evaluate(
              "document.querySelector('[data-image-stack]').getBoundingClientRect().height",
            ),
            height,
          );
          assert.equal(
            await evaluate("document.querySelector('.detail-panel').scrollTop"),
            scroll,
          );
          await evaluate(
            'document.querySelector(\'[data-image-step="-1"]\').click();document.querySelector(\'[data-image-step="-1"]\').click()',
          );
          await check(
            "document.querySelector('.image-stack-controls output').textContent==='" +
              count +
              ' / ' +
              count +
              "'",
            'wrap previous',
          );
          await evaluate("document.querySelector('[data-image-stack]').focus()");
          await cdp('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'ArrowRight',
            code: 'ArrowRight',
            windowsVirtualKeyCode: 39,
          });
          await cdp('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'ArrowRight',
            code: 'ArrowRight',
            windowsVirtualKeyCode: 39,
          });
          await check(
            "document.querySelector('.image-stack-controls output').textContent==='1 / " +
              count +
              "'",
            'keyboard image not technique',
          );
          assert.equal(
            await evaluate(
              "getComputedStyle(document.querySelector('.image-stack-slide img')).objectFit",
            ),
            'contain',
          );
          if (count === 3) {
            const shot = await cdp('Page.captureScreenshot', { format: 'png' });
            await fs.writeFile(
              path.join(root, 'work', 'image-stack-' + width + '.png'),
              Buffer.from(shot.data, 'base64'),
            );
          }
        }
        await evaluate("document.querySelector('#closeDetail').click()");
      }
    }
    await evaluate(
      'document.querySelector(\'.tech-card[data-open="CAM-004"] .card-title-open\').click()',
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('#detailBody .media-gallery video[controls]').length",
      ),
      1,
    );
    assert.equal(
      await evaluate("document.querySelectorAll('[data-image-stack]').length"),
      1,
    );
    await evaluate(
      "const t=document.querySelector('[data-image-stack]');t.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:t,clientX:200,clientY:100})],bubbles:true}));t.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[new Touch({identifier:1,target:t,clientX:100,clientY:105})],bubbles:true}))",
    );
    await check(
      "document.querySelector('.image-stack-controls output').textContent==='2 / 2'",
      'horizontal swipe',
    );
    await evaluate(
      "const t=document.querySelector('[data-image-stack]');t.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:t,clientX:200,clientY:100})],bubbles:true}));t.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[new Touch({identifier:1,target:t,clientX:190,clientY:230})],bubbles:true}))",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.image-stack-controls output').textContent",
      ),
      '2 / 2',
    );
    await evaluate("window.CINELIQ_A11Y.change('motion',true)");
    await check(
      "document.documentElement.dataset.reduceMotion==='true'",
      'reduced motion',
    );
    await evaluate('document.querySelector(\'[data-image-step="1"]\').click()');
    assert.equal(
      await evaluate(
        "document.querySelector('.image-stack-slide:not([hidden])').getAnimations().length",
      ),
      0,
    );
    assert.deepEqual(errors, []);
    console.log('CAROUSEL CHECKS COMPLETE');
  } finally {
    ws?.close();
    proc.kill();
    server.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
